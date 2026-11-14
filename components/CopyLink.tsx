'use client';

import { useState } from 'react';

export default function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <input readOnly value={link} aria-label="Link za postavljanje lozinke" className="field min-w-0 flex-1 text-xs" onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        className="btn-ghost min-h-[40px] shrink-0 px-3 text-sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            /* korisnik može ručno kopirati iz polja */
          }
        }}
      >
        {copied ? 'Kopirano' : 'Kopiraj'}
      </button>
    </div>
  );
}
