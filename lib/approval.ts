import { prisma } from './prisma';
import { enqueuePublish } from './redis';

/**
 * Odobrava grupu objava. Atomično mijenja samo stavke koje još čekaju,
 * pa ručno i automatsko odobrenje ne mogu oba zakazati istu objavu.
 */
export async function approveGroup(opts: {
  groupId: string;
  restaurantId?: string;
  approvedById: string | null;
  auto: boolean;
  content?: string;
}) {
  const where = {
    groupId: opts.groupId,
    status: 'PENDING_APPROVAL' as const,
    ...(opts.restaurantId ? { restaurantId: opts.restaurantId } : {}),
  };
  const pending = await prisma.post.findMany({ where, select: { id: true } });
  if (pending.length === 0) return 0;

  const result = await prisma.post.updateMany({
    where: { ...where, id: { in: pending.map((p) => p.id) } },
    data: {
      status: 'SCHEDULED',
      approvedById: opts.approvedById,
      approvedAt: new Date(),
      autoApproved: opts.auto,
      ...(opts.content !== undefined ? { content: opts.content || null } : {}),
    },
  });

  const posts = await prisma.post.findMany({
    where: { id: { in: pending.map((p) => p.id) }, status: 'SCHEDULED' },
    select: { id: true, scheduledFor: true },
  });
  // Ako je termin već prošao (vlasnica odobrila kasno), objavi odmah
  await Promise.all(posts.map((p) => enqueuePublish(p.id, p.scheduledFor)));
  return result.count;
}
