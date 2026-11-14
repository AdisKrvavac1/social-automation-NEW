'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePageUser, type AppRole } from '@/lib/session';
import { createPasswordToken, isPendingHash, passwordLink, pendingPasswordHash } from '@/lib/passwordToken';
import { sendInviteEmail } from '@/lib/notifications';
import { rateLimit } from '@/lib/rateLimit';
import { ROLE_LABEL } from './roles';

export type ActionState = { ok?: string; error?: string; link?: string } | null;

/** Koje uloge smije dodijeliti koja uloga. ADMIN (Norvel) se ne dodaje kroz aplikaciju. */
const ASSIGNABLE: Record<AppRole, AppRole[]> = {
  ADMIN: ['OWNER', 'STAFF'],
  OWNER: ['OWNER', 'STAFF'],
  STAFF: [],
};

const inviteSchema = z.object({
  name: z.string().trim().min(2, 'Upiši ime (bar 2 znaka).').max(80),
  email: z.string().trim().toLowerCase().email('Email nije ispravan.'),
  role: z.enum(['OWNER', 'STAFF']),
});

/** Pošalje pozivnicu; ako email nije podešen, vrati link da ga admin proslijedi ručno. */
async function deliverInvite(
  user: { id: string; email: string; name: string | null; passwordHash: string; role: AppRole },
  restaurantName: string,
  invitedBy: string
): Promise<ActionState> {
  const link = passwordLink(createPasswordToken(user, 'invite'));
  const sent = await sendInviteEmail({
    to: user.email,
    name: user.name,
    restaurantName,
    invitedBy,
    roleLabel: ROLE_LABEL[user.role],
    link,
  });
  return sent
    ? { ok: `Pozivnica je poslana na ${user.email}.` }
    : { ok: `Korisnik je dodan, ali email nije poslan. Pošalji mu ovaj link (važi 7 dana):`, link };
}

export async function inviteUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requirePageUser(['OWNER', 'ADMIN']);
  if (!(await rateLimit(`invite:${me.id}`, 30, 60 * 60))) return { error: 'Previše pozivnica u kratkom roku. Pokušaj za sat vremena.' };

  const parsed = inviteSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    role: formData.get('role'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, email, role } = parsed.data;
  if (!ASSIGNABLE[me.role].includes(role)) return { error: 'Nemaš dozvolu da dodijeliš tu ulogu.' };

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return existing.restaurantId === me.restaurantId
      ? { error: 'Korisnik s tim emailom već postoji. Ako nije aktiviran, klikni „Pošalji ponovo“.' }
      : { error: 'Taj email se već koristi u drugom nalogu.' };
  }

  const user = await prisma.user.create({
    data: { name, email, role, restaurantId: me.restaurantId, passwordHash: pendingPasswordHash() },
  });
  const restaurant = await prisma.restaurant.findUnique({ where: { id: me.restaurantId }, select: { name: true } });
  revalidatePath('/dashboard/korisnici');
  return deliverInvite({ ...user, role: user.role as AppRole }, restaurant?.name ?? 'restoran', me.name || me.email || 'Administrator');
}

/** Korisnik iz istog restorana kojim prijavljeni smije upravljati (ne sebe, i vlasnik ne admina). */
async function manageable(userId: string) {
  const me = await requirePageUser(['OWNER', 'ADMIN']);
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.restaurantId !== me.restaurantId) return { me, error: 'Korisnik nije pronađen.' as const };
  if (target.id === me.id) return { me, error: 'Ne možeš mijenjati vlastiti nalog ovdje.' as const };
  if (target.role === 'ADMIN' && me.role !== 'ADMIN') return { me, error: 'Nemaš dozvolu za ovaj nalog.' as const };
  return { me, target };
}

export async function resendInvite(userId: string): Promise<ActionState> {
  const r = await manageable(userId);
  if ('error' in r) return { error: r.error };
  const { me, target } = r;
  if (!(await rateLimit(`invite:${me.id}`, 30, 60 * 60))) return { error: 'Previše pozivnica u kratkom roku.' };
  if (!isPendingHash(target.passwordHash)) return { error: 'Korisnik je već aktivirao nalog.' };
  const restaurant = await prisma.restaurant.findUnique({ where: { id: me.restaurantId }, select: { name: true } });
  return deliverInvite({ ...target, role: target.role as AppRole }, restaurant?.name ?? 'restoran', me.name || me.email || 'Administrator');
}

export async function changeRole(userId: string, role: AppRole): Promise<ActionState> {
  const r = await manageable(userId);
  if ('error' in r) return { error: r.error };
  if (!ASSIGNABLE[r.me.role].includes(role)) return { error: 'Nemaš dozvolu da dodijeliš tu ulogu.' };
  await prisma.user.update({ where: { id: userId }, data: { role } });
  revalidatePath('/dashboard/korisnici');
  return { ok: `Uloga je promijenjena u „${ROLE_LABEL[role]}“.` };
}

export async function removeUser(userId: string): Promise<ActionState> {
  const r = await manageable(userId);
  if ('error' in r) return { error: r.error };
  // Objave ostaju; autor/odobrio se postavlja na prazno (onDelete: SetNull).
  await prisma.user.delete({ where: { id: userId } });
  revalidatePath('/dashboard/korisnici');
  return { ok: 'Korisnik je uklonjen.' };
}
