import { prisma } from '@/lib/prisma';
import { requirePageUser } from '@/lib/session';
import { platformLabel } from '@/lib/format';
import DisconnectButton from '@/components/DisconnectButton';

export default async function AccountsPage({ searchParams }: { searchParams: { greska?: string; ok?: string } }) {
  const user = await requirePageUser(['OWNER', 'ADMIN']);
  const accounts = await prisma.socialAccount.findMany({
    where: { restaurantId: user.restaurantId },
    orderBy: [{ platform: 'asc' }, { createdAt: 'desc' }],
  });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-mm-ink">Povezani nalozi</h1>
          <p className="text-sm text-mm-muted">Facebook stranica i Instagram profesionalni nalog povezan s njom.</p>
        </div>
        <a href="/api/oauth/meta/connect" className="btn-primary">+ Poveži Facebook i Instagram</a>
      </div>
      {searchParams.greska && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{searchParams.greska}</p>}
      {searchParams.ok && <p className="rounded-lg bg-mm-tint p-3 text-sm text-mm-dark">Nalozi su povezani.</p>}
      {accounts.length === 0 && (
        <div className="card space-y-2 text-sm">
          <p className="font-bold text-mm-ink">Još nema povezanih naloga.</p>
          <p>Instagram mora biti profesionalni (Business) nalog povezan s Facebook stranicom restorana.</p>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {accounts.map((a) => (
          <div key={a.id} className="card flex flex-col gap-3">
            <div>
              <span className="rounded-md bg-mm-tint px-2 py-0.5 text-xs font-bold text-mm-dark">{platformLabel(a.platform)}</span>
              <h2 className="mt-2 text-lg font-semibold text-mm-ink">{a.accountName}</h2>
            </div>
            <div className="flex items-center justify-between border-t border-mm-line pt-3">
              {a.needsReconnect ? (
                <a href="/api/oauth/meta/connect" className="text-xs font-bold text-red-700 underline">Treba ponovo povezati</a>
              ) : (
                <span className="text-xs font-semibold text-mm-green">● Povezano</span>
              )}
              <DisconnectButton accountId={a.id} accountName={a.accountName} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
