'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import MediaUploader from './MediaUploader';
import { POST_TYPES, type PostTypeId } from '@/lib/postTypes';

type Account = { id: string; platform: string; accountName: string };

function defaultSlot(defaultTime: string) {
  const [h, m] = defaultTime.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  if (d.getTime() < Date.now() + 15 * 60 * 1000) d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(h)}:${pad(m)}` };
}

export default function NewPostForm({
  accounts,
  defaultTime,
  canApprove,
}: {
  accounts: Account[];
  defaultTime: string;
  canApprove: boolean;
}) {
  const router = useRouter();
  const slot = useMemo(() => defaultSlot(defaultTime), [defaultTime]);
  const [type, setType] = useState<PostTypeId>('DNEVNI_MENI');
  const [notes, setNotes] = useState('');
  const [media, setMedia] = useState('');
  const [selected, setSelected] = useState<string[]>(accounts.map((a) => a.id));
  const [date, setDate] = useState(slot.date);
  const [time, setTime] = useState(slot.time);
  const [variants, setVariants] = useState<string[]>([]);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [content, setContent] = useState('');
  const [withEnglish, setWithEnglish] = useState(false);
  const [busy, setBusy] = useState<'ai' | 'send' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const hint = POST_TYPES.find((t) => t.id === type)?.hint;

  async function generate() {
    setBusy('ai');
    setError(null);
    try {
      const res = await fetch('/api/ai/generate-caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, notes, withEnglish }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setVariants(data.variants);
      setHashtags(data.hashtags);
      setContent(`${data.variants[0]}\n\n${data.hashtags.join(' ')}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    setBusy('send');
    setError(null);
    try {
      const scheduledFor = new Date(`${date}T${time}`).toISOString();
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, socialAccountIds: selected, content, mediaUrls: media ? [media] : [], scheduledFor }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDone(data.message);
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (accounts.length === 0) {
    return (
      <div className="card space-y-2">
        <h2 className="text-lg font-bold text-mm-ink">Nema povezanih mreža</h2>
        <p className="text-sm">Vlasnik ili Norvel admin prvo treba povezati Facebook stranicu i Instagram u dijelu „Nalozi“.</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="card space-y-4 py-10 text-center">
        <p className="text-4xl text-mm-green" aria-hidden="true">✓</p>
        <h2 className="text-xl font-bold text-mm-ink">{done}</h2>
        <p className="text-sm text-mm-muted">{canApprove ? 'Objava će izaći u zakazanom terminu.' : 'Vlasnica dobija obavještenje i odobrava objavu.'}</p>
        <button type="button" className="btn-primary mx-auto" onClick={() => { setDone(null); setNotes(''); setMedia(''); setContent(''); setVariants([]); }}>
          Nova objava
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h2 className="label">1. Šta objavljujemo?</h2>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Vrsta objave">
          {POST_TYPES.map((t) => (
            <button key={t.id} type="button" aria-pressed={type === t.id} onClick={() => setType(t.id)} className={`chip ${type === t.id ? 'chip-on' : ''}`}>
              {t.label}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="label">2. Fotografija</h2>
        <MediaUploader value={media} onChange={setMedia} />
      </section>

      <section className="space-y-2">
        <label htmlFor="notes" className="label">3. Jela ili napomena</label>
        <textarea id="notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={hint} className="field" />
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn" onClick={generate} disabled={busy !== null || notes.trim().length < 2}>
            {busy === 'ai' ? 'Pišem tekst…' : variants.length ? 'Napiši ponovo' : 'Napiši tekst (AI)'}
          </button>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={withEnglish} onChange={(e) => setWithEnglish(e.target.checked)} /> i na engleskom
          </label>
        </div>
      </section>

      {variants.length > 0 && (
        <section className="space-y-2">
          <h2 className="label">Izaberi varijantu</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {variants.map((v, i) => (
              <button key={i} type="button" onClick={() => setContent(`${v}\n\n${hashtags.join(' ')}`)} className="rounded-xl border-[1.5px] border-mm-line bg-white p-3 text-left text-sm hover:border-mm-green">
                <b className="text-mm-ink">Varijanta {'AB'[i]}</b>
                <span className="mt-1 line-clamp-4 block whitespace-pre-line">{v}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <label htmlFor="content" className="label">4. Tekst objave</label>
        <textarea id="content" rows={9} value={content} onChange={(e) => setContent(e.target.value)} className="field" placeholder="Napiši ili generiši tekst…" />
        <p className={`text-xs ${content.length > 2200 ? 'text-red-700' : 'text-mm-muted'}`}>{content.length} / 2200 znakova</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <h2 className="label">Mreže</h2>
          {accounts.map((a) => (
            <label key={a.id} className="flex items-center gap-3 rounded-xl border border-mm-line bg-white p-3 text-sm">
              <input type="checkbox" checked={selected.includes(a.id)} onChange={() => setSelected((s) => (s.includes(a.id) ? s.filter((x) => x !== a.id) : [...s, a.id]))} />
              <span><b className="text-mm-ink">{a.platform === 'INSTAGRAM' ? 'Instagram' : a.platform === 'FACEBOOK' ? 'Facebook' : a.platform}</b> · {a.accountName}</span>
            </label>
          ))}
        </div>
        <div className="space-y-2">
          <h2 className="label">Termin objave</h2>
          <div className="flex gap-2">
            <input type="date" aria-label="Datum" value={date} onChange={(e) => setDate(e.target.value)} className="field" />
            <input type="time" aria-label="Vrijeme" value={time} onChange={(e) => setTime(e.target.value)} className="field max-w-[140px]" />
          </div>
        </div>
      </section>

      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <button type="button" className="btn-primary w-full" onClick={submit} disabled={busy !== null || selected.length === 0 || (!content.trim() && !media)}>
        {busy === 'send' ? 'Šaljem…' : canApprove ? 'Zakaži objavu' : 'Pošalji vlasnici na odobrenje'}
      </button>
    </div>
  );
}
