import axios from 'axios';
import { prisma } from './prisma';
import { getValidAccessToken } from './tokenRefresher';
import { GRAPH } from './meta';

export interface PostMetrics {
  likes: number;
  comments: number;
  shares: number;
  views: number;
}

export async function getFacebookPostMetrics(
  platformPostId: string,
  accessToken: string
): Promise<PostMetrics> {
  const response = await axios.get(`${GRAPH}/${platformPostId}`, {
    params: {
      fields: 'likes.summary(true),comments.summary(true),shares',
      access_token: accessToken,
    },
  });

  const data = response.data;
  return {
    likes: data.likes?.summary?.total_count || 0,
    comments: data.comments?.summary?.total_count || 0,
    shares: data.shares?.count || 0,
    views: 0,
  };
}

export async function getInstagramPostMetrics(
  platformPostId: string,
  accessToken: string
): Promise<PostMetrics> {
  const basicRes = await axios.get(`${GRAPH}/${platformPostId}`, {
    params: {
      fields: 'like_count,comments_count',
      access_token: accessToken,
    },
  });

  const insightsRes = await axios.get(`${GRAPH}/${platformPostId}/insights`, {
    params: {
      metric: 'reach,shares',
      access_token: accessToken,
    },
  });

  const insightsData = insightsRes.data?.data || [];
  const reachMetric = insightsData.find((m: any) => m.name === 'reach');
  const sharesMetric = insightsData.find((m: any) => m.name === 'shares');

  return {
    likes: basicRes.data.like_count || 0,
    comments: basicRes.data.comments_count || 0,
    shares: sharesMetric?.values?.[0]?.value || 0,
    views: reachMetric?.values?.[0]?.value || 0,
  };
}

export async function getTikTokPostMetrics(
  videoId: string,
  accessToken: string
): Promise<PostMetrics> {
  const response = await axios.post(
    'https://open.tiktokapis.com/v2/video/query/',
    { filters: { video_ids: [videoId] } },
    {
      params: { fields: 'id,like_count,comment_count,share_count,view_count' },
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const videoData = response.data?.data?.videos?.[0];
  if (!videoData) {
    throw new Error(`TikTok video ${videoId} nije pronađen.`);
  }

  return {
    likes: videoData.like_count || 0,
    comments: videoData.comment_count || 0,
    shares: videoData.share_count || 0,
    views: videoData.view_count || 0,
  };
}

export async function syncAllPublishedPostsMetrics() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const posts = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      platformPostId: { not: null },
      publishedAt: { gte: thirtyDaysAgo },
    },
    take: 50,
  });

  for (const post of posts) {
    try {
      if (!post.platformPostId) continue;

      const token = await getValidAccessToken(post.socialAccountId);
      let metrics = { likes: 0, comments: 0, shares: 0, views: 0 };

      if (post.platform === 'FACEBOOK') {
        metrics = await getFacebookPostMetrics(post.platformPostId, token);
      } else if (post.platform === 'INSTAGRAM') {
        metrics = await getInstagramPostMetrics(post.platformPostId, token);
      } else if (post.platform === 'TIKTOK') {
        metrics = await getTikTokPostMetrics(post.platformPostId, token);
      }

      await prisma.post.update({
        where: { id: post.id },
        data: {
          likesCount: metrics.likes,
          commentsCount: metrics.comments,
          sharesCount: metrics.shares,
          viewsCount: metrics.views,
          metricsUpdatedAt: new Date(),
        },
      });
    } catch (err) {
      console.error(`[Analitika] Greška za objavu ${post.id}:`, (err as any)?.response?.data?.error?.message || (err as any)?.message);
    }
  }
}
