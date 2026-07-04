import { Router } from 'express';
import { one, many, query } from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { mapProfessional } from '../utils/map.js';

const router = Router();

// GET /api/professionals?businessId=... (incluye servicios asignados)
router.get('/', asyncHandler(async (req, res) => {
  const { businessId } = req.query;
  const profs = businessId
    ? await many('select * from professionals where business_id = $1 order by name', [businessId])
    : await many('select * from professionals order by name', []);
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

// POST /api/professionals
router.post('/', requireAuth, requireRole('admin', 'superadmin'), asyncHandler(async (req, res) => {
  const b = req.body;
  const prof = await one(
    `insert into professionals (business_id, name, role, commission, avatar_url, specialties, schedule)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [b.business_id || b.businessId, b.name, b.role, b.commission ?? 40, b.avatar || b.avatar_url,
     b.specialties || [], b.schedule || {}]
  );
  await setAssignments(prof.id, b.assignedServices);
  const assignments = await many('select * from professional_services where professional_id = $1', [prof.id]);
  res.status(201).json(mapProfessional(prof, assignments));
}));

// PATCH /api/professionals/:id
router.patch('/:id', requireAuth, requireRole('admin', 'superadmin'), asyncHandler(async (req, res) => {
  const b = req.body;
  const prof = await one(
    `update professionals set name = coalesce($2,name), role = coalesce($3,role),
       commission = coalesce($4,commission), avatar_url = coalesce($5,avatar_url),
       specialties = coalesce($6,specialties), schedule = coalesce($7,schedule)
     where id = $1 returning *`,
    [req.params.id, b.name, b.role, b.commission, b.avatar || b.avatar_url, b.specialties, b.schedule]
  );
  if (!prof) return res.status(404).json({ error: 'Profesional no encontrado.' });
  if (Array.isArray(b.assignedServices)) await setAssignments(prof.id, b.assignedServices);
  const assignments = await many('select * from professional_services where professional_id = $1', [prof.id]);
  res.json(mapProfessional(prof, assignments));
}));

// DELETE /api/professionals/:id
router.delete('/:id', requireAuth, requireRole('admin', 'superadmin'), asyncHandler(async (req, res) => {
  await one('delete from professionals where id = $1 returning id', [req.params.id]);
  res.json({ success: true });
}));

export default router;
