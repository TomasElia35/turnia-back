import { verifyToken } from '../utils/jwt.js';

// Requiere un JWT válido. Adjunta req.user = { id, role, email, businessId }
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado.' });

  const { valid, payload, error } = verifyToken(token);
  if (!valid) return res.status(401).json({ error: 'Sesión inválida o expirada.', detail: error });

  req.user = payload;
  next();
}

// Restringe a determinados roles. Uso: requireRole('admin','superadmin')
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado.' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'No tenés permisos para esta acción.' });
    }
    next();
  };
}

// Para admin/employee: garantiza que solo operen sobre su propio negocio.
export function sameBusiness(req, res, next) {
  if (req.user?.role === 'superadmin') return next(); // el superadmin ve todo
  const target = req.params.businessId || req.body.businessId || req.query.businessId;
  if (target && req.user?.businessId && String(target) !== String(req.user.businessId)) {
    return res.status(403).json({ error: 'No podés operar sobre otro negocio.' });
  }
  next();
}
