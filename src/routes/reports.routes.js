import { Router } from 'express';
import { one, many, query } from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// Rango por defecto: hoy.
function range(req) {
  const today = new Date().toISOString().split('T')[0];
  const from = req.query.from || req.query.date || today;
  const to = req.query.to || req.query.date || today;
  return { from, to };
}

// El admin solo puede pedir reportes de SU negocio; el superadmin, de cualquiera.
function resolveBusinessId(req) {
  if (req.user.role === 'superadmin') return req.query.businessId || req.user.businessId;
  return req.user.businessId;
}

// GET /api/reports/commissions?businessId=&from=&to=
// Comisiones por empleado (servicios + productos según config), con lo ya rendido y lo pendiente.
router.get('/commissions', requireAuth, requireRole('admin', 'superadmin'), asyncHandler(async (req, res) => {
  const businessId = resolveBusinessId(req);
  if (!businessId) return res.json({ from: null, to: null, rows: [], totals: {} });
  const { from, to } = range(req);

  const biz = await one('select commission_on_products from businesses where id = $1', [businessId]);
  const commissionOnProducts = !!biz?.commission_on_products;

  const [profs, payRows, saleRows, payoutRows] = await Promise.all([
    many('select id, name, commission from professionals where business_id = $1', [businessId]),
    many(
      `select p.professional_id,
              count(*)::int                       as services_count,
              coalesce(sum(p.amount),0)::int      as generated,
              coalesce(sum(p.commission_amount),0)::int as service_commission
         from payments p
         join bookings b on b.id = p.booking_id
        where b.business_id = $1 and p.paid_at::date between $2 and $3
        group by p.professional_id`,
      [businessId, from, to]
    ),
    many(
      `select professional_id,
              coalesce(sum(total_price),0)::int as product_total,
              coalesce(sum(quantity),0)::int    as product_units
         from product_sales
        where business_id = $1 and sale_date between $2 and $3
        group by professional_id`,
      [businessId, from, to]
    ),
    many(
      `select professional_id, coalesce(sum(amount),0)::int as paid
         from commission_payouts
        where business_id = $1 and paid_at::date between $2 and $3
        group by professional_id`,
      [businessId, from, to]
    ),
  ]);

  const payByProf = new Map(payRows.map(r => [String(r.professional_id), r]));
  const saleByProf = new Map(saleRows.map(r => [String(r.professional_id), r]));
  const paidByProf = new Map(payoutRows.map(r => [String(r.professional_id), r.paid]));

  const rows = profs.map(pr => {
    const key = String(pr.id);
    const pay = payByProf.get(key) || {};
    const sale = saleByProf.get(key) || {};
    const serviceCommission = pay.service_commission || 0;
    const productTotal = sale.product_total || 0;
    const productCommission = commissionOnProducts ? Math.round(productTotal * (pr.commission || 0) / 100) : 0;
    const commission = serviceCommission + productCommission;
    const paid = paidByProf.get(key) || 0;
    return {
      professionalId: pr.id,
      professionalName: pr.name,
      commissionPercent: pr.commission,
      servicesCount: pay.services_count || 0,
      generated: pay.generated || 0,
      serviceCommission,
      productTotal,
      productUnits: sale.product_units || 0,
      productCommission,
      commission,
      paid,
      pending: commission - paid,
    };
  }).sort((a, b) => b.commission - a.commission);

  const totals = rows.reduce((t, r) => ({
    generated: t.generated + r.generated,
    commission: t.commission + r.commission,
    productTotal: t.productTotal + r.productTotal,
    paid: t.paid + r.paid,
    pending: t.pending + r.pending,
  }), { generated: 0, commission: 0, productTotal: 0, paid: 0, pending: 0 });

  res.json({ from, to, commissionOnProducts, rows, totals });
}));

// GET /api/reports/discounts?businessId=&from=&to=
// Detalle de descuentos aplicados (control minucioso para el admin).
router.get('/discounts', requireAuth, requireRole('admin', 'superadmin'), asyncHandler(async (req, res) => {
  const businessId = resolveBusinessId(req);
  if (!businessId) return res.json([]);
  const { from, to } = range(req);

  const rows = await many(
    `select b.id, b.client_name, b.booking_date, b.discount_type, b.discount_value,
            s.name as service_name, s.price as service_price,
            pr.name as professional_name,
            p.amount as charged
       from bookings b
       left join services s on s.id = b.service_id
       left join professionals pr on pr.id = b.professional_id
       left join lateral (
         select amount from payments where booking_id = b.id order by paid_at desc limit 1
       ) p on true
      where b.business_id = $1 and b.discount_type is not null
        and b.booking_date between $2 and $3
      order by b.booking_date desc`,
    [businessId, from, to]
  );

  res.json(rows.map(r => {
    const price = r.service_price || 0;
    const discountAmount = r.discount_type === 'percent'
      ? Math.round(price * (r.discount_value || 0) / 100)
      : (r.discount_value || 0);
    return {
      bookingId: r.id,
      clientName: r.client_name,
      date: r.booking_date instanceof Date ? r.booking_date.toISOString().split('T')[0] : r.booking_date,
      serviceName: r.service_name,
      servicePrice: price,
      professionalName: r.professional_name,
      discountType: r.discount_type,
      discountValue: r.discount_value,
      discountAmount,
      charged: r.charged,
    };
  }));
}));

// GET /api/reports/payouts?businessId=&from=&to=&professionalId=
router.get('/payouts', requireAuth, requireRole('admin', 'superadmin'), asyncHandler(async (req, res) => {
  const businessId = resolveBusinessId(req);
  if (!businessId) return res.json([]);
  const { professionalId } = req.query;
  const conds = ['cp.business_id = $1'];
  const params = [businessId];
  if (professionalId) { params.push(professionalId); conds.push(`cp.professional_id = $${params.length}`); }
  const rows = await many(
    `select cp.*, pr.name as professional_name
       from commission_payouts cp
       left join professionals pr on pr.id = cp.professional_id
      where ${conds.join(' and ')}
      order by cp.paid_at desc`,
    params
  );
  res.json(rows.map(r => ({
    id: r.id,
    professionalId: r.professional_id,
    professionalName: r.professional_name,
    amount: r.amount,
    note: r.note,
    periodFrom: r.period_from instanceof Date ? r.period_from.toISOString().split('T')[0] : r.period_from,
    periodTo: r.period_to instanceof Date ? r.period_to.toISOString().split('T')[0] : r.period_to,
    paidAt: r.paid_at,
  })));
}));

// POST /api/reports/payouts — marcar comisión como rendido (registro simple, sin caja)
router.post('/payouts', requireAuth, requireRole('admin', 'superadmin'), asyncHandler(async (req, res) => {
  const b = req.body;
  const businessId = req.user.role === 'superadmin' ? (b.businessId || req.user.businessId) : req.user.businessId;
  if (!businessId || !b.professionalId || b.amount == null) {
    return res.status(400).json({ error: 'Faltan datos (negocio, profesional o monto).' });
  }
  const row = await one(
    `insert into commission_payouts (business_id, professional_id, amount, note, period_from, period_to, created_by)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [businessId, b.professionalId, Math.round(b.amount), b.note || null, b.periodFrom || null, b.periodTo || null, req.user.id]
  );
  res.status(201).json({ id: row.id, amount: row.amount, paidAt: row.paid_at });
}));

export default router;
