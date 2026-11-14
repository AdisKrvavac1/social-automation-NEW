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
    if (isTransient(msg)) {
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

/** Do 3 pokušaja po modelu (pauze ~1 s i ~2.5 s), pa sljedeći model. Ukupno ostaje ispod ~25 s. */
async function generateWithRetry(ai: GoogleGenAI, models: string[], prompt: string) {
  let lastError: unknown;
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await ai.models.generateContent({
          model,
          contents: prompt,
          config: { temperature: 0.8, responseMimeType: 'application/json', responseSchema: SCHEMA },
        });
      } catch (e: any) {
        lastError = e;
        const msg = String(e?.message ?? '');
        if (!isTransient(msg)) throw e;
        console.warn(`[AI] ${model} pokušaj ${attempt + 1} nije uspio (privremeno): ${msg.slice(0, 120)}`);
        if (attempt < 2) await sleep(1000 * (attempt === 0 ? 1 : 2.5) + Math.random() * 400);
      }
    }
  }
  throw lastError;
}
