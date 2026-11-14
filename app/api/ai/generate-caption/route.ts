import { NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireApiUser } from '@/lib/session';
import { parseBrandVoice } from '@/lib/brandVoice';
import { POST_TYPE_IDS, postTypeLabel } from '@/lib/postTypes';
import { rateLimit } from '@/lib/rateLimit';

const bodySchema = z.object({
  type: z.enum(POST_TYPE_IDS),
  notes: z.string().trim().min(2, 'Upiši jela ili napomenu.').max(1500),
  withEnglish: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  const res = await requireApiUser();
  if ('error' in res) return res.error;
  const { user } = res;

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'AI nije podešen (GEMINI_API_KEY).' }, { status: 503 });
  }
  if (!(await rateLimit(`ai:${user.id}`, 30, 3600))) {
    return NextResponse.json({ error: 'Previše zahtjeva. Pokušaj ponovo za sat vremena.' }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Neispravan unos.' }, { status: 400 });
  }
  const { type, notes, withEnglish } = parsed.data;

  const restaurant = await prisma.restaurant.findUnique({ where: { id: user.restaurantId } });
  const voice = parseBrandVoice(restaurant?.brandVoice);

  const prompt = `Pišeš objavu za Instagram i Facebook restorana "${restaurant?.name ?? 'restoran'}".
Jezik: bosanski, ijekavica.${withEnglish ? ' Ispod bosanskog teksta dodaj kraći prevod na engleski za turiste, odvojen praznim redom.' : ''}
Vrsta objave: ${postTypeLabel(type)}.
Ton: ${voice.tone}.

Činjenice o restoranu (koristi samo ako odgovaraju objavi, nemoj izmišljati druge):
${voice.facts.map((f) => `- ${f}`).join('\n') || '- (nema)'}

Unos osoblja (jedini izvor za jela, cijene, datume i ponude):
"""
${notes}
"""

Pravila:
- Ne izmišljaj cijene, popuste, datume, jela ni zdravstvene tvrdnje kojih nema u unosu osoblja.
- Najviše dva emojija. Bez riječi: ${voice.bannedWords.join(', ') || '(nema)'}.
- Kraj teksta: kratak poziv (rezervacija ili dolazak) i telefon ako postoji u činjenicama.
- Tekst do 900 znakova, bez hashtagova u samom tekstu.
- Hashtagovi: 5 do 8, uključi ove ako odgovaraju: ${voice.hashtags.join(' ') || '(nema)'}.
- Vrati dvije različite varijante teksta: A je toplija i opširnija, B kraća i direktnija.`;

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const primary = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
    // Opcionalno: rezervni model(i), odvojeni zarezom, ako je glavni preopterećen.
    const fallbacks = (process.env.GEMINI_FALLBACK_MODELS || '').split(',').map((m) => m.trim()).filter(Boolean);
    const response = await generateWithRetry(ai, [primary, ...fallbacks], prompt);
    console.info(`[AI] OK (${user.id})`);
    const out = JSON.parse(response.text || '{}');
    const tags: string[] = (out.hashtags || [])
      .map((h: string) => (h.startsWith('#') ? h : `#${h}`).replace(/\s+/g, ''))
      .slice(0, 8);
    return NextResponse.json({ variants: [out.variantA, out.variantB].filter(Boolean), hashtags: tags });
  } catch (e: any) {
    console.error('[AI] Greška:', e?.message);
    const msg = String(e?.message ?? '');
    if (isTransient(msg) || e?.name === 'AbortError' || e?.name === 'TimeoutError' || /timeout|aborted/i.test(msg)) {
      return NextResponse.json(
        { error: 'AI je trenutno preopterećen (Google). Pokušaj ponovo za minut ili napiši tekst ručno.' },
        { status: 503 }
      );
    }
    const hint = /NOT_FOUND|no longer available/i.test(msg)
      ? ' (AI model nije dostupan, provjeri GEMINI_MODEL.)'
      : /API key|PERMISSION_DENIED|UNAUTHENTICATED/i.test(msg)
        ? ' (provjeri GEMINI_API_KEY.)'
        : '';
    return NextResponse.json({ error: `AI trenutno nije dostupan. Napiši tekst ručno ili pokušaj ponovo.${hint}` }, { status: 502 });
  }
}

