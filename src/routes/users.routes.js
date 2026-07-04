import { Router } from 'express';
import { one, many } from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { mapUser } from '../utils/map.js';
import { hashPassword } from '../utils/password.js';

const router = Router();

// GET /api/users — listado (solo superadmin). Filtros opcionales: ?role=&businessId=
router.get('/', requireAuth, requireRole('superadmin'), asyncHandler(async (req, res) => {
  const { role, businessId } = req.query;
  const conds = [];
  const params = [];
  const add = (sql, v) => { params.push(v); conds.push(sql.replace('?', `$${params.length}`)); };
  if (role) add('role = ?', role);
  if (businessId) add('business_id = ?', businessId);
  const where = conds.length ? `where ${conds.join(' and ')}` : '';
  const rows = await many(`select * from users ${where} order by created_at desc`, params);
  res.json(rows.map(mapUser));
}));

// POST /api/users — crear usuario (solo superadmin)
router.post('/', requireAuth, requireRole('superadmin'), asyncHandler(async (req, res) => {
  const b = req.body;
  if (!b.email) return res.status(400).json({ error: 'El email es obligatorio.' });
  const exists = await one('select id from users where lower(email) = lower($1)', [b.email]);
  if (exists) return res.status(409).json({ error: 'El email ya está registrado.' });

  const fullName = b.name || [b.firstName, b.lastName].filter(Boolean).join(' ').trim() || 'Usuario';
  const passwordHash = b.password ? await hashPassword(b.password) : null;
  const rawBizId = b.businessId ?? b.business_id;
  const bizId = (rawBizId === '' || rawBizId === undefined) ? null : rawBizId;

  const row = await one(
    `insert into users (role, name, email, password_hash, provider, phone, business_id, avatar_url)
     values ($1,$2,$3,$4,'local',$5,$6,$7) returning *`,
    [b.role || 'client', fullName, b.email, passwordHash, b.phone || '', bizId,
     `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=15120F&color=CBA35C`]
  );
  res.status(201).json(mapUser(row));
}));

// PATCH /api/users/:id — editar rol/datos (solo superadmin)
router.patch('/:id', requireAuth, requireRole('superadmin'), asyncHandler(async (req, res) => {
  const b = req.body;
  const rawBizId = b.businessId !== undefined ? b.businessId : b.business_id;
  const bizId = rawBizId === '' ? null : rawBizId;

  const updates = [];
  const params = [req.params.id];
  let pIdx = 2;

  if (b.role !== undefined) { updates.push(`role = $${pIdx++}`); params.push(b.role); }
  if (b.name !== undefined) { updates.push(`name = $${pIdx++}`); params.push(b.name); }
  if (b.phone !== undefined) { updates.push(`phone = $${pIdx++}`); params.push(b.phone); }
  if (bizId !== undefined) { updates.push(`business_id = $${pIdx++}`); params.push(bizId); }

  if (updates.length === 0) {
    const row = await one('select * from users where id = $1', [req.params.id]);
    return res.json(mapUser(row));
  }

  const row = await one(
    `update users set ${updates.join(', ')} where id = $1 returning *`,
    params
  );
  if (!row) return res.status(404).json({ error: 'Usuario no encontrado.' });
  res.json(mapUser(row));
}));

// DELETE /api/users/:id — eliminar (solo superadmin)
router.delete('/:id', requireAuth, requireRole('superadmin'), asyncHandler(async (req, res) => {
  await one('delete from users where id = $1 returning id', [req.params.id]);
  res.json({ success: true });
}));

export default router;
