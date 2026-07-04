import { Router } from 'express';
import { one, many } from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { mapService } from '../utils/map.js';

const router = Router();

// Verifica propiedad del negocio. Si el token no trae businessId (token viejo),
// lo resuelve desde la DB para no bloquear indebidamente.
async function ownsBusiness(req, businessId) {
  if (req.user.role === 'superadmin') return true;
  let bid = req.user.businessId;
  if (!bid) {
    const u = await one('select business_id from users where id = $1', [req.user.id]);
    bid = u?.business_id;
  }
  return String(bid) === String(businessId);
}

// GET /api/services?businessId=...
router.get('/', asyncHandler(async (req, res) => {
  const { businessId } = req.query;
  const rows = businessId
    ? await many('select * from services where business_id = $1 order by category, name', [businessId])
    : await many('select * from services order by category, name', []);
  res.json(rows.map(mapService));
}));

// POST /api/services
router.post('/', requireAuth, requireRole('admin', 'superadmin'), asyncHandler(async (req, res) => {
  const b = req.body;
  const businessId = b.business_id || b.businessId;
  if (!(await ownsBusiness(req, businessId))) return res.status(403).json({ error: 'Negocio ajeno.' });
  const row = await one(
    'insert into services (business_id, category, name, duration, price) values ($1,$2,$3,$4,$5) returning *',
    [businessId, b.category, b.name, b.duration, b.price]
  );
  res.status(201).json(mapService(row));
}));

// PATCH /api/services/:id
router.patch('/:id', requireAuth, requireRole('admin', 'superadmin'), asyncHandler(async (req, res) => {
  const b = req.body;
  const row = await one(
    `update services set category = coalesce($2,category), name = coalesce($3,name),
       duration = coalesce($4,duration), price = coalesce($5,price) where id = $1 returning *`,
    [req.params.id, b.category, b.name, b.duration, b.price]
  );
  if (!row) return res.status(404).json({ error: 'Servicio no encontrado.' });
  res.json(mapService(row));
}));

// DELETE /api/services/:id
router.delete('/:id', requireAuth, requireRole('admin', 'superadmin'), asyncHandler(async (req, res) => {
  await one('delete from services where id = $1 returning id', [req.params.id]);
  res.json({ success: true });
}));

export default router;
