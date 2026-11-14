import { redirect } from 'next/navigation';
import { AuthError } from 'next-auth';
import { auth, signIn } from '@/auth';
import { rateLimit } from '@/lib/rateLimit';
import { headers } from 'next/headers';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';

async function login(formData: FormData) {
  'use server';
  const ip = headers().get('x-forwarded-for')?.split(',')[0]?.trim() || 'nepoznato';
  if (!(await rateLimit(`login:${ip}`, 10, 15 * 60))) redirect('/login?error=limit');
  try {
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirectTo: '/dashboard',
    });
  } catch (e) {
    if (e instanceof AuthError) redirect('/login?error=1');
    throw e; // redirect nakon uspješne prijave
  }
}

const ERRORS: Record<string, string> = {
  '1': 'Pogrešan email ili lozinka.',
  limit: 'Previše pokušaja. Pokušaj ponovo za 15 minuta.',
  restoran: 'Tvoj nalog nije povezan s restoranom. Javi se administratoru.',
};

export default async function LoginPage({ searchParams }: { searchParams: { error?: string; lozinka?: string } }) {
  const session = await auth();
  // Preusmjeri samo ako nalog još postoji (inače bi obrisan korisnik s važećom sesijom kružio između stranica).
  if (session?.user?.id && searchParams.error !== 'restoran') {
    const exists = await prisma.user.findUnique({ where: { id: session.user.id }, select: { restaurantId: true } });
    if (exists?.restaurantId) redirect('/dashboard');
  }
  const error = searchParams.error ? ERRORS[searchParams.error] ?? ERRORS['1'] : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-5 py-10">
      <div className="space-y-1">
        <p className="font-display text-3xl font-bold text-mm-ink">MM</p>
        <h1 className="text-xl font-bold text-mm-ink">MM Objave</h1>
        <p className="text-sm text-mm-muted">Prijava za osoblje i vlasnike</p>
      </div>
      <form action={login} className="card space-y-4">
        <label className="block space-y-1.5">
          <span className="label">Email</span>
          <input name="email" type="email" autoComplete="email" required className="field" />
        </label>
        <label className="block space-y-1.5">
          <span className="label">Lozinka</span>
          <input name="password" type="password" autoComplete="current-password" required minLength={8} className="field" />
        </label>
        {searchParams.lozinka && !error && (
          <p role="status" className="rounded-lg bg-mm-tint p-3 text-sm text-mm-dark">Lozinka je postavljena. Sada se prijavi.</p>
        )}
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <button type="submit" className="btn-primary w-full">Prijavi se</button>
        <Link href="/lozinka/zaboravljena" className="block text-center text-sm font-semibold text-mm-dark underline">
          Zaboravljena lozinka?
        </Link>
      </form>
      <p className="text-center text-xs text-mm-muted">Norvel</p>
    </main>
  );
}
