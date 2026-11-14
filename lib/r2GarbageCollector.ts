import { ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { prisma } from './prisma';
import { r2Client } from './r2';

export async function cleanOrphanedR2Files() {
  const bucketName = process.env.R2_BUCKET_NAME!;
  const publicBaseUrl = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

  if (!bucketName || !publicBaseUrl) {
    throw new Error('Nedostaju R2_BUCKET_NAME ili R2_PUBLIC_URL varijable okruženja.');
  }

  const activePosts = await prisma.post.findMany({
    where: { mediaUrls: { isEmpty: false } },
    select: { mediaUrls: true },
  });

  const activeUrlsSet = new Set<string>();
  for (const post of activePosts) {
    for (const url of post.mediaUrls) {
      activeUrlsSet.add(url);
    }
  }

  const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
  let continuationToken: string | undefined = undefined;
  let totalScanned = 0;
  let totalDeleted = 0;

  for (const prefix of ['uploads/', 'converted/']) {
  continuationToken = undefined;
  do {
    const listResponse: any = await r2Client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );

    const objects = listResponse.Contents || [];
    totalScanned += objects.length;

    const keysToDelete: { Key: string }[] = [];

    for (const obj of objects) {
      if (!obj.Key || !obj.LastModified) continue;
      if (obj.LastModified.getTime() >= twentyFourHoursAgo) continue;

      const fullPublicUrl = `${publicBaseUrl}/${obj.Key}`;
      if (!activeUrlsSet.has(fullPublicUrl)) {
        keysToDelete.push({ Key: obj.Key });
      }
    }

    if (keysToDelete.length > 0) {
      await r2Client.send(
        new DeleteObjectsCommand({
          Bucket: bucketName,
          Delete: { Objects: keysToDelete, Quiet: true },
        })
      );
      totalDeleted += keysToDelete.length;
    }

    continuationToken = listResponse.NextContinuationToken;
  } while (continuationToken);
  }

  console.log(`[R2 GC] Završeno. Pregledano: ${totalScanned}, Obrisano: ${totalDeleted}`);
  return { totalScanned, totalDeleted };
}
