import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireApiUser } from '@/lib/session';
import { decryptToken, encryptToken } from '@/lib/encryption';
import { listManagedPages } from '@/lib/metaPages';

export async function POST(request: Request) {
  const res = await requireApiUser(['OWNER', 'ADMIN']);
  if ('error' in res) return res.error;
  const app = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

  const form = await request.formData();
  const pageId = String(form.get('pageId') || '');
  const cookie = cookies().get('meta_user_token')?.value;
  if (!cookie || !pageId) {
    return NextResponse.redirect(`${app}/dashboard/nalozi?greska=${encodeURIComponent('Sesija povezivanja je istekla. Pokušaj ponovo.')}`, 303);
  }

  const pages = await listManagedPages(decryptToken(cookie));
  const page = pages.find((p) => p.id === pageId);
  if (!page) {
    return NextResponse.redirect(`${app}/dashboard/nalozi?greska=${encodeURIComponent('Stranica nije pronađena.')}`, 303);
  }

  const restaurantId = res.user.restaurantId;
  const token = encryptToken(page.access_token);
  const upsert = (platform: 'FACEBOOK' | 'INSTAGRAM', platformUserId: string, accountName: string) =>
    prisma.socialAccount.upsert({
      where: { restaurantId_platform_platformUserId: { restaurantId, platform, platformUserId } },
      create: { restaurantId, platform, platformUserId, accountName, accessToken: token, tokenExpiresAt: null },
      update: { accountName, accessToken: token, tokenExpiresAt: null, needsReconnect: false },
    });

  await upsert('FACEBOOK', page.id, page.name);
  if (page.instagram_business_account?.id) {
    await upsert(
      'INSTAGRAM',
      page.instagram_business_account.id,
      page.instagram_business_account.username ? `@${page.instagram_business_account.username}` : `${page.name} (Instagram)`
    );
  }

  const response = NextResponse.redirect(`${app}/dashboard/nalozi?ok=1`, 303);
  response.cookies.delete('meta_user_token');
  return response;
}
