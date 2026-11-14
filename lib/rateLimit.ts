import Redis from 'ioredis';
import { redisConnection } from './redis';

let client: Redis | null = null;
function redis() {
  if (!client) client = new Redis({ ...(redisConnection as any), maxRetriesPerRequest: 1, lazyConnect: false });
  return client;
}

/** Jednostavan limit po ključu u fiksnom prozoru. Ako Redis nije dostupan, ne blokira. */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  try {
    const k = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSec)}`;
    const n = await redis().incr(k);
    if (n === 1) await redis().expire(k, windowSec);
    return n <= limit;
  } catch {
    return true;
  }
}
