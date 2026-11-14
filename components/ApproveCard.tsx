'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ApproveCard({
  groupId,
  initialContent,
  timeLabel,
}: {
  groupId: string;
  initialContent: string;
  timeLabel: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(initialContent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(kind: 'approve' | 'reject') {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${groupId}/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kind === 'approve' && editing ? { content } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.refresh();
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {editing ? (
        <textarea aria-label="Tekst objave" rows={10} value={content} onChange={(e) => setContent(e.target.value)} className="field" />
      ) : (
        <p className="whitespace-pre-line text-sm text-mm-ink">{content || <i className="text-mm-muted">bez teksta</i>}</p>
      )}
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <button type="button" className="btn-primary w-full" disabled={busy} onClick={() => act('approve')}>
        {editing ? `Sačuvaj i objavi u ${timeLabel}` : `Objavi u ${timeLabel}`}
      </button>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-ghost" disabled={busy} onClick={() => setEditing((v) => !v)}>
          {editing ? 'Odustani od izmjene' : 'Izmijeni tekst'}
        </button>
        <button type="button" className="btn-danger" disabled={busy} onClick={() => act('reject')}>Odbij</button>
      </div>
    </div>
  );
}
