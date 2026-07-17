import { Router } from 'express';
import { one, many, query } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// Recalcula el promedio y la cantidad de reseñas del negocio.
async function recomputeBusinessRating(businessId) {
  await query(
    `update businesses set
       rating  = coalesce((select round(avg(rating)::numeric, 1) from reviews where business_id = $1), 0),
       reviews = (select count(*) from reviews where business_id = $1)
     where id = $1`,
    [businessId]
  );
}

// GET /api/reviews?businessId=... — público: lista de reseñas del negocio (más nuevas primero).
router.get('/', asyncHandler(async (req, res) => {
  const { businessId } = req.query;
  if (!businessId) return res.json([]);
  const rows = await many(
    `select r.id, r.rating, r.comment, r.created_at,
            coalesce(nullif(trim(u.name), ''), 'Cliente') as client_name
       from reviews r
       left join users u on u.id = r.client_id
      where r.business_id = $1
      order by r.created_at desc`,
    [businessId]
  );
  res.json(rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment || '',
    clientName: r.client_name,
    createdAt: r.created_at,
  })));
}));

// POST /api/reviews — el cliente califica un turno propio que ya pasó.
// body: { bookingId, rating (1-5), comment? }
router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const { bookingId, rating, comment } = req.body;
  const r = Number(rating);
  if (!bookingId) return res.status(400).json({ error: 'Falta el turno a calificar.' });
  if (!Number.isInteger(r) || r < 1 || r > 5) {
    return res.status(400).json({ error: 'La calificación debe ser de 1 a 5 estrellas.' });
  }

  const bk = await one(
    'select id, business_id, client_id, booking_date, status from bookings where id = $1',
    [bookingId]
  );
  if (!bk) return res.status(404).json({ error: 'Turno no encontrado.' });
  if (String(bk.client_id) !== String(req.user.id)) {
    return res.status(403).json({ error: 'Solo podés calificar tus propios turnos.' });
  }
  if (!['confirmed', 'completed'].includes(bk.status)) {
    return res.status(400).json({ error: 'Este turno no se puede calificar.' });
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const bDate = bk.booking_date instanceof Date
    ? bk.booking_date.toISOString().split('T')[0]
    : bk.booking_date;
  if (!(bDate < todayStr)) {
    return res.status(400).json({ error: 'Vas a poder calificar este turno una vez que haya pasado.' });
  }

  const existing = await one('select id from reviews where booking_id = $1', [bookingId]);
  if (existing) return res.status(409).json({ error: 'Ya calificaste este turno.' });

  const review = await one(
    `insert into reviews (business_id, booking_id, client_id, rating, comment)
     values ($1,$2,$3,$4,$5) returning id, rating, comment`,
    [bk.business_id, bookingId, req.user.id, r, (comment || '').trim()]
  );
  await recomputeBusinessRating(bk.business_id);

  res.status(201).json({ id: review.id, rating: review.rating, comment: review.comment, bookingId });
}));

export default router;
