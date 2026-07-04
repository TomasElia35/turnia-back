import { Router } from 'express';
import { randomUUID } from 'crypto';
import { one } from '../config/db.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { signToken } from '../utils/jwt.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { sendPasswordResetEmail } from '../services/email.js';
import { mapUser } from '../utils/map.js';
import { env } from '../config/env.js';

const router = Router();

const tokenFor = (u) => signToken({ id: u.id, role: u.role, email: u.email, businessId: u.business_id || null });

// Resuelve business_id (por tolerancia a datos desincronizados) y adjunta el
// nombre del negocio para mostrarlo en la UI (business_name).
async function resolveBusinessId(user) {
  // Si es staff sin business_id, intentamos derivarlo de businesses.admin_id
  if (!user.business_id && ['admin', 'employee'].includes(user.role)) {
    const biz = await one('select id from businesses where admin_id = $1 limit 1', [user.id]);
    if (biz) {
      user.business_id = biz.id;
      await one('update users set business_id = $1 where id = $2 returning id', [biz.id, user.id]);
    }
  }
  // Adjuntar el nombre del negocio (para el sidebar, etc.)
  if (user.business_id) {
    const biz = await one('select name from businesses where id = $1', [user.business_id]);
    if (biz) user.business_name = biz.name;
  }
  return user;
}

// ── POST /api/auth/register ──────────────────────────────────────────────────
router.post('/register', asyncHandler(async (req, res) => {
  const { firstName, lastName, name, email, password, phone, document, birthDate, address, provider = 'local' } = req.body;
  if (!email || (provider === 'local' && !password)) {
    return res.status(400).json({ error: 'Email y contraseña son obligatorios.' });
  }

  const existing = await one('select id from users where lower(email) = lower($1)', [email]);
  if (existing) return res.status(409).json({ error: 'El email ya está registrado.' });

  const fullName = name || [firstName, lastName].filter(Boolean).join(' ').trim() || 'Cliente';
  const passwordHash = password ? await hashPassword(password) : null;
  const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=15120F&color=CBA35C`;

  const user = await one(
    `insert into users (role, first_name, last_name, name, email, password_hash, provider, phone, document, birth_date, address, avatar_url)
     values ('client',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
    [firstName || '', lastName || '', fullName, email, passwordHash, provider, phone || '', document || '', birthDate || null, address || '', avatar]
  );
  res.status(201).json({ token: tokenFor(user), user: mapUser(user) });
}));

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña son obligatorios.' });

  const user = await one('select * from users where lower(email) = lower($1)', [email]);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return res.status(401).json({ error: 'Credenciales incorrectas.' });
  }
  await resolveBusinessId(user);
  res.json({ token: tokenFor(user), user: mapUser(user) });
}));

// ── POST /api/auth/google (MVP — verificar id_token en producción) ────────────
router.post('/google', asyncHandler(async (req, res) => {
  const { email, given_name, family_name } = req.body;
  if (!email) return res.status(400).json({ error: 'Perfil de Google inválido.' });

  let user = await one('select * from users where lower(email) = lower($1)', [email]);
  if (!user) {
    const fullName = [given_name, family_name].filter(Boolean).join(' ').trim() || 'Cliente Google';
    const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=15120F&color=CBA35C`;
    user = await one(
      `insert into users (role, provider, first_name, last_name, name, email, avatar_url)
       values ('client','google',$1,$2,$3,$4,$5) returning *`,
      [given_name || '', family_name || '', fullName, email, avatar]
    );
  }
  res.json({ token: tokenFor(user), user: mapUser(user) });
}));

// ── POST /api/auth/forgot-password ────────────────────────────────────────────
router.post('/forgot-password', asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await one('select id, email from users where lower(email) = lower($1)', [email || '']);
  if (!user) return res.json({ sent: true }); // respuesta uniforme

  const token = `${randomUUID()}-${Date.now().toString(36)}`;
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString();
  await one(
    'insert into password_reset_tokens (user_id, token, expires_at) values ($1,$2,$3) returning id',
    [user.id, token, expiresAt]
  );
  await sendPasswordResetEmail(user.email, `${env.frontendUrl}/reset-password?token=${token}`);
  res.json({ sent: true, ...(process.env.NODE_ENV !== 'production' ? { devToken: token } : {}) });
}));

// ── POST /api/auth/reset-password ─────────────────────────────────────────────
router.post('/reset-password', asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Faltan datos.' });
  if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });

  const row = await one('select * from password_reset_tokens where token = $1', [token]);
  if (!row || row.used) return res.status(400).json({ error: 'El enlace no es válido.' });
  if (new Date(row.expires_at) < new Date()) return res.status(400).json({ error: 'El enlace expiró.' });

  const passwordHash = await hashPassword(password);
  await one('update users set password_hash = $1 where id = $2 returning id', [passwordHash, row.user_id]);
  await one('update password_reset_tokens set used = true where id = $1 returning id', [row.id]);
  res.json({ success: true });
}));

// ── GET /api/auth/reset-token/:token  — valida un token (para la pantalla de reset) ──
router.get('/reset-token/:token', asyncHandler(async (req, res) => {
  const row = await one('select expires_at, used from password_reset_tokens where token = $1', [req.params.token]);
  if (!row || row.used) return res.json({ valid: false, error: 'El enlace no es válido.' });
  if (new Date(row.expires_at) < new Date()) return res.json({ valid: false, error: 'El enlace expiró.' });
  res.json({ valid: true });
}));

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await one('select * from users where id = $1', [req.user.id]);
  if (user) await resolveBusinessId(user);
  res.json({ user: mapUser(user) });
}));

// ── PATCH /api/auth/me  — actualizar perfil propio ───────────────────────────
router.patch('/me', requireAuth, asyncHandler(async (req, res) => {
  const { name, phone, address, password } = req.body;
  const passwordHash = password ? await hashPassword(password) : undefined;
  const user = await one(
    `update users set
       name = coalesce($2, name),
       phone = coalesce($3, phone),
       address = coalesce($4, address),
       password_hash = coalesce($5, password_hash)
     where id = $1 returning *`,
    [req.user.id, name ?? null, phone ?? null, address ?? null, passwordHash ?? null]
  );
  res.json({ user: mapUser(user) });
}));

export default router;
