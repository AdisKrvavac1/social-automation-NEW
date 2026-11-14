import axios from 'axios';
import { prisma } from './prisma';
import { decryptToken, encryptToken } from './encryption';

const REFRESH_BUFFER_MS = 24 * 60 * 60 * 1000;

export class ReconnectRequiredError extends Error {}

/**
 * Facebook i Instagram koriste page access token dobijen iz dugotrajnog user tokena.
 * Takav token nema rok trajanja (tokenExpiresAt = null) i ne obnavlja se, nego se
 * nalog ponovo poveže ako ga Meta poništi (promjena lozinke, uklonjene dozvole).
 * TikTok koristi refresh token.
 */
export async function getValidAccessToken(socialAccountId: string): Promise<string> {
  const account = await prisma.socialAccount.findUnique({ where: { id: socialAccountId } });
  if (!account) throw new Error(`Nalog (${socialAccountId}) nije pronađen.`);
  if (account.needsReconnect) {
    throw new ReconnectRequiredError(`Nalog "${account.accountName}" treba ponovo povezati.`);
  }

  const expiresAt = account.tokenExpiresAt?.getTime();
  const expiringSoon = expiresAt !== undefined && expiresAt - Date.now() < REFRESH_BUFFER_MS;
  if (!expiringSoon) return decryptToken(account.accessToken);

  if (account.platform === 'TIKTOK') return refreshTikTokToken(account);

  await markNeedsReconnect(account.id);
  throw new ReconnectRequiredError(`Token za "${account.accountName}" ističe. Ponovo poveži nalog.`);
}

export async function markNeedsReconnect(socialAccountId: string) {
  await prisma.socialAccount.update({
    where: { id: socialAccountId },
    data: { needsReconnect: true },
  });
}

async function refreshTikTokToken(account: {
  id: string;
  accountName: string;
  refreshToken: string | null;
}): Promise<string> {
  if (!account.refreshToken) {
    await markNeedsReconnect(account.id);
    throw new ReconnectRequiredError(`TikTok nalog "${account.accountName}" nema refresh token.`);
  }
  try {
    const response = await axios.post(
      'https://open.tiktokapis.com/v2/oauth/token/',
      new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY!,
        client_secret: process.env.TIKTOK_CLIENT_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: decryptToken(account.refreshToken),
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const { access_token, refresh_token, expires_in } = response.data;
    if (!access_token) throw new Error('TikTok nije vratio novi access_token.');
    await prisma.socialAccount.update({
      where: { id: account.id },
      data: {
        accessToken: encryptToken(access_token),
        refreshToken: refresh_token ? encryptToken(refresh_token) : account.refreshToken,
        tokenExpiresAt: new Date(Date.now() + (expires_in || 86400) * 1000),
      },
    });
    return access_token;
  } catch (error: any) {
    await markNeedsReconnect(account.id);
    const apiError = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    throw new ReconnectRequiredError(`Obnova TikTok tokena nije uspjela: ${apiError}`);
  }
}
