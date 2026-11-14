import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import {
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { r2Client } from './r2';

const execAsync = promisify(exec);

export async function backupDatabaseToR2() {
  const databaseUrl = process.env.DATABASE_URL;
  const bucketName = process.env.R2_BUCKET_NAME;

  if (!databaseUrl || !bucketName) {
    throw new Error('Nedostaju DATABASE_URL ili R2_BUCKET_NAME varijable okruženja.');
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `db-backup-${timestamp}.dump`;
  const tempFilePath = path.join('/tmp', fileName);
  const r2Key = `backups/db/${fileName}`;

  try {
    await execAsync(`pg_dump "${databaseUrl}" -Fc -f "${tempFilePath}"`);

    const fileStream = fs.createReadStream(tempFilePath);
    const fileStats = fs.statSync(tempFilePath);

    await r2Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: r2Key,
        Body: fileStream,
        ContentType: 'application/octet-stream',
        ContentLength: fileStats.size,
      })
    );

    await pruneOldBackups(bucketName, 30);
    return { success: true, key: r2Key, sizeBytes: fileStats.size };
  } finally {
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
}

async function pruneOldBackups(bucketName: string, retentionDays: number) {
  const cutoffDate = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  const listResponse = await r2Client.send(
    new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: 'backups/db/',
    })
  );

  const objects = listResponse.Contents || [];
  const oldKeys = objects
    .filter((obj) => obj.Key && obj.LastModified && obj.LastModified.getTime() < cutoffDate)
    .map((obj) => ({ Key: obj.Key! }));

  if (oldKeys.length > 0) {
    await r2Client.send(
      new DeleteObjectsCommand({
        Bucket: bucketName,
        Delete: { Objects: oldKeys, Quiet: true },
      })
    );
  }
}
