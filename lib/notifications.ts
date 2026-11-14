import { Resend } from 'resend';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function client() {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[Email] RESEND_API_KEY nije postavljen, email se ne šalje.');
    return null;
  }
  return new Resend(process.env.RESEND_API_KEY);
}

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const from = () => process.env.EMAIL_FROM || 'MM Objave <onboarding@resend.dev>';

function layout(title: string, body: string, cta?: { href: string; label: string }) {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;border:1px solid #E3DDC6;border-radius:12px;color:#161B14">
  <h2 style="margin:0 0 12px;font-size:18px">${esc(title)}</h2>${body}
  ${cta ? `<a href="${cta.href}" style="display:inline-block;margin-top:16px;padding:10px 18px;background:#3E7324;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">${esc(cta.label)}</a>` : ''}
  <p style="margin-top:20px;font-size:12px;color:#5C6658">MM Objave · Norvel</p></div>`;
}

export async function sendApprovalRequest(params: {
  to: string[];
  restaurantName: string;
  authorName: string;
  typeLabel: string;
  scheduledFor: Date;
  deadline: Date | null;
  preview: string;
  timezone: string;
}) {
  const resend = client();
  if (!resend || params.to.length === 0) return;
  const when = params.scheduledFor.toLocaleString('bs-BA', { timeZone: params.timezone, dateStyle: 'medium', timeStyle: 'short' });
  const dl = params.deadline
    ? `<p style="font-size:14px">Ako ne odgovorite do <b>${esc(params.deadline.toLocaleTimeString('bs-BA', { timeZone: params.timezone, hour: '2-digit', minute: '2-digit' }))}</b>, objava ide automatski.</p>`
    : '';
  try {
    await resend.emails.send({
      from: from(),
      to: params.to,
      subject: `Nova objava čeka odobrenje: ${params.typeLabel}`,
      html: layout(
        `${params.authorName} je pripremio objavu za ${params.restaurantName}`,
        `<p style="font-size:14px">Termin objave: <b>${esc(when)}</b></p>${dl}
         <div style="background:#F8FBF0;border:1px solid #E3DDC6;border-radius:8px;padding:12px;font-size:13px;white-space:pre-line">${esc(params.preview.slice(0, 400))}</div>`,
        { href: `${appUrl()}/dashboard/odobrenje`, label: 'Pregledaj i odobri' }
      ),
    });
  } catch (e: any) {
    console.error('[Email] Slanje zahtjeva za odobrenje nije uspjelo:', e.message);
  }
}

export async function sendPostFailedAlert(params: {
  to: string[];
  platform: string;
  accountName: string;
  contentPreview?: string | null;
  errorMessage: string;
}) {
  const resend = client();
  const admin = process.env.ADMIN_ALERT_EMAIL;
  const to = Array.from(new Set([...params.to, ...(admin ? [admin] : [])]));
  if (!resend || to.length === 0) return;
  try {
    await resend.emails.send({
      from: from(),
      to,
      subject: `Objava nije uspjela: ${params.platform} (${params.accountName})`,
      html: layout(
        'Objava nije uspjela nakon svih pokušaja',
        `<p style="font-size:14px">Mreža: <b>${esc(params.platform)}</b>, nalog: <b>${esc(params.accountName)}</b></p>
         <div style="background:#F8FBF0;border:1px solid #E3DDC6;border-radius:8px;padding:12px;font-size:13px">${esc((params.contentPreview || '[bez teksta]').slice(0, 160))}</div>
         <div style="background:#FCE7E4;border-radius:8px;padding:12px;font-size:12px;color:#7A1F16;margin-top:12px;font-family:monospace;word-break:break-word">${esc(params.errorMessage.slice(0, 800))}</div>`,
        { href: `${appUrl()}/dashboard/kalendar`, label: 'Otvori kalendar' }
      ),
    });
  } catch (e: any) {
    console.error('[Email] Slanje upozorenja nije uspjelo:', e.message);
  }
}
