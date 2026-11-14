import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireApiUser } from '@/lib/session';
import { GRAPH_VERSION, META_SCOPES, metaRedirectUri } from '@/lib/meta';

export async function GET() {
  const res = await requireApiUser(['OWNER', 'ADMIN']);
  if ('error' in res) return res.error;
  if (!process.env.META_APP_ID) {
    return NextResponse.json({ error: 'META_APP_ID nije postavljen.' }, { status: 503 });
  }
  const state = crypto.randomBytes(24).toString('hex');
  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set('client_id', process.env.META_APP_ID);
  url.searchParams.set('redirect_uri', metaRedirectUri());
  url.searchParams.set('state', state);
  // Aplikacije s "Facebook Login for Business" traže config_id (dozvole su u konfiguraciji);
  // bez njega se koristi klasični scope.
  if (process.env.META_LOGIN_CONFIG_ID) {
    url.searchParams.set('config_id', process.env.META_LOGIN_CONFIG_ID);
  } else {
    url.searchParams.set('scope', META_SCOPES.join(','));
  }
  url.searchParams.set('response_type', 'code');

  const response = NextResponse.redirect(url.toString());
  response.cookies.set('meta_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
  return response;
}
