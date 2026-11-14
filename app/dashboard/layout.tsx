import Link from 'next/link';
import { signOut } from '@/auth';
import { requirePageUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';

async function logout() {
  'use server';
  await signOut({ redirectTo: '/login' });
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const isOwner = user.role === 'OWNER' || user.role === 'ADMIN';
  const [restaurant, pending] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: user.restaurantId }, select: { name: true } }),
    isOwner
      ? prisma.post.findMany({
          where: { restaurantId: user.restaurantId, status: 'PENDING_APPROVAL' },
          distinct: ['groupId'],
          select: { groupId: true },
        })
      : Promise.resolve([]),
  ]);

  const links = [
    { href: '/dashboard/nova', label: 'Nova objava', show: true },
    { href: '/dashboard/odobrenje', label: `Odobrenje${pending.length ? ` (${pending.length})` : ''}`, show: isOwner },
    { href: '/dashboard/kalendar', label: 'Kalendar', show: true },
    { href: '/dashboard/analitika', label: 'Izvještaj', show: isOwner },
    { href: '/dashboard/nalozi', label: 'Nalozi', show: isOwner },
    { href: '/dashboard/korisnici', label: 'Korisnici', show: isOwner },
  ].filter((l) => l.show);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-mm-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
          <span className="font-display text-xl font-bold text-mm-ink">MM</span>
          <div className="mr-auto leading-tight">
            <p className="text-sm font-bold text-mm-ink">MM Objave</p>
            <p className="text-xs text-mm-muted">{restaurant?.name} · {user.name || user.email}</p>
          </div>
          <form action={logout}>
            <button type="submit" className="btn-ghost min-h-[38px] px-3 py-1.5 text-sm">Odjava</button>
          </form>
        </div>
        <nav aria-label="Glavni meni" className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-3 pb-2">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold text-mm-body hover:bg-mm-tint">
              {l.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
