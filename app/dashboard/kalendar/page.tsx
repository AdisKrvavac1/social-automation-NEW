import { prisma } from '@/lib/prisma';
import { requirePageUser, canApprove } from '@/lib/session';
import { STATUS_LABELS, postTypeLabel } from '@/lib/postTypes';
import { fmtDay, fmtTime, platformLabel } from '@/lib/format';
import CancelButton from '@/components/CancelButton';

export default async function CalendarPage() {
  const user = await requirePageUser();
  const restaurant = await prisma.restaurant.findUnique({ where: { id: user.restaurantId } });
  const tz = restaurant?.timezone ?? 'Europe/Sarajevo';
  const from = new Date(Date.now() - 7 * 864e5);
  const to = new Date(Date.now() + 21 * 864e5);
  const posts = await prisma.post.findMany({
    where: { restaurantId: user.restaurantId, scheduledFor: { gte: from, lte: to } },
    include: { socialAccount: { select: { accountName: true } } },
    orderBy: { scheduledFor: 'asc' },
  });

  const days = new Map<string, typeof posts>();
  for (const p of posts) {
    const k = fmtDay(p.scheduledFor, tz);
    days.set(k, [...(days.get(k) ?? []), p]);
  }
  const owner = canApprove(user.role);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-mm-ink">Kalendar</h1>
        <p className="text-sm text-mm-muted">Prošla sedmica i sljedeće tri sedmice. Cilj: najmanje 5 objava sedmično.</p>
      </div>
      {days.size === 0 && <div className="card text-sm text-mm-muted">Nema objava u ovom periodu.</div>}
      {[...days.entries()].map(([day, items]) => (
        <section key={day} className="card">
          <h2 className="mb-2 font-bold capitalize text-mm-ink">{day}</h2>
          <ul className="divide-y divide-mm-line">
            {items.map((p) => {
              const st = STATUS_LABELS[p.status];
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  {p.mediaUrls[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.mediaUrls[0]} alt="" className="h-12 w-12 rounded-lg object-cover" />
                  ) : (
                    <div className="h-12 w-12 rounded-lg bg-mm-tint" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-mm-ink">{postTypeLabel(p.type)} · {platformLabel(p.platform)}</p>
                    <p className="text-xs text-mm-muted">
                      {fmtTime(p.scheduledFor, tz)} · {p.socialAccount.accountName}
                      {p.autoApproved ? ' · automatski odobreno' : ''}
                    </p>
                    {p.status === 'FAILED' && p.errorLog && <p className="mt-1 line-clamp-2 text-xs text-red-700">{p.errorLog}</p>}
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${st.cls}`}>{st.label}</span>
                  {owner && ['SCHEDULED', 'PENDING_APPROVAL', 'FAILED'].includes(p.status) && <CancelButton groupId={p.groupId} />}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
