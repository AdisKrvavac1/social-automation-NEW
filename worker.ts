import { Worker, type Job } from 'bullmq';
import { prisma } from './lib/prisma';
import { publishingQueue, redisConnection, QUEUE_NAME, enqueuePublish } from './lib/redis';
import { publishToPlatform } from './lib/publishers';
import { ReconnectRequiredError } from './lib/tokenRefresher';
import { approveGroup } from './lib/approval';
import { cleanOrphanedR2Files } from './lib/r2GarbageCollector';
import { backupDatabaseToR2 } from './lib/dbBackup';
import { syncAllPublishedPostsMetrics } from './lib/analytics';
import { sendPostFailedAlert } from './lib/notifications';

async function registerSystemCrons() {
  const tz = process.env.CRON_TZ || 'Europe/Sarajevo';
  await publishingQueue.add('retry-failed-posts', {}, { repeat: { pattern: '15 */2 * * *', tz }, jobId: 'cron-retry-failed' });
  await publishingQueue.add('sync-analytics', {}, { repeat: { pattern: '30 */6 * * *', tz }, jobId: 'cron-sync-analytics' });
  await publishingQueue.add('r2-garbage-collection', {}, { repeat: { pattern: '0 3 * * 0', tz }, jobId: 'cron-weekly-r2-gc' });
  // Sigurnosna mreža: objave koje su odobrene a nemaju posao u redu (npr. Redis je bio obrisan)
  await publishingQueue.add('requeue-missed', {}, { repeat: { pattern: '*/10 * * * *', tz }, jobId: 'cron-requeue-missed' });
  if (process.env.ENABLE_DB_BACKUP === 'true') {
    await publishingQueue.add('db-backup', {}, { repeat: { pattern: '0 2 * * *', tz }, jobId: 'cron-daily-db-backup' });
  }
  console.log('[Worker] Cron zadaci registrovani.');
}

async function publishPost(postId: string, job: Job) {
  // Atomično preuzimanje: samo SCHEDULED (ili PROCESSING iz prekinutog pokušaja istog posla) ide dalje
  const claimed = await prisma.post.updateMany({
    where: { id: postId, status: { in: ['SCHEDULED', 'PROCESSING'] }, platformPostId: null },
    data: { status: 'PROCESSING' },
  });
  if (claimed.count === 0) return; // odbijeno, već objavljeno ili ne postoji

  const post = await prisma.post.findUnique({ where: { id: postId }, include: { socialAccount: true } });
  if (!post) return;

  try {
    const platformPostId = await publishToPlatform(post);
    await prisma.post.update({
      where: { id: postId },
      data: { status: 'PUBLISHED', platformPostId, publishedAt: new Date(), errorLog: null },
    });
  } catch (err: any) {
    const message = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    const isLastAttempt = err instanceof ReconnectRequiredError || job.attemptsMade + 1 >= (job.opts.attempts || 1);
    await prisma.post.update({
      where: { id: postId },
      // Između pokušaja ostaje SCHEDULED, da sljedeći pokušaj može preuzeti objavu
      data: { status: isLastAttempt ? 'FAILED' : 'SCHEDULED', errorLog: message },
    });
    if (err instanceof ReconnectRequiredError) {
      await job.discard(); // bez ponovnih pokušaja dok se nalog ne poveže
    }
    throw err;
  }
}

const worker = new Worker(
  QUEUE_NAME,
  async (job: Job) => {
    switch (job.name) {
      case 'publish-post':
        return publishPost((job.data as { postId: string }).postId, job);

      case 'auto-approve': {
        const { groupId } = job.data as { groupId: string };
        const n = await approveGroup({ groupId, approvedById: null, auto: true });
        if (n > 0) console.log(`[Worker] Automatski odobrena grupa ${groupId} (${n} objava).`);
        return;
      }

      case 'retry-failed-posts': {
        // Jednom ponovo pokušaj objave koje su pale u zadnja 24 sata zbog privremene greške
        const failed = await prisma.post.findMany({
          where: {
            status: 'FAILED',
            platformPostId: null,
            updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            socialAccount: { needsReconnect: false },
            NOT: { errorLog: { startsWith: '[retried]' } },
          },
          take: 20,
        });
        for (const p of failed) {
          await prisma.post.update({
            where: { id: p.id },
            data: { status: 'SCHEDULED', errorLog: `[retried] ${p.errorLog ?? ''}`.slice(0, 4000) },
          });
          await publishingQueue.add('publish-post', { postId: p.id }, { jobId: `retry-${p.id}-${Date.now()}` });
        }
        return;
      }

      case 'requeue-missed': {
        const missed = await prisma.post.findMany({
          where: { status: 'SCHEDULED', scheduledFor: { lt: new Date(Date.now() - 15 * 60 * 1000) } },
          select: { id: true, scheduledFor: true },
          take: 50,
        });
        for (const p of missed) await enqueuePublish(p.id, p.scheduledFor);
        return;
      }

      case 'sync-analytics':
        return syncAllPublishedPostsMetrics();

      case 'db-backup':
        return backupDatabaseToR2();

      case 'r2-garbage-collection':
        return cleanOrphanedR2Files();
    }
  },
  { connection: redisConnection, concurrency: 5 }
);

worker.on('failed', async (job, err) => {
  if (!job || job.name !== 'publish-post') return;
  console.error(`[Worker] ${job.name} (${job.id}) nije uspio:`, err.message);
  const final = err instanceof ReconnectRequiredError || job.attemptsMade >= (job.opts.attempts || 1);
  if (!final) return;

  const post = await prisma.post.findUnique({
    where: { id: (job.data as { postId: string }).postId },
    include: { socialAccount: { select: { accountName: true } }, restaurant: { select: { id: true } } },
  });
  if (!post || post.status !== 'FAILED') return;
  const owners = await prisma.user.findMany({
    where: { restaurantId: post.restaurant.id, role: 'OWNER' },
    select: { email: true },
  });
  await sendPostFailedAlert({
    to: owners.map((o) => o.email),
    platform: post.platform,
    accountName: post.socialAccount.accountName,
    contentPreview: post.content,
    errorMessage: post.errorLog || err.message,
  });
});

async function shutdown(signal: string) {
  console.log(`[Worker] ${signal}: zatvaram...`);
  await worker.close();
  await publishingQueue.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

registerSystemCrons()
  .then(() => console.log('[Worker] Spreman.'))
  .catch((err) => {
    console.error('[Worker] Greška pri pokretanju:', err);
    process.exit(1);
  });
