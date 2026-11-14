'use client';

import { useState, useTransition } from 'react';
import { changeRole, removeUser, resendInvite, type ActionState } from '@/app/dashboard/korisnici/actions';
import type { AppRole } from '@/lib/session';
import CopyLink from './CopyLink';

type Row = {
  id: string;
  name: string | null;
  email: string;
  role: AppRole;
  roleLabel: string;
  roleHint: string;
  pending: boolean;
  isMe: boolean;
};

export default function UserRow({ user, locked }: { user: Row; locked: boolean }) {
  const [busy, start] = useTransition();
  const [result, setResult] = useState<ActionState>(null);
  const run = (fn: () => Promise<ActionState>) => start(async () => setResult(await fn()));

  return (
    <div className="space-y-2 p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="mr-auto min-w-0">
          <p className="truncate font-semibold text-mm-ink">
            {user.name || user.email}
            {user.isMe && <span className="ml-2 text-xs font-normal text-mm-muted">(ti)</span>}
          </p>
          <p className="truncate text-sm text-mm-muted">{user.email}</p>
        </div>

        {user.pending ? (
          <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800">Čeka aktivaciju</span>
        ) : (
          <span className="text-xs font-semibold text-mm-green">● Aktivan</span>
        )}

        {locked ? (
          <span title={user.roleHint} className="rounded-md bg-mm-tint px-2 py-0.5 text-xs font-bold text-mm-dark">
            {user.roleLabel}
          </span>
        ) : (
          <select
            aria-label={`Uloga za ${user.email}`}
            value={user.role}
            disabled={busy}
            onChange={(e) => run(() => changeRole(user.id, e.target.value as AppRole))}
            className="field w-auto py-1.5 text-sm"
          >
            <option value="STAFF">Osoblje</option>
            <option value="OWNER">Vlasnik</option>
          </select>
        )}
      </div>

      {!locked && (
        <div className="flex flex-wrap gap-2">
          {user.pending && (
            <button type="button" disabled={busy} className="btn-ghost min-h-[36px] px-3 py-1 text-sm" onClick={() => run(() => resendInvite(user.id))}>
              Pošalji ponovo
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            className="rounded-lg bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
            onClick={() => {
              if (window.confirm(`Ukloniti ${user.name || user.email}? Njegove objave ostaju.`)) run(() => removeUser(user.id));
            }}
          >
            Ukloni
          </button>
        </div>
      )}

      {result?.error && <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-800">{result.error}</p>}
      {result?.ok && (
        <div role="status" className="space-y-2 rounded-lg bg-mm-tint p-2 text-sm text-mm-dark">
          <p>{result.ok}</p>
          {result.link && <CopyLink link={result.link} />}
        </div>
      )}
    </div>
  );
}
