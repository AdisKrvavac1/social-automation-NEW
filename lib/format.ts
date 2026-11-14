export const fmtTime = (d: Date, tz: string) =>
  d.toLocaleTimeString('bs-BA', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
export const fmtDay = (d: Date, tz: string) =>
  d.toLocaleDateString('bs-BA', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'numeric' });
export const platformLabel = (p: string) => (p === 'INSTAGRAM' ? 'Instagram' : p === 'FACEBOOK' ? 'Facebook' : p === 'TIKTOK' ? 'TikTok' : p);
