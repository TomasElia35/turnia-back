// Wrapper para handlers async: captura errores y los pasa a next().
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Middleware final de errores.
export function errorHandler(err, req, res, _next) {
  console.error('[error]', err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.publicMessage || 'Error interno del servidor.',
    ...(process.env.NODE_ENV !== 'production' ? { detail: err.message } : {}),
  });
}

export function notFound(req, res) {
  res.status(404).json({ error: 'Recurso no encontrado.' });
}
