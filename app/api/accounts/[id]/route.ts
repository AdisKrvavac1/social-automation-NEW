import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireApiUser } from '@/lib/session';

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const res = await requireApiUser(['OWNER', 'ADMIN']);
  if ('error' in res) return res.error;
  const account = await prisma.socialAccount.findFirst({
    where: { id: params.id, restaurantId: res.user.restaurantId },
  });
  if (!account) return NextResponse.json({ error: 'Nalog nije pronađen.' }, { status: 404 });
  await prisma.socialAccount.delete({ where: { id: account.id } });
  return NextResponse.json({ ok: true });
}
