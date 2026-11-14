'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DisconnectButton({ accountId, accountName }: { accountId: string; accountName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
      onClick={async () => {
        if (!window.confirm(`Odspojiti nalog "${accountName}"? Zakazane objave za njega se brišu.`)) return;
        setBusy(true);
        const res = await fetch(`/api/accounts/${accountId}`, { method: 'DELETE' });
        if (!res.ok) window.alert((await res.json()).error);
        router.refresh();
        setBusy(false);
      }}
    >
      {busy ? 'Odspajam…' : 'Odspoji'}
    </button>
  );
}
