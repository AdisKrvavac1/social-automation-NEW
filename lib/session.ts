import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export type AppRole = 'ADMIN' | 'OWNER' | 'STAFF';
export type AppUser = { id: string; role: AppRole; restaurantId: string | null; name?: string | null; email?: string | null };

/** Za stranice: vraća prijavljenog korisnika ili preusmjerava na login. */
export async function requirePageUser(roles?: AppRole[]): Promise<AppUser & { restaurantId: string }> {
  const session = await auth();
  const user = session?.user as AppUser | undefined;
  if (!user?.id) redirect('/login');
  if (roles && !roles.includes(user.role)) redirect('/dashboard');
  if (!user.restaurantId) redirect('/login?error=restoran');
  return user as AppUser & { restaurantId: string };
}

/** Za API rute: vraća korisnika ili gotov HTTP odgovor s greškom. */
export async function requireApiUser(
  roles?: AppRole[]
): Promise<{ user: AppUser & { restaurantId: string } } | { error: NextResponse }> {
  const session = await auth();
  const user = session?.user as AppUser | undefined;
  if (!user?.id) return { error: NextResponse.json({ error: 'Niste prijavljeni.' }, { status: 401 }) };
  if (roles && !roles.includes(user.role)) {
    return { error: NextResponse.json({ error: 'Nemate dozvolu za ovu radnju.' }, { status: 403 }) };
  }
  if (!user.restaurantId) {
    return { error: NextResponse.json({ error: 'Korisnik nije povezan s restoranom.' }, { status: 400 }) };
  }
  return { user: user as AppUser & { restaurantId: string } };
}

export const canApprove = (role: AppRole) => role === 'OWNER' || role === 'ADMIN';
