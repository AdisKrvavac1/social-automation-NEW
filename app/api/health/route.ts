import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { publishingQueue, redisConnection } from '@/lib/redis';
import Redis from 'ioredis';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startTime = Date.now();

  const healthStatus = {
    status: 'ok' as 'ok' | 'degraded' | 'error',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    responseTimeMs: 0,
    services: {
      database: { status: 'down' as 'up' | 'down', latencyMs: 0, error: null as string | null },
      redis: { status: 'down' as 'up' | 'down', latencyMs: 0, error: null as string | null },
      bullmqWorker: {
        status: 'down' as 'up' | 'down',
        activeWorkersCount: 0,
        waitingJobsCount: 0,
        error: null as string | null,
      },
    },
  };

  let redisClient: Redis | null = null;

  try {
    const dbStart = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      healthStatus.services.database.status = 'up';
      healthStatus.services.database.latencyMs = Date.now() - dbStart;
    } catch (dbErr: any) {
      healthStatus.services.database.error = dbErr.message || 'Database connection failed';
    }

    const redisStart = Date.now();
    try {
      redisClient = new Redis({
        ...(redisConnection as any),
        maxRetriesPerRequest: 1,
        connectTimeout: 3000,
      });
      const pingResponse = await redisClient.ping();
      if (pingResponse === 'PONG') {
        healthStatus.services.redis.status = 'up';
        healthStatus.services.redis.latencyMs = Date.now() - redisStart;
      }
    } catch (redisErr: any) {
      healthStatus.services.redis.error = redisErr.message || 'Redis connection failed';
    }

    if (healthStatus.services.redis.status === 'up') {
      try {
        const workers = await publishingQueue.getWorkers();
        const waitingCount = await publishingQueue.getWaitingCount();

        healthStatus.services.bullmqWorker.activeWorkersCount = workers.length;
        healthStatus.services.bullmqWorker.waitingJobsCount = waitingCount;

        if (workers.length > 0) {
          healthStatus.services.bullmqWorker.status = 'up';
        } else {
          healthStatus.services.bullmqWorker.error = 'Nema aktivnih BullMQ workera u redu čekanja.';
        }
      } catch (workerErr: any) {
        healthStatus.services.bullmqWorker.error = workerErr.message || 'Queue inspection failed';
      }
    }

    const isDbUp = healthStatus.services.database.status === 'up';
    const isRedisUp = healthStatus.services.redis.status === 'up';
    const isWorkerUp = healthStatus.services.bullmqWorker.status === 'up';

    if (isDbUp && isRedisUp && isWorkerUp) {
      healthStatus.status = 'ok';
    } else if (isDbUp && isRedisUp && !isWorkerUp) {
      healthStatus.status = 'degraded';
    } else {
      healthStatus.status = 'error';
    }

    healthStatus.responseTimeMs = Date.now() - startTime;
    // 200 i kad worker nije gore (degraded), da Railway healthcheck weba ne zavisi od worker servisa
    return NextResponse.json(healthStatus, { status: healthStatus.status === 'error' ? 503 : 200 });
  } finally {
    if (redisClient) redisClient.disconnect();
  }
}
