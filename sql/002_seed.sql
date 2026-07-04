-- =============================================================================
-- EstéticaHub — Seed de datos de ejemplo (espeja el mock del frontend)
-- Ejecutar DESPUÉS de 001_schema.sql, en Supabase SQL Editor.
--
-- IMPORTANTE: los USUARIOS con contraseña NO se cargan acá (las contraseñas
-- deben ir hasheadas con bcrypt). Para los usuarios demo, correr:  npm run seed
-- que los inserta con la contraseña hasheada vía el backend.
-- Este script carga negocios, planes, servicios, profesionales, productos y
-- suscripciones, que no tienen datos sensibles.
-- =============================================================================

-- ── PLANES ────────────────────────────────────────────────────────────────────
insert into plans (id, name, monthly_price, annual_price, max_professionals, max_services, features) values
  ('Starter',    'Starter',    14900, 149000, 2,    5,    array['Hasta 2 profesionales','Hasta 5 servicios','Agenda básica','Soporte por email']),
  ('Pro',        'Pro',        29900, 299000, 10,   20,   array['Hasta 10 profesionales','Hasta 20 servicios','Agenda avanzada','Facturación y comisiones','Gestión de productos','Soporte prioritario']),
  ('Enterprise', 'Enterprise', 59900, 599000, null, null, array['Profesionales ilimitados','Servicios ilimitados','Reportes avanzados','Acceso API','Soporte dedicado'])
on conflict (id) do nothing;

