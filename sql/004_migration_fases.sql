-- =============================================================================
-- Galart — Migración Fases 1 a 5
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- Idempotente: agrega columnas/tablas SIN borrar datos existentes.
-- Se puede correr más de una vez sin romper.
-- =============================================================================

-- ── FASE 1 — Cuenta de acceso del empleado (professionals.user_id) ────────────
alter table professionals
  add column if not exists user_id uuid references users(id) on delete set null;

-- ── FASE 2 — Rechazo de solicitud de cancelación ─────────────────────────────
alter table bookings
  add column if not exists cancel_rejected boolean not null default false;

-- ── FASE 3 — Comisiones congeladas + liquidaciones ───────────────────────────
alter table payments
  add column if not exists professional_id    uuid references professionals(id) on delete set null,
  add column if not exists commission_percent integer,
  add column if not exists commission_amount  integer;
create index if not exists idx_payments_professional on payments (professional_id);

alter table businesses
  add column if not exists commission_on_products boolean not null default false;

create table if not exists commission_payouts (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references businesses(id) on delete cascade,
  professional_id uuid not null references professionals(id) on delete cascade,
  amount          integer not null,
  note            text,
  period_from     date,
  period_to       date,
  created_by      uuid references users(id) on delete set null,
  paid_at         timestamptz not null default now()
);
create index if not exists idx_payouts_business on commission_payouts (business_id, professional_id);

-- ── FASE 4 — Cancelación configurable (permitir cancelación directa sin seña) ─
alter table businesses
  add column if not exists deposit_allow_direct_cancel boolean default true;

-- ── FASE 5 — Destacados en el marketplace ────────────────────────────────────
alter table businesses
  add column if not exists featured      boolean not null default false,
  add column if not exists featured_rank integer default 0;

-- Listo. La app ya usa todas estas columnas.
