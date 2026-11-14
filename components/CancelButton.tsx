'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CancelButton({ groupId }: { groupId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className="text-xs font-semibold text-red-700 underline-offset-2 hover:underline disabled:opacity-50"
      onClick={async () => {
        if (!window.confirm('Otkazati ovu objavu?')) return;
        setBusy(true);
        const res = await fetch(`/api/posts/${groupId}/reject`, { method: 'POST' });
        if (!res.ok) window.alert((await res.json()).error);
        router.refresh();
        setBusy(false);
      }}
    >
      Otkaži
    </button>
  );
}
