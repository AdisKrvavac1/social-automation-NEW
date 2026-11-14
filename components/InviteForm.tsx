'use client';

import { useEffect, useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { inviteUser, type ActionState } from '@/app/dashboard/korisnici/actions';
import CopyLink from './CopyLink';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
      {pending ? 'Šaljem…' : 'Pošalji pozivnicu'}
    </button>
  );
}

export default function InviteForm() {
  const [state, action] = useFormState<ActionState, FormData>(inviteUser, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="card space-y-4">
      <h2 className="text-lg font-semibold text-mm-ink">Dodaj korisnika</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="label">Ime</span>
          <input name="name" required minLength={2} maxLength={80} autoComplete="off" className="field" placeholder="npr. Amra" />
        </label>
        <label className="block space-y-1.5">
          <span className="label">Email</span>
          <input name="email" type="email" required autoComplete="off" className="field" placeholder="ime@primjer.ba" />
        </label>
      </div>
      <fieldset className="space-y-1.5">
        <legend className="label">Uloga</legend>
        <div className="flex flex-wrap gap-2">
          <label className="chip cursor-pointer has-[:checked]:border-mm-green has-[:checked]:bg-mm-tint has-[:checked]:text-mm-dark">
            <input type="radio" name="role" value="STAFF" defaultChecked className="sr-only" />
            Osoblje: pravi objave
          </label>
          <label className="chip cursor-pointer has-[:checked]:border-mm-green has-[:checked]:bg-mm-tint has-[:checked]:text-mm-dark">
            <input type="radio" name="role" value="OWNER" className="sr-only" />
            Vlasnik: odobrava i upravlja
          </label>
        </div>
      </fieldset>

      {state?.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{state.error}</p>}
      {state?.ok && (
        <div role="status" className="space-y-2 rounded-lg bg-mm-tint p-3 text-sm text-mm-dark">
          <p>{state.ok}</p>
          {state.link && <CopyLink link={state.link} />}
        </div>
      )}
      <Submit />
    </form>
  );
}
