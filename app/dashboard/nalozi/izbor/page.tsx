import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requirePageUser } from '@/lib/session';
import { decryptToken } from '@/lib/encryption';
import { listManagedPages, type MetaPage } from '@/lib/metaPages';

export default async function SelectPage() {
  await requirePageUser(['OWNER', 'ADMIN']);
  const cookie = cookies().get('meta_user_token')?.value;
  if (!cookie) redirect('/dashboard/nalozi?greska=' + encodeURIComponent('Sesija povezivanja je istekla. Pokušaj ponovo.'));

  let pages: MetaPage[] = [];
  try {
    pages = await listManagedPages(decryptToken(cookie));
  } catch {
    redirect('/dashboard/nalozi?greska=' + encodeURIComponent('Ne mogu učitati stranice s Facebooka.'));
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-mm-ink">Izaberi stranicu restorana</h1>
        <p className="text-sm text-mm-muted">Povezuje se Facebook stranica i Instagram nalog koji je s njom povezan.</p>
      </div>
      {pages.length === 0 && <div className="card text-sm">Ovaj Facebook nalog ne upravlja nijednom stranicom ili nisu date dozvole.</div>}
      <div className="space-y-3">
        {pages.map((p) => (
          <form key={p.id} action="/api/oauth/meta/select" method="post" className="card flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-bold text-mm-ink">{p.name}</p>
              <p className="text-xs text-mm-muted">
                {p.instagram_business_account ? `Instagram: @${p.instagram_business_account.username ?? p.instagram_business_account.id}` : 'Bez povezanog Instagram naloga'}
              </p>
            </div>
            <input type="hidden" name="pageId" value={p.id} />
            <button type="submit" className="btn-primary">Poveži</button>
          </form>
        ))}
      </div>
    </div>
  );
}
