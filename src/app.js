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

const app = express();

app.use(cors({
  origin: (origin, cb) => {
    // Permite herramientas sin origin (curl/postman) y los orígenes whitelisteados.
    if (!origin || env.corsOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`Origen no permitido por CORS: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json());

// Healthcheck
app.get('/', (req, res) => res.json({ ok: true, service: 'turnia-backend' }));
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

app.use(notFound);
app.use(errorHandler);

export default app;
