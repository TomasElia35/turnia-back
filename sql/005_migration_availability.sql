-- =============================================================================
-- Turnia — Migración: Disponibilidad por fecha del profesional
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- Idempotente: agrega la columna SIN borrar datos existentes.
-- =============================================================================

-- ── Disponibilidad por fecha (ventana de trabajo por día) ────────────────────
-- Formato: { "YYYY-MM-DD": { "start": "HH:MM", "end": "HH:MM" } }
-- Distinto de `schedule` (patrón semanal, en desuso): esto es por fecha puntual.
-- Regla de negocio (se valida en el backend, no acá):
--   • El empleado solo edita su propio profesional; el admin, los de su negocio.
--   • No se pueden editar fechas pasadas (solo hoy y futuras).
-- Compatibilidad: si un profesional NO tiene ninguna fecha cargada ({}), el
-- sistema usa los horarios por defecto del negocio. Apenas carga una fecha,
-- pasa a régimen estricto: las fechas sin ventana quedan sin atención.
alter table professionals
  add column if not exists availability jsonb not null default '{}'::jsonb;

-- Listo.
