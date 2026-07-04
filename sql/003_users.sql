-- =============================================================================
-- EstéticaHub — Usuarios demo (contraseñas hasheadas con bcrypt)
-- Ejecutar DESPUÉS de 001_schema.sql y 002_seed.sql, en Supabase → SQL Editor.
--
-- Contraseñas (para probar):
--   super@estetica.app   → super123
--   admin@elegance.com   → admin123     (mismos: admin@gentleman.com, admin@aura.com)
--   pedro@elegance.com   → emp123        (mismo: camila@gentleman.com)
--   ana@test.com         → cliente123    (mismo: juan@test.com)
--
-- NOTA: los hashes ya incluyen su propio salt; sirven para todos los usuarios
-- que compartan la misma contraseña. En producción, creá usuarios reales vía la API.
-- =============================================================================

insert into users (role, first_name, last_name, name, email, password_hash, provider, business_id, avatar_url) values
  ('superadmin','Tomas','Elia','Tomas Elia','super@estetica.app',
    '$2a$10$pY4oFJJCu/6FJTWy.hhrO.zuJi8I8VwZalBqKPQwxn3Y/qPwy6n/u','local', null,
    'https://ui-avatars.com/api/?name=Tomas+Elia&background=15120F&color=CBA35C'),

  ('admin','Carolina','Vidal','Carolina Vidal','admin@elegance.com',
    '$2a$10$AZoxQS4Lt2W3GhJLKGvzveRRk1HrPaH4GYrVMoO3DHgk04WbLdqAW','local','11111111-1111-1111-1111-111111111111',
    'https://ui-avatars.com/api/?name=Carolina+Vidal&background=15120F&color=CBA35C'),
  ('admin','Roberto','Suárez','Roberto Suárez','admin@gentleman.com',
    '$2a$10$AZoxQS4Lt2W3GhJLKGvzveRRk1HrPaH4GYrVMoO3DHgk04WbLdqAW','local','22222222-2222-2222-2222-222222222222',
    'https://ui-avatars.com/api/?name=Roberto+Suarez&background=15120F&color=CBA35C'),
  ('admin','Patricia','Méndez','Patricia Méndez','admin@aura.com',
    '$2a$10$AZoxQS4Lt2W3GhJLKGvzveRRk1HrPaH4GYrVMoO3DHgk04WbLdqAW','local','33333333-3333-3333-3333-333333333333',
    'https://ui-avatars.com/api/?name=Patricia+Mendez&background=15120F&color=CBA35C'),

  ('employee','Pedro','Gómez','Pedro Gómez','pedro@elegance.com',
    '$2a$10$NZaNO0KC/rncgAuishGZVe7uYEDSHQtwXZf.c0oeo2uskbahNxOW6','local','11111111-1111-1111-1111-111111111111',
    'https://ui-avatars.com/api/?name=Pedro+Gomez&background=15120F&color=CBA35C'),
  ('employee','Camila','Ruiz','Camila Ruiz','camila@gentleman.com',
    '$2a$10$NZaNO0KC/rncgAuishGZVe7uYEDSHQtwXZf.c0oeo2uskbahNxOW6','local','22222222-2222-2222-2222-222222222222',
    'https://ui-avatars.com/api/?name=Camila+Ruiz&background=15120F&color=CBA35C'),

  ('client','Ana','Pérez','Ana Pérez','ana@test.com',
    '$2a$10$98cTN8eEYDBvblzoS8WixOXsjsau3eJq0bpUI9iKEJOJkMZOxHrue','local', null,
    'https://ui-avatars.com/api/?name=Ana+Perez&background=15120F&color=CBA35C'),
  ('client','Juan','López','Juan López','juan@test.com',
    '$2a$10$98cTN8eEYDBvblzoS8WixOXsjsau3eJq0bpUI9iKEJOJkMZOxHrue','local', null,
    'https://ui-avatars.com/api/?name=Juan+Lopez&background=15120F&color=CBA35C')
on conflict (email) do nothing;

-- Vincular cada negocio con su administrador (businesses.admin_id)
update businesses set admin_id = (select id from users where email = 'admin@elegance.com')  where id = '11111111-1111-1111-1111-111111111111';
update businesses set admin_id = (select id from users where email = 'admin@gentleman.com') where id = '22222222-2222-2222-2222-222222222222';
update businesses set admin_id = (select id from users where email = 'admin@aura.com')      where id = '33333333-3333-3333-3333-333333333333';
