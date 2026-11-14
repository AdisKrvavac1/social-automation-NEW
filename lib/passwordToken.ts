import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { prisma } from './prisma';

/**
 * Linkovi za postavljanje lozinke (pozivnica i zaboravljena lozinka) bez dodatne tabele.
 *
 * Token = base64url(userId.exp.svrha).potpis, gdje je potpis HMAC(AUTH_SECRET, payload | trenutni passwordHash).
 * Čim korisnik postavi lozinku, hash se mijenja i isti link više ne važi (jednokratan je).
 */

export type TokenPurpose = 'invite' | 'reset';

const TTL: Record<TokenPurpose, number> = {
  invite: 7 * 24 * 60 * 60 * 1000, // 7 dana
  reset: 60 * 60 * 1000, // 1 sat
};

/** Oznaka za nalog kojem lozinka još nije postavljena (prijava s njim nije moguća). */
export const PENDING_PREFIX = '!pozvan:';
export const pendingPasswordHash = () => PENDING_PREFIX + randomBytes(24).toString('hex');
export const isPendingHash = (hash: string) => hash.startsWith(PENDING_PREFIX);

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET nije postavljen.');
  return s;
}

const sign = (payload: string, passwordHash: string) =>
  createHmac('sha256', secret()).update(`${payload}|${passwordHash}`).digest('base64url');

export function createPasswordToken(user: { id: string; passwordHash: string }, purpose: TokenPurpose) {
  const payload = Buffer.from(`${user.id}.${Date.now() + TTL[purpose]}.${purpose}`).toString('base64url');
  return `${payload}.${sign(payload, user.passwordHash)}`;
}

export const passwordLink = (token: string) =>
  `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/lozinka/${token}`;

/** Vraća korisnika ako je token ispravan, nije istekao i nije već iskorišten. */
export async function verifyPasswordToken(token: string) {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const [userId, expRaw, purpose] = Buffer.from(payload, 'base64url').toString().split('.');
  const exp = Number(expRaw);
  if (!userId || !Number.isFinite(exp) || exp < Date.now()) return null;
  if (purpose !== 'invite' && purpose !== 'reset') return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, passwordHash: true, restaurant: { select: { name: true } } },
  });
  if (!user) return null;

  const expected = Buffer.from(sign(payload, user.passwordHash));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return { ...user, purpose: purpose as TokenPurpose };
}
