import { prisma } from '@/lib/prisma';
import { requirePageUser } from '@/lib/session';
import { postTypeLabel } from '@/lib/postTypes';
import { fmtDay, fmtTime, platformLabel } from '@/lib/format';
import ApproveCard from '@/components/ApproveCard';

export default async function ApprovalPage() {
  const user = await requirePageUser(['OWNER', 'ADMIN']);
  const restaurant = await prisma.restaurant.findUnique({ where: { id: user.restaurantId } });
  const tz = restaurant?.timezone ?? 'Europe/Sarajevo';
  const posts = await prisma.post.findMany({
    where: { restaurantId: user.restaurantId, status: 'PENDING_APPROVAL' },
    include: { socialAccount: { select: { platform: true, accountName: true } }, createdBy: { select: { name: true, email: true } } },
    orderBy: { scheduledFor: 'asc' },
  });

  const groups = new Map<string, typeof posts>();
  for (const p of posts) groups.set(p.groupId, [...(groups.get(p.groupId) ?? []), p]);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-mm-ink">Odobrenje</h1>
        <p className="text-sm text-mm-muted">
          {restaurant?.autoPublishMinutes
            ? `Ako ne odgovoriš, objava ide automatski ${restaurant.autoPublishMinutes} min prije termina.`
            : 'Nijedna objava ne ide bez tvog odobrenja.'}
        </p>
      </div>
      {groups.size === 0 && (
        <div className="card py-10 text-center">
          <h2 className="text-lg font-bold text-mm-ink">Sve je odobreno</h2>
          <p className="text-sm text-mm-muted">Nove objave od osoblja pojavljuju se ovdje i stižu ti na email.</p>
        </div>
      )}
      {[...groups.entries()].map(([groupId, items]) => {
        const p = items[0];
        return (
          <article key={groupId} className="card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-bold text-mm-ink">{postTypeLabel(p.type)}</p>
                <p className="text-xs text-mm-muted">
                  {p.createdBy?.name || p.createdBy?.email || 'Osoblje'} · {items.map((i) => platformLabel(i.platform)).join(' i ')} · {fmtDay(p.scheduledFor, tz)} u {fmtTime(p.scheduledFor, tz)}
                </p>
              </div>
              {p.approvalDeadline && (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">
                  Automatski u {fmtTime(p.approvalDeadline, tz)}
                </span>
              )}
            </div>
            {p.mediaUrls[0] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.mediaUrls[0]} alt="Fotografija objave" className="aspect-[4/5] w-full rounded-xl object-cover" />
            )}
            <ApproveCard groupId={groupId} initialContent={p.content ?? ''} timeLabel={fmtTime(p.scheduledFor, tz)} />
          </article>
        );
      })}
    </div>
  );
}
