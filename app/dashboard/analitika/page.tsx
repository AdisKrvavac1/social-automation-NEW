import { prisma } from '@/lib/prisma';
import { requirePageUser } from '@/lib/session';
import { postTypeLabel } from '@/lib/postTypes';
import { platformLabel } from '@/lib/format';

export default async function AnalyticsPage() {
  const user = await requirePageUser(['OWNER', 'ADMIN']);
  const since = new Date(Date.now() - 30 * 864e5);
  const where = { restaurantId: user.restaurantId, status: 'PUBLISHED' as const, publishedAt: { gte: since } };

  const [totals, byType, top, approvals] = await Promise.all([
    prisma.post.aggregate({ where, _sum: { viewsCount: true, likesCount: true, commentsCount: true, sharesCount: true }, _count: { id: true } }),
    prisma.post.groupBy({ by: ['type'], where, _sum: { viewsCount: true }, _count: { id: true } }),
    prisma.post.findMany({ where, orderBy: [{ viewsCount: 'desc' }, { likesCount: 'desc' }], take: 5 }),
    prisma.post.groupBy({ by: ['autoApproved'], where: { restaurantId: user.restaurantId, approvedAt: { gte: since } }, _count: { id: true } }),
  ]);

  const nf = (n: number | null | undefined) => (n ?? 0).toLocaleString('bs-BA');
  const maxType = Math.max(1, ...byType.map((t) => t._sum.viewsCount ?? 0));
  const auto = approvals.find((a) => a.autoApproved)?._count.id ?? 0;
  const manual = approvals.find((a) => !a.autoApproved)?._count.id ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-mm-ink">Izvještaj, zadnjih 30 dana</h1>
        <p className="text-sm text-mm-muted">Podaci se povlače s Facebooka i Instagrama svakih 6 sati.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Objava', totals._count.id],
          ['Doseg (Instagram)', totals._sum.viewsCount],
          ['Sviđanja', totals._sum.likesCount],
          ['Komentari', totals._sum.commentsCount],
        ].map(([label, v]) => (
          <div key={label as string} className="card">
            <p className="text-xs text-mm-muted">{label}</p>
            <p className="text-2xl font-bold tabular-nums text-mm-ink">{nf(v as number)}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="card space-y-3">
          <h2 className="font-bold text-mm-ink">Doseg po vrsti objave</h2>
          {byType.length === 0 && <p className="text-sm text-mm-muted">Još nema objavljenih objava.</p>}
          {byType.map((t) => (
            <div key={t.type} className="space-y-1">
              <div className="flex justify-between text-sm"><span>{postTypeLabel(t.type)} ({t._count.id})</span><span className="tabular-nums">{nf(t._sum.viewsCount)}</span></div>
              <div className="h-2.5 overflow-hidden rounded-full bg-mm-tint"><div className="h-full bg-mm-green" style={{ width: `${((t._sum.viewsCount ?? 0) / maxType) * 100}%` }} /></div>
            </div>
          ))}
        </section>
        <section className="card space-y-2">
          <h2 className="font-bold text-mm-ink">Odobrenja</h2>
          <p className="text-sm">Ručno odobreno: <b className="tabular-nums">{manual}</b></p>
          <p className="text-sm">Automatski (istekao rok): <b className="tabular-nums">{auto}</b></p>
        </section>
      </div>
      <section className="card overflow-x-auto">
        <h2 className="mb-2 font-bold text-mm-ink">Najbolje objave</h2>
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-mm-line text-xs uppercase text-mm-muted"><th className="py-2">Mreža</th><th>Vrsta</th><th>Tekst</th><th className="text-right">Doseg</th><th className="text-right">Sviđanja</th></tr></thead>
          <tbody className="divide-y divide-mm-line">
            {top.map((p) => (
              <tr key={p.id}><td className="py-2">{platformLabel(p.platform)}</td><td>{postTypeLabel(p.type)}</td><td className="max-w-xs truncate">{p.content || '[fotografija]'}</td><td className="text-right tabular-nums">{nf(p.viewsCount)}</td><td className="text-right tabular-nums">{nf(p.likesCount)}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
