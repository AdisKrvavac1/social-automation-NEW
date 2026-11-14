import { S3Client, DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';

export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
});

function publicBase() {
  const base = process.env.R2_PUBLIC_URL;
  if (!base) throw new Error('R2_PUBLIC_URL nije postavljen.');
  return base.replace(/\/$/, '');
}

export function publicUrlForKey(key: string) {
  return `${publicBase()}/${key}`;
}

/** Upload iz servera (npr. JPEG konverzija za Instagram). */
export async function uploadBufferToR2(buffer: Buffer, contentType: string, prefix: string, ext: string) {
  const key = `${prefix}/${crypto.randomUUID()}.${ext}`;
  await r2Client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
  return publicUrlForKey(key);
}

export async function deleteFileFromR2(publicUrl: string): Promise<boolean> {
  try {
    const base = publicBase();
    if (!publicUrl.startsWith(base + '/')) return false;
    const objectKey = publicUrl.slice(base.length + 1);
    await r2Client.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: objectKey }));
    return true;
  } catch (error: any) {
    console.error(`[R2] Greška pri brisanju ${publicUrl}:`, error.message);
    return false;
  }
}
