import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/lib/session';
import { approveGroup } from '@/lib/approval';

const bodySchema = z.object({ content: z.string().trim().max(2200).optional() });

export async function POST(request: Request, { params }: { params: { groupId: string } }) {
  const res = await requireApiUser(['OWNER', 'ADMIN']);
  if ('error' in res) return res.error;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Tekst je predug.' }, { status: 400 });

  const count = await approveGroup({
    groupId: params.groupId,
    restaurantId: res.user.restaurantId,
    approvedById: res.user.id,
    auto: false,
    content: parsed.data.content,
  });
  if (count === 0) {
    return NextResponse.json({ error: 'Objava je već obrađena ili ne postoji.' }, { status: 409 });
  }
  return NextResponse.json({ ok: true, message: 'Odobreno i zakazano.' });
}
