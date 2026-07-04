import app from './app.js';
import { env } from './config/env.js';

// Servidor local (desarrollo). En Vercel se usa api/index.js (serverless).
app.listen(env.port, () => {
  console.log(`EstéticaHub backend escuchando en http://localhost:${env.port}`);
});
