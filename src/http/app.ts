import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from '../config/env';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth.routes';
import roomsRoutes from './routes/rooms.routes';
import adminRoutes from './routes/admin.routes';
import { prisma } from '../lib/db';
import { pubClient } from '../lib/redis';

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json());

// Health check — verifies DB and Redis connectivity
app.get('/api/health', async (_req, res) => {
  try {
    await Promise.all([
      prisma.$queryRaw`SELECT 1`,
      pubClient.ping(),
    ]);
    res.json({ status: 'ok', db: 'ok', redis: 'ok' });
  } catch {
    res.status(503).json({ status: 'error', message: 'Service unavailable' });
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomsRoutes);
app.use('/api/admin', adminRoutes);

// Error handler (must be last)
app.use(errorHandler);
