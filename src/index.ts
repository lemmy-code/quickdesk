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

  server.close(() => {
    logger.info('HTTP server closed');
  });

  io.close();
  await prisma.$disconnect();
  pubClient.disconnect();
  subClient.disconnect();

  logger.info('All connections closed');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start().catch((err) => {
  logger.fatal(err, 'Failed to start server');
  process.exit(1);
});

export { server };