-- ── NEGOCIOS ──────────────────────────────────────────────────────────────────
-- Usamos IDs fijos para poder referenciarlos en los inserts siguientes.
insert into businesses (id, name, address, phone, email, instagram, whatsapp, rating, reviews, photo_url, description, categories, open_days, open_hours, theme_color, is_active, deposit_required, deposit_amount, deposit_alias, deposit_policy, deposit_allow_direct_cancel, promo_active, promo_title, promo_description, promo_cta, promo_expires_at) values
  ('11111111-1111-1111-1111-111111111111', 'L''Elegance Studio', 'Av. Libertador 1234, CABA', '1122334455', 'contacto@elegance.com', '@elegance.studio', '541122334455', 4.8, 124, 'https://images.unsplash.com/photo-1600948836101-f9ffda59d250?auto=format&fit=crop&w=800&q=80', 'Salón boutique especializado en estética integral y vanguardia.', array['Peluquería','Estética'], array['Lun','Mar','Mié','Jue','Vie','Sáb'], '09:00 - 20:00', '#a37c6d', true, true, 5000, 'elegance.studio', 'La devolución de la seña queda a criterio del negocio.', true, true, '¡20% OFF en Coloración este mes!', 'Reservá tu turno de coloración completa y obtené un 20% de descuento.', 'Reservar ahora', '2026-06-30'),
  ('22222222-2222-2222-2222-222222222222', 'Gentleman''s Club Barber', 'Palermo Soho 456, CABA', '1133445566', 'contacto@gentleman.com', '@gentlemanclub.ba', '541133445566', 4.9, 89, 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=800&q=80', 'Barbería clásica de nivel premium con servicio de spa para caballeros.', array['Barbería'], array['Lun','Mar','Mié','Jue','Vie','Sáb'], '10:00 - 21:00', '#2c3e50', true, false, 0, null, null, true, false, null, null, 'Ver más', null),
  ('33333333-3333-3333-3333-333333333333', 'Aura Belleza & Spa', 'Recoleta 789, CABA', '1144556677', 'contacto@aura.com', '@aura.spa', '541144556677', 4.7, 156, 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=800&q=80', 'Spa integral de belleza, uñas y relax.', array['Spa','Uñas','Estética'], array['Mar','Mié','Jue','Vie','Sáb'], '10:00 - 20:00', '#a37c6d', true, true, 4000, 'aura.spa', 'Seña reembolsable hasta 48hs antes.', true, false, null, null, 'Reservar', null);

-- ── SERVICIOS ──────────────────────────────────────────────────────────────────
insert into services (business_id, category, name, duration, price) values
  ('11111111-1111-1111-1111-111111111111', 'Peluquería', 'Corte Clásico',             45, 15000),
  ('11111111-1111-1111-1111-111111111111', 'Peluquería', 'Coloración Completa',       120, 45000),
  ('11111111-1111-1111-1111-111111111111', 'Estética',   'Limpieza Facial Profunda',  60, 25000),
  ('11111111-1111-1111-1111-111111111111', 'Peluquería', 'Blow Dry & Styling',        30, 10000),
  ('11111111-1111-1111-1111-111111111111', 'Estética',   'Tratamiento Anti-edad',     75, 35000),
  ('22222222-2222-2222-2222-222222222222', 'Barbería',   'Corte de Autor',            45, 12000),
  ('22222222-2222-2222-2222-222222222222', 'Barbería',   'Arreglo de Barba',          30, 8000),
  ('22222222-2222-2222-2222-222222222222', 'Barbería',   'Ritual Completo',           75, 18000),
  ('22222222-2222-2222-2222-222222222222', 'Barbería',   'Afeitado a Navaja',         40, 10000),
  ('33333333-3333-3333-3333-333333333333', 'Spa',        'Masaje Descontracturante',  60, 22000),
  ('33333333-3333-3333-3333-333333333333', 'Uñas',       'Esmaltado Semipermanente',  50, 9000),
  ('33333333-3333-3333-3333-333333333333', 'Estética',   'Lifting de Pestañas',       60, 16000);

-- ── PROFESIONALES ──────────────────────────────────────────────────────────────
insert into professionals (business_id, name, role, commission, avatar_url, specialties, schedule) values
  ('11111111-1111-1111-1111-111111111111', 'María González', 'Estilista Principal', 40, 'https://ui-avatars.com/api/?name=Maria+Gonzalez&background=15120F&color=CBA35C', array['Corte','Color','Estética'], '{"Lun":["09:00","10:00","11:30","14:00"],"Mar":["09:00","10:00","11:30"]}'::jsonb),
  ('11111111-1111-1111-1111-111111111111', 'Lucas Torres',   'Cosmiatra',           35, 'https://ui-avatars.com/api/?name=Lucas+Torres&background=15120F&color=CBA35C', array['Limpieza Facial','Tratamientos'], '{"Lun":["10:00","11:30","14:00"]}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'Diego Russo',    'Maestro Barbero',     45, 'https://ui-avatars.com/api/?name=Diego+Russo&background=15120F&color=CBA35C', array['Corte clásico','Barba','Afeitado'], '{"Lun":["10:00","12:00","16:00"]}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'Martín Silva',   'Barbero Senior',      38, 'https://ui-avatars.com/api/?name=Martin+Silva&background=15120F&color=CBA35C', array['Fade','Diseño'], '{"Mar":["10:00","12:00","16:00"]}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'Sofía Ramírez',  'Esteticista',         42, 'https://ui-avatars.com/api/?name=Sofia+Ramirez&background=15120F&color=CBA35C', array['Masajes','Lifting'], '{"Mar":["10:00","11:00","15:00"]}'::jsonb);

-- ── PRODUCTOS ────────────────────────────────────────────────────────────────────
insert into products (business_id, name, category, stock, cost_price, sale_price) values
  ('11111111-1111-1111-1111-111111111111', 'Shampoo Loreal Gold',         'Cabello', 12, 5500, 8500),
  ('11111111-1111-1111-1111-111111111111', 'Mascarilla Nutritiva 500ml',  'Cabello', 8,  4200, 7000),
  ('11111111-1111-1111-1111-111111111111', 'Sérum Anti-age 30ml',         'Facial',  5,  9000, 15000),
  ('22222222-2222-2222-2222-222222222222', 'Pomada Mate Mr. Pompadour',   'Cabello', 20, 3000, 5500),
  ('22222222-2222-2222-2222-222222222222', 'Aceite de Barba Artesanal',   'Barba',   15, 2500, 4500),
  ('33333333-3333-3333-3333-333333333333', 'Esmalte Semipermanente',      'Uñas',    30, 1200, 2800);

-- ── SUSCRIPCIONES ────────────────────────────────────────────────────────────────
insert into subscriptions (business_id, plan_id, billing_cycle, status, start_date, next_billing_date, payment_method, contact_email, notes) values
  ('11111111-1111-1111-1111-111111111111', 'Pro',        'monthly', 'active', '2026-01-01', '2026-07-01', 'Mercado Pago',           'admin@elegance.com',  ''),
  ('22222222-2222-2222-2222-222222222222', 'Pro',        'annual',  'active', '2026-02-15', '2027-02-15', 'Transferencia bancaria', 'admin@gentleman.com', 'Descuento por pago anual.'),
  ('33333333-3333-3333-3333-333333333333', 'Enterprise', 'monthly', 'active', '2025-11-01', '2026-07-01', 'Mercado Pago',           'admin@aura.com',      '');
