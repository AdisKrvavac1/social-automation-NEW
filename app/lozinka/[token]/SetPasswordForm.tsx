'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { setPassword } from '../actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full">
      {pending ? 'Spremam…' : 'Spremi lozinku'}
    </button>
  );
}

export default function SetPasswordForm({ token }: { token: string }) {
  const [state, action] = useFormState(setPassword, null);
  return (
    <form action={action} className="card space-y-4">
      <input type="hidden" name="token" value={token} />
      <label className="block space-y-1.5">
        <span className="label">Nova lozinka</span>
        <input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} className="field" />
        <span className="block text-xs text-mm-muted">Najmanje 12 znakova. Rečenica od nekoliko riječi je dobar izbor.</span>
      </label>
      <label className="block space-y-1.5">
        <span className="label">Ponovi lozinku</span>
        <input name="confirm" type="password" autoComplete="new-password" required minLength={12} maxLength={128} className="field" />
      </label>
      {state?.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{state.error}</p>}
      <Submit />
    </form>
  );
}