const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    variantA: { type: Type.STRING },
    variantB: { type: Type.STRING },
    hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['variantA', 'variantB', 'hashtags'],
};

/** Privremene greške (preopterećenje, limit, mrežni prekid) vrijedi ponoviti. */
const isTransient = (msg: string) =>
  /\b(429|500|503|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand|DEADLINE_EXCEEDED|ECONNRESET|fetch failed/i.test(msg);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const CALL_TIMEOUT_MS = 15_000; // jedan poziv Geminiju
const TOTAL_BUDGET_MS = 40_000; // ukupno za sve pokušaje (preglednik prekida na 50 s)

/** Pokušaj s vremenskim ograničenjem, da zahtjev nikad ne visi. */
function callModel(ai: GoogleGenAI, model: string, prompt: string) {
  return ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      temperature: 0.8,
      responseMimeType: 'application/json',
      responseSchema: SCHEMA,
      httpOptions: { timeout: CALL_TIMEOUT_MS },
      abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS + 1000),
    },
  });
}

/** Rezervni "flash" modeli dostupni ovom ključu (pronalaze se automatski, keširano 6 h). */
let discovered: { at: number; models: string[] } | null = null;
async function discoverFallbacks(ai: GoogleGenAI, primary: string): Promise<string[]> {
  if (discovered && Date.now() - discovered.at < 6 * 3600_000) return discovered.models.filter((m) => m !== primary);
  const names: string[] = [];
  try {
    const pager = await ai.models.list({ config: { pageSize: 100, abortSignal: AbortSignal.timeout(5000) } });
    for await (const m of pager) {
      const name = (m.name || '').replace(/^models\//, '');
      const actions = m.supportedActions || [];
      if (!/flash/i.test(name) || !actions.includes('generateContent')) continue;
      if (/image|tts|audio|live|embedding|thinking|exp/i.test(name)) continue;
      names.push(name);
    }
  } catch (e: any) {
    console.warn('[AI] Lista modela nije dostupna:', String(e?.message ?? e).slice(0, 120));
  }
  // Prvo "lite" (manje opterećeni), pa ostali; najviše dva rezervna.
  names.sort((a, b) => Number(/lite/i.test(b)) - Number(/lite/i.test(a)) || b.localeCompare(a));
  discovered = { at: Date.now(), models: names };
  return names.filter((m) => m !== primary).slice(0, 2);
}

/**
 * Glavni model jednom; ako je preopterećen, rezervni modeli (iz GEMINI_FALLBACK_MODELS ili pronađeni
 * automatski) pa još jednom glavni. Sve unutar ukupnog budžeta od 40 s.
 */
async function generateWithRetry(ai: GoogleGenAI, models: string[], prompt: string) {
  const started = Date.now();
  const [primary, ...configured] = models;
  let lastError: unknown;
  const queue: string[] = [primary];
  let fallbacksAdded = false;

  for (let i = 0; i < queue.length; i++) {
    if (Date.now() - started > TOTAL_BUDGET_MS - CALL_TIMEOUT_MS) break;
    const model = queue[i];
    try {
      return await callModel(ai, model, prompt);
    } catch (e: any) {
      lastError = e;
      const msg = String(e?.message ?? '');
      const transient = isTransient(msg) || e?.name === 'AbortError' || e?.name === 'TimeoutError';
      if (!transient) throw e;
      console.warn(`[AI] ${model} nije odgovorio (privremeno): ${msg.slice(0, 120) || e?.name}`);
      if (!fallbacksAdded) {
        fallbacksAdded = true;
        const extra = configured.length ? configured : await discoverFallbacks(ai, primary);
        queue.push(...extra, primary);
        await sleep(600);
      }
    }
  }
  throw lastError ?? new Error('AI timeout (UNAVAILABLE)');
}
