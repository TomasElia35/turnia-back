import { Router } from 'express';
import { one, many, query } from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { mapBooking } from '../utils/map.js';
import { slotsForDate, isWithinAvailability, DEFAULT_SLOTS } from '../utils/availability.js';

const router = Router();

// SELECT base que produce las columnas que espera mapBooking().
const BOOKING_SELECT = `
  select b.*,
    d.amount as deposit_amount, d.paid as deposit_paid,
    d.confirmed_by_admin as deposit_confirmed, d.refunded as deposit_refunded,
    p.amount as payment_amount, p.method as payment_method, p.paid_at as payment_paid_at,
    cr.requested_at as cancel_requested_at, cr.reason as cancel_reason,
    rv.rating as review_rating, rv.comment as review_comment
  from bookings b
  left join deposits d on d.booking_id = b.id
  left join lateral (
    select amount, method, paid_at from payments where booking_id = b.id order by paid_at desc limit 1
  ) p on true
  left join cancellation_requests cr on cr.booking_id = b.id and cr.resolved = false
  left join reviews rv on rv.booking_id = b.id
`;

// GET /api/bookings?businessId=&date=&from=&to=&professionalId=
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const { businessId, date, from, to, professionalId } = req.query;
  const conds = [];
  const params = [];
  const add = (sql, val) => { params.push(val); conds.push(sql.replace('?', `$${params.length}`)); };
  if (businessId) add('b.business_id = ?', businessId);
  if (date) add('b.booking_date = ?', date);
  if (from) add('b.booking_date >= ?', from);
  if (to) add('b.booking_date <= ?', to);
  if (professionalId) add('b.professional_id = ?', professionalId);

  // El empleado solo puede ver SUS turnos (los de su profesional). Se fuerza en el backend.
  if (req.user.role === 'employee') {
    const prof = await one('select id from professionals where user_id = $1', [req.user.id]);
    if (!prof) return res.json([]);
    add('b.professional_id = ?', prof.id);
  }

  const where = conds.length ? `where ${conds.join(' and ')}` : '';
  const rows = await many(`${BOOKING_SELECT} ${where} order by b.booking_date, b.booking_time`, params);
  res.json(rows.map(mapBooking));
}));

// GET /api/bookings/mine — turnos del cliente autenticado
router.get('/mine', requireAuth, asyncHandler(async (req, res) => {
  const rows = await many(`${BOOKING_SELECT} where b.client_id = $1 order by b.booking_date desc`, [req.user.id]);
  res.json(rows.map(mapBooking));
}));

// GET /api/bookings/availability?businessId=&date=&professionalId=
// Devuelve { slots, busy }:
//   • slots: horarios que el profesional atiende esa fecha (según su disponibilidad).
//   • busy:  intervalos ya ocupados (hora + duración), sin datos de clientes.
// Público: lo usa el asistente de reserva para mostrar y marcar horarios.
router.get('/availability', asyncHandler(async (req, res) => {
  const { businessId, date, professionalId } = req.query;
  if (!businessId || !date) return res.json({ slots: [], busy: [] });

  const conds = ['b.business_id = $1', 'b.booking_date = $2', "b.status <> 'cancelled'"];
  const params = [businessId, date];
  if (professionalId) { params.push(professionalId); conds.push(`b.professional_id = $${params.length}`); }
  const rows = await many(
    `select b.booking_time, coalesce(s.duration, 60) as duration
       from bookings b left join services s on s.id = b.service_id
      where ${conds.join(' and ')}`,
    params
  );
  const busy = rows.map(r => ({ time: r.booking_time, duration: r.duration }));

  // Slots según la disponibilidad del profesional (o DEFAULT_SLOTS si no se eligió uno).
  let slots = [...DEFAULT_SLOTS];
  if (professionalId) {
    const prof = await one('select availability from professionals where id = $1', [professionalId]);
    slots = slotsForDate(prof?.availability, date);
  }
  res.json({ slots, busy });
}));

// Chequeo de solapamiento para un profesional/fecha.
async function hasConflict(businessId, professionalId, date, time, durationMin) {
  if (!professionalId) return false;
  const dayBookings = await many(
    `select b.booking_time, coalesce(s.duration, 60) as duration
       from bookings b left join services s on s.id = b.service_id
      where b.business_id = $1 and b.professional_id = $2 and b.booking_date = $3 and b.status <> 'cancelled'`,
    [businessId, professionalId, date]
  );
  const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
  const start = toMin(time);
  const end = start + (durationMin || 60);
  return dayBookings.some((b) => {
    const bStart = toMin(b.booking_time);
    const bEnd = bStart + (b.duration || 60);
    return start < bEnd && end > bStart;
  });
}

