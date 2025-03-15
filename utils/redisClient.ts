import Redis from 'ioredis';

if (!process.env.REDIS_URL) {
  throw new Error('REDIS_URL environment variable is required');
}

const redisClient = new Redis(process.env.REDIS_URL);
redisClient.on('error', (err) => console.error('Redis error', err));

export default redisClient;
