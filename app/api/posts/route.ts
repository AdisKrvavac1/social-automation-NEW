import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { enqueueAutoApprove, enqueuePublish } from '@/lib/redis';
import { requireApiUser, canApprove } from '@/lib/session';
import { POST_TYPE_IDS, postTypeLabel } from '@/lib/postTypes';
import { sendApprovalRequest } from '@/lib/notifications';

const bodySchema = z.object({
  type: z.enum(POST_TYPE_IDS),
  socialAccountIds: z.array(z.string()).min(1, 'Izaberi bar jednu mrežu.'),
  content: z.string().trim().max(2200, 'Tekst je duži od 2.200 znakova (limit Instagrama).').optional().default(''),
  mediaUrls: z.array(z.string().url()).max(1).optional().default([]),
  scheduledFor: z.string().datetime({ offset: true }),
});

export async function POST(request: Request) {
  const res = await requireApiUser();
  if ('error' in res) return res.error;
  const { user } = res;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Neispravan unos.' }, { status: 400 });
  }
  const { type, socialAccountIds, content, mediaUrls, scheduledFor } = parsed.data;

  const when = new Date(scheduledFor);
  if (when.getTime() < Date.now() + 2 * 60 * 1000) {
    return NextResponse.json({ error: 'Termin objave mora biti bar 2 minute u budućnosti.' }, { status: 400 });
  }

  // Mediji moraju biti s našeg R2 bucketa (upload preko aplikacije)
  const base = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
  if (mediaUrls.some((u) => !base || !u.startsWith(base + '/'))) {
    return NextResponse.json({ error: 'Fotografija mora biti učitana kroz aplikaciju.' }, { status: 400 });
  }

  const [restaurant, accounts] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: user.restaurantId } }),
    prisma.socialAccount.findMany({
      where: { id: { in: socialAccountIds }, restaurantId: user.restaurantId, needsReconnect: false },
    }),
  ]);
  if (!restaurant) return NextResponse.json({ error: 'Restoran nije pronađen.' }, { status: 404 });
  if (accounts.length !== socialAccountIds.length) {
    return NextResponse.json({ error: 'Neki nalozi nisu dostupni ili ih treba ponovo povezati.' }, { status: 400 });
  }
  if (accounts.some((a) => a.platform === 'INSTAGRAM') && mediaUrls.length === 0) {
    return NextResponse.json({ error: 'Instagram traži fotografiju ili video.' }, { status: 400 });
  }
  if (!content && mediaUrls.length === 0) {
    return NextResponse.json({ error: 'Objava mora imati tekst ili fotografiju.' }, { status: 400 });
  }

  const approvedNow = canApprove(user.role);
  const deadline =
    !approvedNow && restaurant.autoPublishMinutes > 0
      ? new Date(Math.max(Date.now() + 60_000, when.getTime() - restaurant.autoPublishMinutes * 60_000))
      : null;
  const groupId = crypto.randomUUID();

  const posts = await prisma.$transaction(
    accounts.map((acc) =>
      prisma.post.create({
        data: {
          groupId,
          restaurantId: restaurant.id,
          socialAccountId: acc.id,
          createdById: user.id,
          type,
          platform: acc.platform,
          content: content || null,
          mediaUrls,
          scheduledFor: when,
          status: approvedNow ? 'SCHEDULED' : 'PENDING_APPROVAL',
          approvalDeadline: deadline,
          approvedById: approvedNow ? user.id : null,
          approvedAt: approvedNow ? new Date() : null,
        },
      })
    )
  );

  if (approvedNow) {
    await Promise.all(posts.map((p) => enqueuePublish(p.id, when)));
  } else {
    if (deadline) await enqueueAutoApprove(groupId, deadline);
    const owners = await prisma.user.findMany({
      where: { restaurantId: restaurant.id, role: 'OWNER' },
      select: { email: true },
    });
    await sendApprovalRequest({
      to: owners.map((o) => o.email),
      restaurantName: restaurant.name,
      authorName: user.name || 'Osoblje',
      typeLabel: postTypeLabel(type),
      scheduledFor: when,
      deadline,
      preview: content || '[samo fotografija]',
      timezone: restaurant.timezone,
    });
  }

  return NextResponse.json(
    {
      groupId,
      status: approvedNow ? 'SCHEDULED' : 'PENDING_APPROVAL',
      message: approvedNow
        ? `Zakazano na ${posts.length} ${posts.length === 1 ? 'mrežu' : 'mreže'}.`
        : 'Poslano vlasnici na odobrenje.',
    },
    { status: 201 }
  );
}
