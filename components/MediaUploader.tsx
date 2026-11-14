'use client';

import { useState } from 'react';

export default function MediaUploader({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isVideo, setIsVideo] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const res = await fetch('/api/upload/presigned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: file.type, size: file.size }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const put = await fetch(data.presignedUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!put.ok) throw new Error('Učitavanje nije uspjelo. Pokušaj ponovo.');
      setIsVideo(file.type.startsWith('video/'));
      onChange(data.publicUrl);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  return (
    <div className="space-y-2">
      <label className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-[1.5px] border-dashed border-[#B9C9A6] bg-white p-4 text-center text-sm font-semibold text-mm-dark">
        {uploading ? 'Učitavam…' : value ? 'Promijeni fotografiju' : '+ Slikaj ili izaberi iz galerije'}
        <span className="text-xs font-normal text-mm-muted">JPG, PNG, WebP do 15 MB ili video do 200 MB</span>
        <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" capture="environment" onChange={handleFile} disabled={uploading} className="sr-only" />
      </label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {value && (
        <div className="overflow-hidden rounded-2xl border border-mm-line bg-white">
          {isVideo ? (
            <video src={value} controls className="max-h-72 w-full object-contain" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="Pregled fotografije" className="max-h-72 w-full object-cover" />
          )}
        </div>
      )}
      <p className="text-xs text-mm-muted">Bez lica gostiju na fotografiji, osim uz njihovu saglasnost.</p>
    </div>
  );
}
