import pg from 'pg';
import { env } from './env.js';

const { Pool } = pg;

// Pool de conexiones. Sirve para Postgres local (dev) y Supabase (prod).
// En serverless conviene usar la connection string en modo pooler de Supabase.
export const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: env.dbSsl ? { rejectUnauthorized: false } : false,
  max: 10,
});

pool.on('error', (err) => console.error('[db] error inesperado en el pool:', err.message));

// Ejecuta una query y devuelve el result completo.
export const query = (text, params) => pool.query(text, params);

// Devuelve la primera fila (o null).
export const one = async (text, params) => {
  const { rows } = await pool.query(text, params);
  return rows[0] || null;
};

// Devuelve todas las filas.
export const many = async (text, params) => {
  const { rows } = await pool.query(text, params);
  return rows;
};
