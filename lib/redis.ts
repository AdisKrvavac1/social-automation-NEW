import { Queue, type ConnectionOptions } from 'bullmq';

/**
 * Railway daje REDIS_URL (redis://default:pass@host:port). Lokalno se može koristiti
 * REDIS_HOST/REDIS_PORT/REDIS_PASSWORD. family: 0 je potreban za Railway privatnu (IPv6) mrežu.
 */
function buildConnection(): ConnectionOptions {
  const url = process.env.REDIS_URL;
  if (url) {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: Number(u.port || 6379),
      username: u.username || undefined,
      password: u.password ? decodeURIComponent(u.password) : undefined,
      tls: u.protocol === 'rediss:' ? {} : undefined,
      family: 0,
      maxRetriesPerRequest: null,
    };
  }
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    family: 0,
    maxRetriesPerRequest: null,
  };
}

export const redisConnection = buildConnection();

export const QUEUE_NAME = 'mm-objave-queue';

const globalForQueue = globalThis as unknown as { publishingQueue: Queue | undefined };

export const publishingQueue =
  globalForQueue.publishingQueue ??
  new Queue(QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 1000 },
    },
  });

if (process.env.NODE_ENV !== 'production') globalForQueue.publishingQueue = publishingQueue;

/** Zakazuje objavu jedne stavke. Jedinstven jobId sprječava duplu objavu istog posta u istom terminu. */
export async function enqueuePublish(postId: string, scheduledFor: Date) {
  const delay = Math.max(0, scheduledFor.getTime() - Date.now());
  await publishingQueue.add(
    'publish-post',
    { postId },
    { jobId: `publish-${postId}-${scheduledFor.getTime()}`, delay }
  );
}

export async function enqueueAutoApprove(groupId: string, deadline: Date) {
  const delay = Math.max(0, deadline.getTime() - Date.now());
  await publishingQueue.add(
    'auto-approve',
    { groupId },
    { jobId: `auto-approve-${groupId}`, delay, attempts: 5 }
  );
}
