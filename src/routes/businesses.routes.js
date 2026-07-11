import { Router } from 'express';
import { one, many, query } from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { mapBusiness, mapProfessional } from '../utils/map.js';

const router = Router();

// Arma un negocio completo (con services/professionals/products) a partir de su id.
async function assembleBusiness(bizRow) {
  const [services, profRows, products, assignments] = await Promise.all([
    many('select * from services where business_id = $1 order by category, name', [bizRow.id]),
    many('select * from professionals where business_id = $1 order by name', [bizRow.id]),
    many('select * from products where business_id = $1 order by name', [bizRow.id]),
    many(
      `select ps.* from professional_services ps
       join professionals p on p.id = ps.professional_id
       where p.business_id = $1`,
      [bizRow.id]
    ),
  ]);
  const professionals = profRows.map((p) =>
    mapProfessional(p, assignments.filter((a) => a.professional_id === p.id))
  );
  return mapBusiness(bizRow, { services, professionals, products });
}

// GET /api/businesses — listado público (landing / búsqueda)
router.get('/', asyncHandler(async (req, res) => {
  const rows = await many(
    'select * from businesses where is_active = true order by featured desc, featured_rank desc, name',
    []
  );
  const result = await Promise.all(rows.map(assembleBusiness));
  res.json(result);
}));

// GET /api/businesses/:id — detalle público
router.get('/:id', asyncHandler(async (req, res) => {
  const biz = await one('select * from businesses where id = $1', [req.params.id]);
  if (!biz) return res.status(404).json({ error: 'Negocio no encontrado.' });
  res.json(await assembleBusiness(biz));
}));

// POST /api/businesses — alta (solo superadmin)
router.post('/', requireAuth, requireRole('superadmin'), asyncHandler(async (req, res) => {
  const b = req.body;
  const biz = await one(
    `insert into businesses (name, address, phone, email, instagram, whatsapp, photo_url, description, categories, open_days, open_hours, theme_color, is_active)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, coalesce($13,true)) returning *`,
    [b.name, b.address, b.phone, b.email, b.instagram, b.whatsapp, b.photo || b.photo_url, b.description,
     b.categories || [], b.openDays || b.open_days || [], b.openHours || b.open_hours, b.themeColor || b.theme_color, b.isActive]
  );

  // Crear suscripción por defecto al crear el emprendimiento
  const defaultPlan = await one(`select id from plans where name = 'Pro' limit 1`);
  if (defaultPlan) {
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    await one(
      `insert into subscriptions (business_id, plan_id, status, billing_cycle, next_billing_date)
       values ($1, $2, 'active', 'monthly', $3) returning id`,
      [biz.id, defaultPlan.id, nextMonth]
    );
  }

  res.status(201).json(await assembleBusiness(biz));
}));

// PATCH /api/businesses/:id — editar (admin del negocio o superadmin)
router.patch('/:id', requireAuth, requireRole('admin', 'superadmin'), asyncHandler(async (req, res) => {
  if (req.user.role === 'admin' && String(req.user.businessId) !== String(req.params.id)) {
    return res.status(403).json({ error: 'Solo podés editar tu propio negocio.' });
  }
  const b = req.body;
  const biz = await one(
    `update businesses set
       name = coalesce($2,name), address = coalesce($3,address), phone = coalesce($4,phone),
       email = coalesce($5,email), instagram = coalesce($6,instagram), whatsapp = coalesce($7,whatsapp),
       photo_url = coalesce($8,photo_url), description = coalesce($9,description),
       open_hours = coalesce($10,open_hours), theme_color = coalesce($11,theme_color),
       deposit_required = coalesce($12,deposit_required), deposit_amount = coalesce($13,deposit_amount),
       deposit_alias = coalesce($14,deposit_alias), deposit_policy = coalesce($15,deposit_policy),
       promo_active = coalesce($16,promo_active), promo_title = coalesce($17,promo_title),
       promo_description = coalesce($18,promo_description),
       is_active = coalesce($19,is_active), admin_id = coalesce($20,admin_id),
       deposit_allow_direct_cancel = coalesce($21,deposit_allow_direct_cancel),
       commission_on_products = coalesce($22,commission_on_products)
     where id = $1 returning *`,
    [req.params.id, b.name, b.address, b.phone, b.email, b.instagram, b.whatsapp,
     b.photo || b.photo_url, b.description, b.openHours || b.open_hours, b.themeColor || b.theme_color,
     b.depositConfig?.required, b.depositConfig?.amount, b.depositConfig?.alias, b.depositConfig?.policy,
     b.promotionModal?.active, b.promotionModal?.title, b.promotionModal?.description,
     b.isActive ?? b.is_active, b.adminId ?? b.admin_id,
     b.depositConfig?.allowDirectCancelWithout ?? b.depositConfig?.allowDirectCancel ?? b.allowDirectCancel,
     b.commissionOnProducts ?? b.commission_on_products]
  );
  if (!biz) return res.status(404).json({ error: 'Negocio no encontrado.' });

  // Sincronizar el vínculo inverso: el admin asignado debe tener business_id = este negocio.
  const adminId = b.adminId ?? b.admin_id;
  if (adminId) {
    await query('update users set business_id = $1 where id = $2', [biz.id, adminId]);
  }

  res.json(await assembleBusiness(biz));
}));
// PATCH /api/businesses/:id/featured — destacar en el marketplace (solo superadmin)
router.patch('/:id/featured', requireAuth, requireRole('superadmin'), asyncHandler(async (req, res) => {
  const { featured, featuredRank } = req.body;
  const biz = await one(
    `update businesses set featured = coalesce($2, featured), featured_rank = coalesce($3, featured_rank)
     where id = $1 returning *`,
    [req.params.id, featured, featuredRank]
  );
  if (!biz) return res.status(404).json({ error: 'Negocio no encontrado.' });
  res.json(await assembleBusiness(biz));
}));

// DELETE /api/businesses/:id — eliminar (solo superadmin)
router.delete('/:id', requireAuth, requireRole('superadmin'), asyncHandler(async (req, res) => {
  const row = await one('delete from businesses where id = $1 returning id', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Negocio no encontrado.' });
  res.json({ success: true });
}));

export default router;
