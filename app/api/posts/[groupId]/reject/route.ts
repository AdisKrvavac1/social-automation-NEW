import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireApiUser } from '@/lib/session';

/** Odbija objavu koja čeka ili otkazuje zakazanu (worker objavljuje samo status SCHEDULED). */
export async function POST(_request: Request, { params }: { params: { groupId: string } }) {
  const res = await requireApiUser(['OWNER', 'ADMIN']);
  if ('error' in res) return res.error;
  const result = await prisma.post.updateMany({
    where: {
      groupId: params.groupId,
      restaurantId: res.user.restaurantId,
      status: { in: ['PENDING_APPROVAL', 'SCHEDULED', 'FAILED'] },
    },
    data: { status: 'REJECTED', approvedById: res.user.id },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: 'Objava je već objavljena ili ne postoji.' }, { status: 409 });
  }
  return NextResponse.json({ ok: true, message: 'Objava je odbijena.' });
}
