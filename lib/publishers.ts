import axios from 'axios';
import sharp from 'sharp';
import type { Post, SocialAccount } from '@prisma/client';
import { getValidAccessToken, markNeedsReconnect, ReconnectRequiredError } from './tokenRefresher';
import { GRAPH, GRAPH_VIDEO, isMetaAuthError } from './meta';
import { uploadBufferToR2 } from './r2';

export type PostWithAccount = Post & { socialAccount: SocialAccount };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function extOf(url: string) {
  return url.toLowerCase().split('?')[0].split('.').pop() || '';
}
function isVideoUrl(url: string) {
  return ['mp4', 'mov', 'webm'].includes(extOf(url));
}

export async function publishToPlatform(post: PostWithAccount): Promise<string> {
  const accessToken = await getValidAccessToken(post.socialAccountId);
  const platformUserId = post.socialAccount.platformUserId;
  try {
    switch (post.platform) {
      case 'FACEBOOK':
        return await publishToFacebook(post, platformUserId, accessToken);
      case 'INSTAGRAM':
        return await publishToInstagram(post, platformUserId, accessToken);
      case 'TIKTOK':
        if (process.env.ENABLE_TIKTOK !== 'true') throw new Error('TikTok objave nisu uključene (ENABLE_TIKTOK).');
        return await publishToTikTok(post, accessToken);
      default:
        throw new Error(`Nepodržana platforma: ${post.platform}`);
    }
  } catch (err: any) {
    if (isMetaAuthError(err)) {
      await markNeedsReconnect(post.socialAccountId);
      throw new ReconnectRequiredError(
        `Meta je odbila token za "${post.socialAccount.accountName}". Ponovo poveži nalog.`
      );
    }
    throw err;
  }
}

async function publishToFacebook(post: PostWithAccount, pageId: string, token: string): Promise<string> {
  const mediaUrl = post.mediaUrls?.[0];
  const caption = post.content || '';

  if (mediaUrl && isVideoUrl(mediaUrl)) {
    const res = await axios.post(`${GRAPH_VIDEO}/${pageId}/videos`, {
      file_url: mediaUrl,
      description: caption,
      access_token: token,
    });
    return res.data.id;
  }
  if (mediaUrl) {
    const res = await axios.post(`${GRAPH}/${pageId}/photos`, { url: mediaUrl, caption, access_token: token });
    return res.data.post_id || res.data.id;
  }
  if (!caption.trim()) throw new Error('Facebook objava mora imati tekst ili fotografiju.');
  const res = await axios.post(`${GRAPH}/${pageId}/feed`, { message: caption, access_token: token });
  return res.data.id;
}

/** Instagram Content Publishing API prima samo JPEG slike, pa se PNG/WebP konvertuju. */
async function ensureJpeg(url: string): Promise<string> {
  if (['jpg', 'jpeg'].includes(extOf(url))) return url;
  const res = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer', maxContentLength: 20 * 1024 * 1024 });
  const jpeg = await sharp(Buffer.from(res.data)).rotate().jpeg({ quality: 90 }).toBuffer();
  return uploadBufferToR2(jpeg, 'image/jpeg', 'converted', 'jpg');
}

async function publishToInstagram(post: PostWithAccount, igUserId: string, token: string): Promise<string> {
  const mediaUrl = post.mediaUrls?.[0];
  if (!mediaUrl) throw new Error('Instagram objava zahtijeva sliku ili video.');

  const caption = (post.content || '').slice(0, 2200);
  const payload: Record<string, unknown> = { caption, access_token: token };
  if (isVideoUrl(mediaUrl)) {
    payload.media_type = 'REELS';
    payload.video_url = mediaUrl;
    payload.share_to_feed = true;
  } else {
    payload.image_url = await ensureJpeg(mediaUrl);
  }

  // Kontejner se pravi tik prije objave jer ističe za 24 sata
  const containerRes = await axios.post(`${GRAPH}/${igUserId}/media`, payload);
  const creationId = containerRes.data.id;
  if (!creationId) throw new Error('Instagram nije vratio ID kontejnera.');

  await waitForInstagramContainer(creationId, token);

  const publishRes = await axios.post(`${GRAPH}/${igUserId}/media_publish`, {
    creation_id: creationId,
    access_token: token,
  });
  return publishRes.data.id;
}

async function waitForInstagramContainer(creationId: string, token: string, maxAttempts = 24) {
  for (let i = 0; i < maxAttempts; i++) {
    const statusRes = await axios.get(`${GRAPH}/${creationId}`, {
      params: { fields: 'status_code,status', access_token: token },
    });
    const code = statusRes.data.status_code;
    if (code === 'FINISHED') return;
    if (code === 'ERROR' || code === 'EXPIRED') {
      throw new Error(`Instagram obrada nije uspjela (${code}): ${statusRes.data.status || 'nepoznato'}`);
    }
    await sleep(5000);
  }
  throw new Error('Isteklo vrijeme čekanja na Instagram obradu medija.');
}

// TikTok: potrebna je odobrena aplikacija (audit) i verifikovana domena za PULL_FROM_URL.
async function publishToTikTok(post: PostWithAccount, token: string): Promise<string> {
  const mediaUrl = post.mediaUrls?.[0];
  if (!mediaUrl || !isVideoUrl(mediaUrl)) throw new Error('TikTok objava zahtijeva video (.mp4 ili .mov).');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' };
  const initRes = await axios.post(
    'https://open.tiktokapis.com/v2/post/publish/video/init/',
    {
      post_info: { title: (post.content || '').slice(0, 2200), privacy_level: 'PUBLIC_TO_EVERYONE' },
      source_info: { source: 'PULL_FROM_URL', video_url: mediaUrl },
    },
    { headers }
  );
  const publishId = initRes.data?.data?.publish_id;
  if (!publishId) throw new Error(`TikTok init nije vratio publish_id: ${JSON.stringify(initRes.data)}`);

  for (let i = 0; i < 24; i++) {
    const s = await axios.post(
      'https://open.tiktokapis.com/v2/post/publish/status/fetch/',
      { publish_id: publishId },
      { headers }
    );
    const data = s.data?.data;
    if (data?.status === 'PUBLISH_COMPLETE') return String(data?.publicaly_available_post_id?.[0] || publishId);
    if (data?.status === 'FAILED') throw new Error(`TikTok objava nije uspjela: ${data?.fail_reason || 'nepoznato'}`);
    await sleep(5000);
  }
  return publishId;
}
