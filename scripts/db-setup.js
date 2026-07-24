// Setup completo de la base de datos LOCAL (o cualquier Postgres vía DATABASE_URL).
//   1) configurar backend/.env (DATABASE_URL)
//   2) crear la base:  createdb galart   (o con psql: CREATE DATABASE galart;)
//   3) npm install
//   4) npm run db:setup
//
// Ejecuta 001_schema.sql, 002_seed.sql y luego los usuarios demo (con bcrypt).
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pool } from '../src/config/db.js';
import { hashPassword } from '../src/utils/password.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlDir = join(__dirname, '..', 'sql');

const BIZ = {
  elegance:  '11111111-1111-1111-1111-111111111111',
  gentleman: '22222222-2222-2222-2222-222222222222',
  aura:      '33333333-3333-3333-3333-333333333333',
};

const demoUsers = [
  { role: 'superadmin', name: 'Tomas Elia',      email: 'super@estetica.app',   password: 'super123',   business_id: null },
  { role: 'admin',      name: 'Carolina Vidal',  email: 'admin@elegance.com',   password: 'admin123',   business_id: BIZ.elegance },
  { role: 'admin',      name: 'Roberto Suárez',  email: 'admin@gentleman.com',  password: 'admin123',   business_id: BIZ.gentleman },
  { role: 'admin',      name: 'Patricia Méndez', email: 'admin@aura.com',       password: 'admin123',   business_id: BIZ.aura },
  { role: 'employee',   name: 'Pedro Gómez',     email: 'pedro@elegance.com',   password: 'emp123',     business_id: BIZ.elegance },
  { role: 'employee',   name: 'Camila Ruiz',     email: 'camila@gentleman.com', password: 'emp123',     business_id: BIZ.gentleman },
  { role: 'client',     name: 'Ana Pérez',       email: 'ana@test.com',         password: 'cliente123', business_id: null },
  { role: 'client',     name: 'Juan López',      email: 'juan@test.com',        password: 'cliente123', business_id: null },
];

async function run() {
  console.log('→ Ejecutando 001_schema.sql ...');
  await pool.query(readFileSync(join(sqlDir, '001_schema.sql'), 'utf8'));

  console.log('→ Ejecutando 002_seed.sql ...');
  await pool.query(readFileSync(join(sqlDir, '002_seed.sql'), 'utf8'));

  console.log('→ Creando usuarios demo ...');
  for (const u of demoUsers) {
    const password_hash = await hashPassword(u.password);
    const [first, ...rest] = u.name.split(' ');
    await pool.query(
      `insert into users (role, first_name, last_name, name, email, password_hash, provider, business_id, avatar_url)
       values ($1,$2,$3,$4,$5,$6,'local',$7,$8)
       on conflict (email) do update set password_hash = excluded.password_hash, business_id = excluded.business_id`,
      [u.role, first, rest.join(' '), u.name, u.email, password_hash, u.business_id,
       `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&background=15120F&color=CBA35C`]
    );
    console.log(`   ✓ ${u.role.padEnd(10)} ${u.email}  (pass: ${u.password})`);
  }

  console.log('→ Vinculando admin_id de cada negocio ...');
  for (const [key, bizId] of Object.entries(BIZ)) {
    const email = key === 'elegance' ? 'admin@elegance.com' : key === 'gentleman' ? 'admin@gentleman.com' : 'admin@aura.com';
    await pool.query(
      `update businesses set admin_id = (select id from users where email = $1) where id = $2`,
      [email, bizId]
    );
  }

  console.log('\n✅ Base de datos lista.');
  await pool.end();
  process.exit(0);
}

run().catch(async (e) => {
  const detail = e.message || e.code || (e.errors && e.errors.map((x) => x.message).join('; ')) || String(e);
  console.error('✗ Error en db:setup:', detail);
  if (e.code === 'ECONNREFUSED' || (e.errors && e.errors.some((x) => x.code === 'ECONNREFUSED'))) {
    console.error('   → No se pudo conectar a Postgres. Verificá que el servicio esté corriendo y que DATABASE_URL (host/puerto/usuario/contraseña) sea correcto en backend/.env');
  }
  await pool.end();
  process.exit(1);
});
