import Link from 'next/link';
import { verifyPasswordToken } from '@/lib/passwordToken';
import SetPasswordForm from './SetPasswordForm';

export const dynamic = 'force-dynamic';

export default async function SetPasswordPage({ params }: { params: { token: string } }) {
  const user = await verifyPasswordToken(params.token);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-5 py-10">
      <div className="space-y-1">
        <p className="font-display text-3xl font-bold text-mm-ink">MM</p>
        <h1 className="text-xl font-bold text-mm-ink">
          {user?.purpose === 'reset' ? 'Nova lozinka' : 'Postavi lozinku'}
        </h1>
        {user && (
          <p className="text-sm text-mm-muted">
            {user.email}
            {user.restaurant?.name ? ` · ${user.restaurant.name}` : ''}
          </p>
        )}
      </div>

      {user ? (
        <SetPasswordForm token={params.token} />
      ) : (
        <div className="card space-y-3 text-sm">
          <p className="font-bold text-mm-ink">Link je istekao ili je već iskorišten.</p>
          <p>Zatraži novi link ili zamoli vlasnika restorana da ti ponovo pošalje pozivnicu.</p>
          <Link href="/lozinka/zaboravljena" className="btn-ghost w-full">Zatraži novi link</Link>
        </div>
      )}
      <p className="text-center text-xs text-mm-muted">Norvel</p>
    </main>
  );
}
