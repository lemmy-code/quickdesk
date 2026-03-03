import http from 'http';
import { app } from './http/app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { prisma } from './lib/db';
import { pubClient, subClient } from './lib/redis';
import { setupSocketIO } from './socket';

const server = http.createServer(app);
const io = setupSocketIO(server);

async function start() {
  server.listen(env.PORT, () => {
    logger.info(`Server running on port ${env.PORT}`);
  });
}

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down gracefully`);

  // Hard kill after 10 seconds if graceful shutdown stalls
  const forceExit = setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  try {
    // 1. Stop accepting new connections
    io.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    logger.info('HTTP server closed');

    // 2. Disconnect data stores
    await prisma.$disconnect();
    pubClient.disconnect();
    subClient.disconnect();
    logger.info('All connections closed');
  } catch (err) {
    logger.error(err, 'Error during shutdown');
  }

  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start().catch((err) => {
  logger.fatal(err, 'Failed to start server');
  process.exit(1);
});

export { server };
