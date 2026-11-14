'use client';

import Link from 'next/link';
import { useFormState, useFormStatus } from 'react-dom';
import { requestReset } from '../actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full">
      {pending ? 'Šaljem…' : 'Pošalji link'}
    </button>
  );
}

export default function ForgotPasswordPage() {
  const [state, action] = useFormState(requestReset, null);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-5 py-10">
      <div className="space-y-1">
        <p className="font-display text-3xl font-bold text-mm-ink">MM</p>
        <h1 className="text-xl font-bold text-mm-ink">Zaboravljena lozinka</h1>
        <p className="text-sm text-mm-muted">Poslaćemo ti link za novu lozinku.</p>
      </div>

      {state?.done ? (
        <div role="status" className="card space-y-3 text-sm">
          <p>Ako nalog s tim emailom postoji, link je poslan. Važi 1 sat. Provjeri i spam folder.</p>
          <Link href="/login" className="btn-ghost w-full">Nazad na prijavu</Link>
        </div>
      ) : (
        <form action={action} className="card space-y-4">
          <label className="block space-y-1.5">
            <span className="label">Email</span>
            <input name="email" type="email" autoComplete="email" required className="field" />
          </label>
          <Submit />
          <Link href="/login" className="block text-center text-sm font-semibold text-mm-dark underline">Nazad na prijavu</Link>
        </form>
      )}
      <p className="text-center text-xs text-mm-muted">Norvel</p>
    </main>
  );
}
