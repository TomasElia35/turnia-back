-- =============================================================================
-- Turnia — Migración: Reseñas / calificaciones de clientes
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- Idempotente: crea la tabla SIN borrar datos existentes.
-- =============================================================================

-- Una reseña por turno (booking_id unique). El cliente califica el negocio
-- una vez que el turno ya pasó. El promedio y la cantidad se recalculan en
-- businesses.rating / businesses.reviews desde el backend al recibir una reseña.
create table if not exists reviews (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  booking_id  uuid not null unique references bookings(id) on delete cascade,
  client_id   uuid references users(id) on delete set null,
  rating      integer not null check (rating between 1 and 5),
  comment     text default '',
  created_at  timestamptz not null default now()
);
create index if not exists idx_reviews_business on reviews (business_id);

-- Listo.
