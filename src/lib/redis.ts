import Redis from 'ioredis';
import { env } from '../config/env';
import { logger } from './logger';

function createClient(name: string): Redis {
  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 200, 2000);
      return delay;
    },
  });

  client.on('connect', () => logger.info(`Redis ${name} connected`));
  client.on('error', (err) => logger.error(err, `Redis ${name} error`));

  return client;
}

export const pubClient = createClient('pub');
export const subClient = createClient('sub');
