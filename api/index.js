// Entrypoint serverless para Vercel: envuelve la app Express.
import serverless from 'serverless-http';
import app from '../src/app.js';

export default serverless(app);
