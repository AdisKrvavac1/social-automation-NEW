'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rateLimit';
import { createPasswordToken, isPendingHash, passwordLink, verifyPasswordToken } from '@/lib/passwordToken';
import { sendPasswordResetEmail } from '@/lib/notifications';

const ip = () => headers().get('x-forwarded-for')?.split(',')[0]?.trim() || 'nepoznato';

const COMMON = ['123456789012', 'lozinka12345', 'password1234', 'qwertyuiop12'];

const passwordSchema = z
  .object({
    token: z.string().min(10),
    password: z.string().min(12, 'Lozinka mora imati najmanje 12 znakova.').max(128),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: 'Lozinke se ne podudaraju.' })
  .refine((d) => !COMMON.includes(d.password.toLowerCase()) && new Set(d.password).size >= 5, {
    message: 'Lozinka je prelagana za pogoditi. Izaberi drugu.',
  });

export async function setPassword(_prev: { error?: string } | null, formData: FormData): Promise<{ error?: string } | null> {
  if (!(await rateLimit(`setpw:${ip()}`, 20, 15 * 60))) return { error: 'Previše pokušaja. Pokušaj ponovo za 15 minuta.' };

  const parsed = passwordSchema.safeParse({
    token: formData.get('token'),
    password: formData.get('password'),
    confirm: formData.get('confirm'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const user = await verifyPasswordToken(parsed.data.token);
  if (!user) return { error: 'Link je istekao ili je već iskorišten. Zatraži novi.' };

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  // Uslov na stari hash: ako su dva zahtjeva stigla istovremeno, prolazi samo prvi.
  const { count } = await prisma.user.updateMany({
    where: { id: user.id, passwordHash: user.passwordHash },
    data: { passwordHash },
  });
  if (count === 0) return { error: 'Link je već iskorišten.' };

  redirect('/login?lozinka=1');
}

export async function requestReset(_prev: { done?: boolean } | null, formData: FormData): Promise<{ done?: boolean }> {
  const email = z.string().trim().toLowerCase().email().safeParse(formData.get('email'));
  // Isti odgovor bez obzira postoji li nalog, da se ne može provjeravati ko je registrovan.
  if (!email.success) return { done: true };
  if (!(await rateLimit(`reset:${ip()}`, 5, 15 * 60))) return { done: true };
  if (!(await rateLimit(`reset:${email.data}`, 3, 60 * 60))) return { done: true };

  const user = await prisma.user.findUnique({ where: { email: email.data } });
  if (user && !isPendingHash(user.passwordHash)) {
    await sendPasswordResetEmail({ to: user.email, link: passwordLink(createPasswordToken(user, 'reset')) });
  }
  return { done: true };
}
