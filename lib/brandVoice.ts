import { z } from 'zod';

export const brandVoiceSchema = z.object({
  tone: z.string().default('topao, domaći, bez pretjerivanja'),
  facts: z.array(z.string()).default([]),
  hashtags: z.array(z.string()).default([]),
  bannedWords: z.array(z.string()).default([]),
});
export type BrandVoice = z.infer<typeof brandVoiceSchema>;

export function parseBrandVoice(raw: unknown): BrandVoice {
  const r = brandVoiceSchema.safeParse(raw ?? {});
  return r.success ? r.data : brandVoiceSchema.parse({});
}

/** Profil Restorana MM (podaci sa mm-mostar.com). Koristi ga seed skripta. */
export const MM_BRAND_VOICE: BrandVoice = {
  tone: 'topao, domaći i iskren; ponos na tradiciju i vlastiti uzgoj; bez pretjerivanja i bez praznih superlativa',
  facts: [
    'Restoran MM, nacionalni restoran u samom srcu Mostara',
    'Adresa: Mostarskog bataljona 11, kod Musale, preko puta hotela Bristol',
    'Telefon za rezervacije: +387 36 558 902; catering: +387 61 221 299',
    'Više od 30 godina gastronomske tradicije, čuvaju stare, gotovo zaboravljene recepte',
    'Voće i povrće uzgajaju sami, organski, na imanju „Zelena Oaza“',
    'Catering za sve vrste poslovnih događaja na lokaciji po izboru klijenta',
    'Slogani: „Samo najbolje iz prirode“ i „Zato trajemo!“',
  ],
  hashtags: ['#Mostar', '#RestoranMM', '#ZelenaOaza', '#DomaćaKuhinja', '#MostarFood'],
  bannedWords: ['najbolji u gradu', 'garantovano', 'zdravo za sve'],
};
