-- =============================================================================
-- EstéticaHub — Script de creación de la base de datos (PostgreSQL / Supabase)
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- Idempotente: se puede correr más de una vez sin romper (DROP + CREATE).
-- =============================================================================

-- Extensión para UUIDs
create extension if not exists "pgcrypto";

-- ── Limpieza (orden inverso por dependencias) ───────────────────────────────
drop table if exists password_reset_tokens cascade;
drop table if exists reviews               cascade;
drop table if exists commission_payouts    cascade;
drop table if exists product_sales         cascade;
drop table if exists cancellation_requests cascade;
drop table if exists payments              cascade;
drop table if exists deposits              cascade;
drop table if exists bookings              cascade;
drop table if exists professional_services cascade;
drop table if exists products              cascade;
drop table if exists professionals         cascade;
drop table if exists services              cascade;
drop table if exists subscriptions         cascade;
drop table if exists plans                 cascade;
drop table if exists businesses            cascade;
drop table if exists users                 cascade;

-- ── USERS ───────────────────────────────────────────────────────────────────
create table users (
  id                      uuid primary key default gen_random_uuid(),
  role                    text not null default 'client'
                            check (role in ('superadmin','admin','employee','client')),
  first_name              text default '',
  last_name               text default '',
  name                    text not null,
  email                   text not null unique,
  password_hash           text,                         -- null si proveedor = google
  provider                text not null default 'local' check (provider in ('local','google')),
  phone                   text default '',
  document                text default '',
  birth_date              date,
  address                 text default '',
  avatar_url              text,
  business_id             uuid,                          -- FK se agrega luego (dependencia circular)
  favorite_business_id    uuid,
  favorite_professional_id uuid,
  created_at              timestamptz not null default now()
);
create index idx_users_email on users (lower(email));
create index idx_users_role  on users (role);

-- ── BUSINESSES (salones / emprendimientos) ──────────────────────────────────
create table businesses (
  id                uuid primary key default gen_random_uuid(),
  admin_id          uuid references users(id) on delete set null,
  name              text not null,
  address           text,
  phone             text,
  email             text,
  instagram         text,
  whatsapp          text,
  rating            numeric(2,1) default 0,
  reviews           integer default 0,
  photo_url         text,
  description       text,
  categories        text[] default '{}',
  open_days         text[] default '{}',
  open_hours        text,
  theme_color       text,
  is_active         boolean not null default true,
  -- Comisiones
  commission_on_products boolean not null default false,  -- si las ventas de productos generan comisión
  -- Destacados (marketplace) — flag manual del superadmin
  featured          boolean not null default false,
  featured_rank     integer default 0,                    -- orden entre destacados (mayor = primero)
  -- Configuración de seña
  deposit_required             boolean default false,
  deposit_amount               integer default 0,
  deposit_alias                text,
  deposit_mp_link              text,
  deposit_policy               text,
  deposit_allow_direct_cancel  boolean default true,
  -- Modal de promoción
  promo_active      boolean default false,
  promo_title       text,
  promo_description text,
  promo_cta         text,
  promo_expires_at  date,
  created_at        timestamptz not null default now()
);
create index idx_businesses_admin on businesses (admin_id);

-- Ahora sí, la FK de users.business_id → businesses
alter table users
  add constraint fk_users_business
  foreign key (business_id) references businesses(id) on delete set null;

-- ── SERVICES ─────────────────────────────────────────────────────────────────
create table services (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  category    text not null default 'Otro',
  name        text not null,
  duration    integer not null default 60,    -- minutos
  price       integer not null default 0,      -- ARS
  created_at  timestamptz not null default now()
);
create index idx_services_business on services (business_id);

-- ── PROFESSIONALS ────────────────────────────────────────────────────────────
create table professionals (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id     uuid references users(id) on delete set null,  -- cuenta de empleado vinculada (opcional)
  name        text not null,
  role        text,
  commission  integer not null default 40,     -- % base
  avatar_url  text,
  specialties text[] default '{}',
  schedule    jsonb default '{}'::jsonb,        -- patrón semanal (en desuso): { "Lun": ["09:00", ...], ... }
  availability jsonb not null default '{}'::jsonb, -- disponibilidad por fecha: { "YYYY-MM-DD": { "start": "HH:MM", "end": "HH:MM" } }
  created_at  timestamptz not null default now()
);
create index idx_professionals_business on professionals (business_id);

-- ── PROFESSIONAL ↔ SERVICES (asignación + override de comisión) ──────────────
create table professional_services (
  professional_id     uuid not null references professionals(id) on delete cascade,
  service_id          uuid not null references services(id) on delete cascade,
  commission_override integer,                   -- % específico para este servicio (null = usa el base)
  primary key (professional_id, service_id)
);

-- ── PRODUCTS ─────────────────────────────────────────────────────────────────
create table products (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name        text not null,
  category    text,
  stock       integer not null default 0,
  cost_price  integer not null default 0,
  sale_price  integer not null default 0,
  created_at  timestamptz not null default now()
);
create index idx_products_business on products (business_id);

