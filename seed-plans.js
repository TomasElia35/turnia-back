import { one } from './src/config/db.js';

async function seed() {
  try {
    await one(`
      insert into plans (id, name, monthly_price, annual_price, max_professionals, max_services, features) values
      ('Starter', 'Starter', 14900, 149000, 2, 5, array['Hasta 2 profesionales','Hasta 5 servicios','Agenda básica','Soporte por email']),
      ('Pro', 'Pro', 29900, 299000, 10, 20, array['Hasta 10 profesionales','Hasta 20 servicios','Agenda avanzada','Facturación y comisiones','Gestión de productos','Soporte prioritario']),
      ('Enterprise', 'Enterprise', 59900, 599000, null, null, array['Profesionales ilimitados','Servicios ilimitados','Reportes avanzados','Acceso API','Soporte dedicado'])
      on conflict (id) do nothing returning id
    `);
    console.log('Plans seeded successfully.');
  } catch (err) {
    console.error('Error seeding plans:', err);
  }
}
seed();
