import { Router } from 'express';
import { one, many, query } from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { mapProfessional } from '../utils/map.js';
import { hashPassword } from '../utils/password.js';
import { isValidDate, isPastDate, validateWindow } from '../utils/availability.js';

const router = Router();

// ¿Puede el usuario actual editar la disponibilidad de este profesional?
//  • superadmin: cualquiera
//  • admin: los de su negocio
//  • employee: solo el profesional vinculado a su cuenta
function canEditAvailability(user, prof) {
  if (!prof) return false;
  if (user.role === 'superadmin') return true;
  if (user.role === 'admin') return String(prof.business_id) === String(user.businessId);
  if (user.role === 'employee') return String(prof.user_id) === String(user.id);
  return false;
}

// GET /api/professionals?businessId=... (incluye servicios asignados + cuenta de acceso)
router.get('/', asyncHandler(async (req, res) => {
  const { businessId } = req.query;
  const profs = businessId
    ? await many('select p.*, u.email as access_email from professionals p left join users u on u.id = p.user_id where p.business_id = $1 order by p.name', [businessId])
    : await many('select p.*, u.email as access_email from professionals p left join users u on u.id = p.user_id order by p.name', []);
  const ids = profs.map((p) => p.id);
  const assignments = ids.length
    ? await many('select * from professional_services where professional_id = any($1)', [ids])
    : [];
  res.json(profs.map((p) => mapProfessional(p, assignments.filter((a) => a.professional_id === p.id))));
}));

async function setAssignments(professionalId, assignedServices) {
  await query('delete from professional_services where professional_id = $1', [professionalId]);
  if (Array.isArray(assignedServices) && assignedServices.length) {
    const values = assignedServices.map((_, i) => `($1, $${i + 2})`).join(',');
    await query(
      `insert into professional_services (professional_id, service_id) values ${values}`,
      [professionalId, ...assignedServices]
    );
  }
}

// Crea o vincula una cuenta de acceso (empleado) para el profesional.
// Si el email ya existe, lo vincula (y actualiza la contraseña si viene).
async function linkEmployeeUser(prof, businessId, email, password) {
  if (!email) return;
  const existing = await one('select id from users where lower(email) = lower($1)', [email]);
  let userId;
  if (existing) {
    userId = existing.id;
    if (password) {
      await query('update users set password_hash = $1, business_id = $2 where id = $3',
        [await hashPassword(password), businessId, userId]);
    } else {
      await query('update users set business_id = $1 where id = $2', [businessId, userId]);
    }
  } else {
    const hash = await hashPassword(password || 'temp1234');
    const u = await one(
      `insert into users (role, name, email, password_hash, provider, business_id, avatar_url)
       values ('employee',$1,$2,$3,'local',$4,$5) returning id`,
      [prof.name, email, hash, businessId, prof.avatar_url]
    );
    userId = u.id;
  }
  await query('update professionals set user_id = $1 where id = $2', [userId, prof.id]);
}