-- ── BOOKINGS (turnos) ─────────────────────────────────────────────────────────
create table bookings (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references businesses(id) on delete cascade,
  service_id      uuid references services(id) on delete set null,
  professional_id uuid references professionals(id) on delete set null,
  client_id       uuid references users(id) on delete set null,
  client_name     text not null,
  client_phone    text default '',
  client_email    text default '',
  booking_date    date not null,
  booking_time    text not null,                -- "HH:MM"
  status          text not null default 'pending'
                    check (status in ('pending','confirmed','completed','cancelled')),
  discount_type   text check (discount_type in ('percent','fixed')),
  discount_value  integer,
  notes           text default '',
  cancel_rejected boolean not null default false,  -- el local rechazó una solicitud de cancelación
  created_at      timestamptz not null default now()
);
create index idx_bookings_business_date on bookings (business_id, booking_date);
create index idx_bookings_professional  on bookings (professional_id);
create index idx_bookings_client        on bookings (client_id);

-- ── DEPOSITS (seña — 1:1 con booking) ────────────────────────────────────────
create table deposits (
  booking_id          uuid primary key references bookings(id) on delete cascade,
  amount              integer not null default 0,
  paid                boolean not null default false,
  confirmed_by_admin  boolean not null default false,
  refunded            boolean   -- null = no resuelto, true/false según devolución
);

-- ── PAYMENTS (cobro del turno) ───────────────────────────────────────────────
create table payments (
  id                 uuid primary key default gen_random_uuid(),
  booking_id         uuid not null references bookings(id) on delete cascade,
  amount             integer not null,        -- monto final cobrado (con descuento aplicado)
  method             text,                    -- efectivo | transferencia | tarjeta | mercadopago
  professional_id    uuid references professionals(id) on delete set null,  -- a quién le corresponde la comisión
  commission_percent integer,                 -- % congelado al momento del cobro
  commission_amount  integer,                 -- monto de comisión congelado
  paid_at            timestamptz not null default now()
);
create index idx_payments_booking on payments (booking_id);
create index idx_payments_professional on payments (professional_id);

-- ── CANCELLATION REQUESTS ─────────────────────────────────────────────────────
create table cancellation_requests (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references bookings(id) on delete cascade,
  reason       text,
  requested_at timestamptz not null default now(),
  resolved     boolean not null default false
);
create index idx_cancel_booking on cancellation_requests (booking_id);

-- ── PRODUCT SALES ──────────────────────────────────────────────────────────────
create table product_sales (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references businesses(id) on delete cascade,
  product_id      uuid references products(id) on delete set null,
  product_name    text not null,
  quantity        integer not null default 1,
  unit_price      integer not null default 0,
  total_price     integer not null default 0,
  client_name     text,
  professional_id uuid references professionals(id) on delete set null,
  sale_date       date not null default current_date,
  sold_at         timestamptz not null default now()
);
create index idx_sales_business_date on product_sales (business_id, sale_date);

-- ── REVIEWS (reseñas de clientes — 1 por turno) ──────────────────────────────
create table reviews (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  booking_id  uuid not null unique references bookings(id) on delete cascade,
  client_id   uuid references users(id) on delete set null,
  rating      integer not null check (rating between 1 and 5),
  comment     text default '',
  created_at  timestamptz not null default now()
);
create index idx_reviews_business on reviews (business_id);

-- ── PLANS (catálogo de planes de suscripción) ────────────────────────────────
create table plans (
  id                text primary key,             -- 'Starter' | 'Pro' | 'Enterprise'
  name              text not null,
  monthly_price     integer not null,
  annual_price      integer not null,
  max_professionals integer,                       -- null = ilimitado
  max_services      integer,                       -- null = ilimitado
  features          text[] default '{}'
);

-- ── SUBSCRIPTIONS ──────────────────────────────────────────────────────────────
create table subscriptions (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  plan_id           text not null references plans(id),
  billing_cycle     text not null default 'monthly' check (billing_cycle in ('monthly','annual')),
  status            text not null default 'active'  check (status in ('active','suspended','cancelled')),
  start_date        date not null default current_date,
  next_billing_date date,
  payment_method    text,
  contact_email     text,
  notes             text,
  created_at        timestamptz not null default now()
);
create index idx_subscriptions_business on subscriptions (business_id);

-- ── COMMISSION PAYOUTS (liquidaciones — "marcar como rendido") ────────────────
create table commission_payouts (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references businesses(id) on delete cascade,
  professional_id uuid not null references professionals(id) on delete cascade,
  amount          integer not null,          -- monto rendido/pagado al empleado
  note            text,
  period_from     date,
  period_to       date,
  created_by      uuid references users(id) on delete set null,
  paid_at         timestamptz not null default now()
);
create index idx_payouts_business on commission_payouts (business_id, professional_id);

-- ── PASSWORD RESET TOKENS ────────────────────────────────────────────────────
create table password_reset_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  token      text not null unique,
  expires_at timestamptz not null,
  used       boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_reset_token on password_reset_tokens (token);

-- =============================================================================
-- NOTA sobre Row Level Security (RLS):
-- El backend accede con la service_role key (bypassa RLS), por lo que la
-- autorización se hace en Express (middleware por rol). Si en el futuro se
-- consume Supabase directo desde el frontend, habría que activar RLS:
--   alter table <tabla> enable row level security;
-- y definir policies por rol/negocio.
-- =============================================================================
