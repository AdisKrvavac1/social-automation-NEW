import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export type AppRole = 'ADMIN' | 'OWNER' | 'STAFF';
export type AppUser = { id: string; role: AppRole; restaurantId: string | null; name?: string | null; email?: string | null };

/**
 * Uloga i restoran se čitaju iz baze, ne iz JWT-a: promjena uloge ili brisanje korisnika
 * djeluje odmah, a ne tek kad sesija istekne.
 */
async function currentUser(): Promise<AppUser | null> {
  const session = await auth();
  const id = (session?.user as AppUser | undefined)?.id;
  if (!id) return null;
  const db = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, restaurantId: true, name: true, email: true },
  });
  return db ? { ...db, role: db.role as AppRole } : null;
}

/** Za stranice: vraća prijavljenog korisnika ili preusmjerava na login. */
export async function requirePageUser(roles?: AppRole[]): Promise<AppUser & { restaurantId: string }> {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (roles && !roles.includes(user.role)) redirect('/dashboard');
  if (!user.restaurantId) redirect('/login?error=restoran');
  return user as AppUser & { restaurantId: string };
}

/** Za API rute: vraća korisnika ili gotov HTTP odgovor s greškom. */
export async function requireApiUser(
  roles?: AppRole[]
): Promise<{ user: AppUser & { restaurantId: string } } | { error: NextResponse }> {
  const user = await currentUser();
  if (!user) return { error: NextResponse.json({ error: 'Niste prijavljeni.' }, { status: 401 }) };
  if (roles && !roles.includes(user.role)) {
    return { error: NextResponse.json({ error: 'Nemate dozvolu za ovu radnju.' }, { status: 403 }) };
  }
  if (!user.restaurantId) {
    return { error: NextResponse.json({ error: 'Korisnik nije povezan s restoranom.' }, { status: 400 }) };
  }
  return { user: user as AppUser & { restaurantId: string } };
}

export const canApprove = (role: AppRole) => role === 'OWNER' || role === 'ADMIN';
