// Entrypoint para Vercel. Vercel (@vercel/node) acepta una app de Express
// exportada directamente como handler (req, res). No usamos serverless-http
// porque está pensado para AWS Lambda y puede manejar mal el preflight/OPTIONS.
import app from '../src/app.js';

export default app;
