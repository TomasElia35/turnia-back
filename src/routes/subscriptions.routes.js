import { Router } from 'express';
import { one, many } from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { mapSubscription, mapPlan } from '../utils/map.js';

const router = Router();

// GET /api/subscriptions/plans — catálogo público
router.get('/plans', asyncHandler(async (req, res) => {
  const rows = await many('select * from plans order by monthly_price', []);
  res.json(rows.map(mapPlan));
}));

// GET /api/subscriptions — solo superadmin (con nombre de negocio + datos del plan)
router.get('/', requireAuth, requireRole('superadmin'), asyncHandler(async (req, res) => {
  const rows = await many(
    `select s.*, b.name as business_name,
            p.monthly_price, p.annual_price
       from subscriptions s
       join businesses b on b.id = s.business_id
       join plans p on p.id = s.plan_id
       order by b.name`, []
  );
  // mapSubscription usa s.monthly_price/annual_price si vienen; los traemos del plan.
  res.json(rows.map(mapSubscription));
}));

// PATCH /api/subscriptions/:id — solo superadmin
router.patch('/:id', requireAuth, requireRole('superadmin'), asyncHandler(async (req, res) => {
  const b = req.body;
  const row = await one(
    `update subscriptions set
       plan_id = coalesce($2, plan_id),
       billing_cycle = coalesce($3, billing_cycle),
       status = coalesce($4, status),
       next_billing_date = coalesce($5, next_billing_date),
       payment_method = coalesce($6, payment_method),
       contact_email = coalesce($7, contact_email),
       notes = coalesce($8, notes)
     where id = $1 returning *`,
    [req.params.id, b.plan, b.billingCycle, b.status, b.nextBillingDate, b.paymentMethod, b.contactEmail, b.notes]
  );
  if (!row) return res.status(404).json({ error: 'Suscripción no encontrada.' });
  // Releer con datos del plan para devolver precios actualizados
  const full = await one(
    `select s.*, b.name as business_name, p.monthly_price, p.annual_price
       from subscriptions s join businesses b on b.id = s.business_id
       join plans p on p.id = s.plan_id where s.id = $1`, [row.id]
  );
  res.json(mapSubscription(full));
}));

export default router;
