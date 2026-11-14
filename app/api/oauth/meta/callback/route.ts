import { NextResponse } from 'next/server';
import axios from 'axios';
import { cookies } from 'next/headers';
import { requireApiUser } from '@/lib/session';
import { GRAPH, metaRedirectUri } from '@/lib/meta';
import { encryptToken } from '@/lib/encryption';

/**
 * Meta vraća code → razmjena za kratkotrajni pa dugotrajni user token.
 * Dugotrajni token se šifrovan čuva 10 minuta u kolačiću, dok korisnik ne izabere stranicu.
 */
export async function GET(request: Request) {
  const res = await requireApiUser(['OWNER', 'ADMIN']);
  if ('error' in res) return res.error;

  const url = new URL(request.url);
  const app = process.env.NEXT_PUBLIC_APP_URL || url.origin;
  const fail = (msg: string) => NextResponse.redirect(`${app}/dashboard/nalozi?greska=${encodeURIComponent(msg)}`);

  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  const saved = cookies().get('meta_oauth_state')?.value;
  if (url.searchParams.get('error')) return fail('Povezivanje je otkazano.');
  if (!code || !state || !saved || state !== saved) return fail('Neispravan zahtjev za povezivanje. Pokušaj ponovo.');

  try {
    const short = await axios.get(`${GRAPH}/oauth/access_token`, {
      params: {
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        redirect_uri: metaRedirectUri(),
        code,
      },
    });
    const long = await axios.get(`${GRAPH}/oauth/access_token`, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        fb_exchange_token: short.data.access_token,
      },
    });
    const response = NextResponse.redirect(`${app}/dashboard/nalozi/izbor`);
    response.cookies.delete('meta_oauth_state');
    response.cookies.set('meta_user_token', encryptToken(long.data.access_token), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600,
      path: '/',
    });
    return response;
  } catch (e: any) {
    console.error('[Meta OAuth]', e.response?.data || e.message);
    return fail('Meta nije potvrdila povezivanje. Provjeri postavke aplikacije.');
  }
}