// POST /api/professionals
router.post('/', requireAuth, requireRole('admin', 'superadmin'), asyncHandler(async (req, res) => {
  const b = req.body;
  const businessId = b.business_id || b.businessId;
  const prof = await one(
    `insert into professionals (business_id, name, role, commission, avatar_url, specialties, schedule)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [businessId, b.name, b.role, b.commission ?? 40, b.avatar ?? b.avatar_url, b.specialties || [], b.schedule || {}]
  );
  await setAssignments(prof.id, b.assignedServices);
  if (b.accessEmail) await linkEmployeeUser(prof, businessId, b.accessEmail, b.accessPassword);

  const full = await one('select p.*, u.email as access_email from professionals p left join users u on u.id = p.user_id where p.id = $1', [prof.id]);
  const assignments = await many('select * from professional_services where professional_id = $1', [prof.id]);
  res.status(201).json(mapProfessional(full, assignments));
}));

// PATCH /api/professionals/:id
router.patch('/:id', requireAuth, requireRole('admin', 'superadmin'), asyncHandler(async (req, res) => {
  const b = req.body;
  const prof = await one(
    `update professionals set name = coalesce($2,name), role = coalesce($3,role),
       commission = coalesce($4,commission), avatar_url = coalesce($5,avatar_url),
       specialties = coalesce($6,specialties), schedule = coalesce($7,schedule)
     where id = $1 returning *`,
    [req.params.id, b.name, b.role, b.commission, b.avatar ?? b.avatar_url, b.specialties, b.schedule]
  );
  if (!prof) return res.status(404).json({ error: 'Profesional no encontrado.' });
  if (Array.isArray(b.assignedServices)) await setAssignments(prof.id, b.assignedServices);
  if (b.accessEmail) await linkEmployeeUser(prof, prof.business_id, b.accessEmail, b.accessPassword);

  const full = await one('select p.*, u.email as access_email from professionals p left join users u on u.id = p.user_id where p.id = $1', [prof.id]);
  const assignments = await many('select * from professional_services where professional_id = $1', [prof.id]);
  res.json(mapProfessional(full, assignments));
}));

// ── DISPONIBILIDAD POR FECHA ─────────────────────────────────────────────────

// GET /api/professionals/:id/availability → { availability: { "YYYY-MM-DD": {start,end} } }
router.get('/:id/availability', requireAuth, asyncHandler(async (req, res) => {
  const prof = await one('select id, business_id, user_id, availability from professionals where id = $1', [req.params.id]);
  if (!prof) return res.status(404).json({ error: 'Profesional no encontrado.' });
  if (!canEditAvailability(req.user, prof)) return res.status(403).json({ error: 'No tenés permisos para ver esta disponibilidad.' });
  res.json({ availability: prof.availability || {} });
}));

// PUT /api/professionals/:id/availability → cargar/actualizar la ventana de un día.
// body: { date: "YYYY-MM-DD", start: "HH:MM", end: "HH:MM" }
// Regla: no se pueden editar fechas pasadas (solo hoy y futuras).
router.put('/:id/availability', requireAuth, asyncHandler(async (req, res) => {
  const { date, start, end } = req.body || {};
  const prof = await one('select id, business_id, user_id, availability from professionals where id = $1', [req.params.id]);
  if (!prof) return res.status(404).json({ error: 'Profesional no encontrado.' });
  if (!canEditAvailability(req.user, prof)) return res.status(403).json({ error: 'No tenés permisos para editar esta disponibilidad.' });

  if (!isValidDate(date)) return res.status(400).json({ error: 'Fecha inválida.' });
  if (isPastDate(date)) return res.status(400).json({ error: 'No se pueden editar días anteriores a hoy.' });

  const v = validateWindow(start, end);
  if (!v.ok) return res.status(400).json({ error: v.error });

  const availability = { ...(prof.availability || {}), [date]: v.window };
  const updated = await one(
    'update professionals set availability = $2 where id = $1 returning availability',
    [prof.id, availability]
  );
  res.json({ availability: updated.availability });
}));

// DELETE /api/professionals/:id/availability?date=YYYY-MM-DD → marcar el día como libre.
router.delete('/:id/availability', requireAuth, asyncHandler(async (req, res) => {
  const { date } = req.query;
  const prof = await one('select id, business_id, user_id, availability from professionals where id = $1', [req.params.id]);
  if (!prof) return res.status(404).json({ error: 'Profesional no encontrado.' });
  if (!canEditAvailability(req.user, prof)) return res.status(403).json({ error: 'No tenés permisos para editar esta disponibilidad.' });

  if (!isValidDate(date)) return res.status(400).json({ error: 'Fecha inválida.' });
  if (isPastDate(date)) return res.status(400).json({ error: 'No se pueden editar días anteriores a hoy.' });

  const availability = { ...(prof.availability || {}) };
  delete availability[date];
  const updated = await one(
    'update professionals set availability = $2 where id = $1 returning availability',
    [prof.id, availability]
  );
  res.json({ availability: updated.availability });
}));

// DELETE /api/professionals/:id
router.delete('/:id', requireAuth, requireRole('admin', 'superadmin'), asyncHandler(async (req, res) => {
  await one('delete from professionals where id = $1 returning id', [req.params.id]);
  res.json({ success: true });
}));

export default router;
