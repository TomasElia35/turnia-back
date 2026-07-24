import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

import authRoutes from './routes/auth.routes.js';
import businessRoutes from './routes/businesses.routes.js';
import serviceRoutes from './routes/services.routes.js';
import professionalRoutes from './routes/professionals.routes.js';
import productRoutes from './routes/products.routes.js';
import bookingRoutes from './routes/bookings.routes.js';
import subscriptionRoutes from './routes/subscriptions.routes.js';
import userRoutes from './routes/users.routes.js';
import reportRoutes from './routes/reports.routes.js';
import uploadRoutes from './routes/uploads.routes.js';
import reviewRoutes from './routes/reviews.routes.js';

const app = express();

// CORS robusto: acepta requests sin origin (curl/postman), cualquier subdominio
// *.vercel.app (previews y producción) y los orígenes configurados en CORS_ORIGINS.
// Nunca lanza error (no rompe el preflight); si no está permitido, simplemente no
// habilita el header y el navegador lo bloquea.
const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (env.corsOrigins.includes('*') || env.corsOrigins.includes(origin)) return true;
  try {
    const host = new URL(origin).hostname;
    if (host === 'localhost' || host === '127.0.0.1') return true;
    if (host.endsWith('.vercel.app')) return true;
  } catch (_) { /* origin inválido */ }
  return false;
};

const corsOptions = {
  origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
  credentials: true,
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // responde el preflight explícitamente
app.use(express.json());

// Healthcheck
app.get('/', (req, res) => res.json({ ok: true, service: 'galart-backend' }));
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api/businesses', businessRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/professionals', professionalRoutes);
app.use('/api/products', productRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/reviews', reviewRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
