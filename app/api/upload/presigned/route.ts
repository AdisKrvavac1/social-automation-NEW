import { NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import { z } from 'zod';
import { r2Client, publicUrlForKey } from '@/lib/r2';
import { requireApiUser } from '@/lib/session';

const TYPES: Record<string, { ext: string; max: number }> = {
  'image/jpeg': { ext: 'jpg', max: 15 * 1024 * 1024 },
  'image/png': { ext: 'png', max: 15 * 1024 * 1024 },
  'image/webp': { ext: 'webp', max: 15 * 1024 * 1024 },
  'video/mp4': { ext: 'mp4', max: 200 * 1024 * 1024 },
  'video/quicktime': { ext: 'mov', max: 200 * 1024 * 1024 },
};

const bodySchema = z.object({ contentType: z.string(), size: z.number().int().positive() });

export async function POST(request: Request) {
  const res = await requireApiUser();
  if ('error' in res) return res.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  const t = parsed.success ? TYPES[parsed.data.contentType] : undefined;
  if (!parsed.success || !t) {
    return NextResponse.json({ error: 'Podržani su JPG, PNG, WebP, MP4 i MOV.' }, { status: 400 });
  }
  if (parsed.data.size > t.max) {
    return NextResponse.json({ error: `Fajl je prevelik (najviše ${t.max / 1024 / 1024} MB).` }, { status: 400 });
  }

  const key = `uploads/${res.user.restaurantId}/${crypto.randomUUID()}.${t.ext}`;
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
    ContentType: parsed.data.contentType,
    ContentLength: parsed.data.size,
  });
  const presignedUrl = await getSignedUrl(r2Client, command, { expiresIn: 300 });
  return NextResponse.json({ presignedUrl, publicUrl: publicUrlForKey(key) });
}
