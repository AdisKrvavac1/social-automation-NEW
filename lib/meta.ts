// Verziju Graph API-ja drži u env-u, da se nadogradnja ne radi kroz kod.
// Provjeri aktuelnu verziju na developers.facebook.com/docs/graph-api/changelog
export const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v23.0';
export const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
export const GRAPH_VIDEO = `https://graph-video.facebook.com/${GRAPH_VERSION}`;

// Facebook Login za biznis: stranica + povezani Instagram profesionalni nalog
export const META_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_insights',
  'business_management',
];

export function metaRedirectUri() {
  return `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/meta/callback`;
}

/** Meta greške 190 (istekao/nevažeći token) i 10/200 (dozvole) traže ponovno povezivanje naloga. */
export function isMetaAuthError(err: any): boolean {
  const code = err?.response?.data?.error?.code;
  return code === 190 || code === 10 || code === 200;
}