// POST /api/bookings — crear turno (cliente para sí; staff para cualquier cliente)
router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const b = req.body;

  // No permitir turnos en fechas pasadas.
  const bDate = b.date || b.booking_date;
  const businessId = b.salonId || b.business_id;
  const todayStr = new Date().toISOString().split('T')[0];
  if (bDate && bDate < todayStr) {
    return res.status(400).json({ error: 'No se pueden crear turnos en fechas pasadas.' });
  }

  // Un cliente no puede tener más de un turno por día en el mismo local.
  // (El staff sí puede cargar varios, es mostrador.)
  if (req.user.role === 'client') {
    const existing = await one(
      `select id from bookings
        where client_id = $1 and business_id = $2 and booking_date = $3 and status <> 'cancelled'`,
      [req.user.id, businessId, bDate]
    );
    if (existing) {
      return res.status(409).json({
        code: 'ALREADY_BOOKED',
        error: 'Ya tenés un turno reservado para este día en este local. Para coordinar otro, comunicate directamente con el local.',
      });
    }
  }

  let duration = 60;
  if (b.serviceId || b.service_id) {
    const svc = await one('select duration from services where id = $1', [b.serviceId || b.service_id]);
    duration = svc?.duration || 60;
  }
  const profId = b.professionalId || b.professional_id || null;
  const bTime = b.time || b.booking_time;

  // El horario debe caer dentro de la ventana de disponibilidad del profesional
  // para esa fecha (si el profesional ya configuró su disponibilidad).
  if (profId) {
    const prof = await one('select availability from professionals where id = $1', [profId]);
    if (!isWithinAvailability(prof?.availability, bDate, bTime)) {
      return res.status(409).json({ error: 'El profesional no atiende en ese horario. Elegí otro turno disponible.' });
    }
  }

  if (await hasConflict(b.salonId || b.business_id, profId, bDate, bTime, duration)) {
    return res.status(409).json({ error: 'El horario ya está ocupado para ese profesional.' });
  }

  const booking = await one(
    `insert into bookings (business_id, service_id, professional_id, client_id, client_name, client_phone, client_email,
       booking_date, booking_time, status, discount_type, discount_value, notes)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
    [
      b.salonId || b.business_id, b.serviceId || b.service_id || null, profId,
      req.user.role === 'client' ? req.user.id : (b.clientId || b.client_id || null),
      b.clientName || req.user.email, b.clientPhone || '', b.clientEmail || '',
      b.date || b.booking_date, b.time || b.booking_time, b.status || 'confirmed',
      b.discount?.type || null, b.discount?.value || null, b.notes || '',
    ]
  );

  if (b.deposit) {
    await query(
      'insert into deposits (booking_id, amount, paid, confirmed_by_admin) values ($1,$2,$3,false)',
      [booking.id, b.deposit.amount || 0, !!b.deposit.paid]
    );
  }
  const full = await one(`${BOOKING_SELECT} where b.id = $1`, [booking.id]);
  res.status(201).json(mapBooking(full));
}));

// PATCH /api/bookings/:id — cambiar estado/datos (staff)
router.patch('/:id', requireAuth, requireRole('admin', 'employee', 'superadmin'), asyncHandler(async (req, res) => {
  const b = req.body;
  await one(
    `update bookings set status = coalesce($2,status), notes = coalesce($3,notes),
       professional_id = coalesce($4,professional_id) where id = $1 returning id`,
    [req.params.id, b.status, b.notes, b.professionalId || b.professional_id]
  );
  const full = await one(`${BOOKING_SELECT} where b.id = $1`, [req.params.id]);
  if (!full) return res.status(404).json({ error: 'Turno no encontrado.' });
  res.json(mapBooking(full));
}));

// POST /api/bookings/:id/payment — registrar cobro y completar.
// La comisión se CONGELA acá: % (override por servicio o base del profesional) y monto,
// calculados sobre el importe final cobrado (ya con descuento aplicado).
router.post('/:id/payment', requireAuth, requireRole('admin', 'employee', 'superadmin'), asyncHandler(async (req, res) => {
  const { amount, method } = req.body;

  const bk = await one('select professional_id, service_id from bookings where id = $1', [req.params.id]);
  if (!bk) return res.status(404).json({ error: 'Turno no encontrado.' });

  let commissionPercent = null;
  let commissionAmount = null;
  const profId = bk.professional_id || null;
  if (profId) {
    const prof = await one('select commission from professionals where id = $1', [profId]);
    let percent = prof?.commission ?? 0;
    if (bk.service_id) {
      const ov = await one(
        'select commission_override from professional_services where professional_id = $1 and service_id = $2',
        [profId, bk.service_id]
      );
      if (ov && ov.commission_override != null) percent = ov.commission_override;
    }
    commissionPercent = percent;
    commissionAmount = Math.round((Number(amount) || 0) * percent / 100);
  }

  await query(
    'insert into payments (booking_id, amount, method, professional_id, commission_percent, commission_amount) values ($1,$2,$3,$4,$5,$6)',
    [req.params.id, amount, method, profId, commissionPercent, commissionAmount]
  );
  await query("update bookings set status = 'completed' where id = $1", [req.params.id]);
  const full = await one(`${BOOKING_SELECT} where b.id = $1`, [req.params.id]);
  res.status(201).json(mapBooking(full));
}));

// POST /api/bookings/:id/confirm-deposit — confirmar recepción de seña (staff)
router.post('/:id/confirm-deposit', requireAuth, requireRole('admin', 'employee', 'superadmin'), asyncHandler(async (req, res) => {
  await query('update deposits set confirmed_by_admin = true where booking_id = $1', [req.params.id]);
  const full = await one(`${BOOKING_SELECT} where b.id = $1`, [req.params.id]);
  res.json(mapBooking(full));
}));

// POST /api/bookings/:id/declare-deposit — el cliente (o staff) marca la seña como pagada.
// Queda pendiente de confirmación por el local (confirmed_by_admin).
router.post('/:id/declare-deposit', requireAuth, asyncHandler(async (req, res) => {
  const bk = await one('select client_id from bookings where id = $1', [req.params.id]);
  if (!bk) return res.status(404).json({ error: 'Turno no encontrado.' });
  const isOwner = bk.client_id && String(bk.client_id) === String(req.user.id);
  const isStaff = ['admin', 'employee', 'superadmin'].includes(req.user.role);
  if (!isOwner && !isStaff) return res.status(403).json({ error: 'No autorizado.' });

  const dep = await one('update deposits set paid = true where booking_id = $1 returning booking_id', [req.params.id]);
  if (!dep) return res.status(400).json({ error: 'Este turno no requiere seña.' });

  const full = await one(`${BOOKING_SELECT} where b.id = $1`, [req.params.id]);
  res.json(mapBooking(full));
}));

// POST /api/bookings/:id/cancel-request — cliente solicita cancelación
router.post('/:id/cancel-request', requireAuth, asyncHandler(async (req, res) => {
  await query('insert into cancellation_requests (booking_id, reason) values ($1,$2)', [req.params.id, req.body.reason || '']);
  const full = await one(`${BOOKING_SELECT} where b.id = $1`, [req.params.id]);
  res.status(201).json(mapBooking(full));
}));

// POST /api/bookings/:id/cancel — cancelación directa (cliente dueño del turno o staff)
router.post('/:id/cancel', requireAuth, asyncHandler(async (req, res) => {
  const bk = await one('select client_id from bookings where id = $1', [req.params.id]);
  if (!bk) return res.status(404).json({ error: 'Turno no encontrado.' });
  const isOwner = bk.client_id && String(bk.client_id) === String(req.user.id);
  const isStaff = ['admin', 'employee', 'superadmin'].includes(req.user.role);
  if (!isOwner && !isStaff) return res.status(403).json({ error: 'No autorizado.' });

  await query("update bookings set status = 'cancelled' where id = $1", [req.params.id]);
  const full = await one(`${BOOKING_SELECT} where b.id = $1`, [req.params.id]);
  res.json(mapBooking(full));
}));

// POST /api/bookings/:id/resolve-cancel — staff resuelve (cancel_refund | cancel_no_refund | reject)
router.post('/:id/resolve-cancel', requireAuth, requireRole('admin', 'employee', 'superadmin'), asyncHandler(async (req, res) => {
  const { action } = req.body;
  await query('update cancellation_requests set resolved = true where booking_id = $1', [req.params.id]);
  if (action === 'reject') {
    // Rechazada: el turno sigue activo y el cliente ya no puede volver a solicitar cancelación.
    await query('update bookings set cancel_rejected = true where id = $1', [req.params.id]);
  } else {
    await query("update bookings set status = 'cancelled' where id = $1", [req.params.id]);
    await query('update deposits set refunded = $2 where booking_id = $1', [req.params.id, action === 'cancel_refund']);
  }
  const full = await one(`${BOOKING_SELECT} where b.id = $1`, [req.params.id]);
  res.json(mapBooking(full));
}));

export default router;
