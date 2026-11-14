# MM Objave

Aplikacija za svakodnevne objave na Facebook i Instagram za Restoran MM, s odobrenjem vlasnice. Napravio Norvel, spremno za više restorana.

**Tok:** osoblje unese fotografiju i jela → AI napiše dvije varijante teksta → vlasnica odobri, izmijeni ili odbije → objava izlazi u zakazanom terminu. Ako vlasnica ne odgovori, objava ide automatski X minuta prije termina (podešava se po restoranu, `autoPublishMinutes`, 0 = nikad automatski).

## Stack

- Next.js 14 (App Router) + Tailwind, NextAuth v5 (email i lozinka, bcrypt)
- PostgreSQL + Prisma, Redis + BullMQ (worker za zakazivanje, odobrenja, analitiku)
- Cloudflare R2 za fotografije, Google Gemini za tekstove, Resend za email
- Meta Graph API (Facebook stranica + Instagram profesionalni nalog)

## Uloge

| Uloga | Šta radi |
| --- | --- |
| `STAFF` (osoblje) | Pravi objave; idu vlasnici na odobrenje |
| `OWNER` (vlasnica) | Odobrava, mijenja, otkazuje; povezuje naloge; vidi izvještaj |
| `ADMIN` (Norvel) | Sve što i vlasnica |

## Lokalno pokretanje

```bash
cp .env.example .env          # popuni vrijednosti
docker compose up -d          # Postgres i Redis
npm install
npx prisma migrate deploy
npm run seed                  # Restoran MM + korisnici iz SEED_* varijabli
npm run dev                   # http://localhost:3000
npm run worker                # u drugom terminalu
```

## Deploy na Railway

1. **GitHub:** napravi privatni repo i pushaj kod (`git push -u origin main`).
2. **Railway projekt:** New Project → Deploy from GitHub repo → izaberi repo. Ovo je servis **web** (koristi `railway.json`).
3. **Baze:** u istom projektu dodaj **PostgreSQL** i **Redis** (New → Database).
4. **Varijable za web** (Variables): sve iz `.env.example`, a za bazu i Redis reference:
   - `DATABASE_URL=${{Postgres.DATABASE_URL}}`
   - `REDIS_URL=${{Redis.REDIS_URL}}`
   - `NEXT_PUBLIC_APP_URL` = javni URL servisa (Settings → Networking → Generate Domain ili vlastita domena)
5. **Worker:** New → GitHub repo (isti repo) → u Settings servisa postavi **Config-as-code path** na `railway.worker.json`. Varijable: kopiraj iste kao za web (ili koristi Shared Variables).
6. **Prvi admin:** u web servisu postavi `SEED_ADMIN_EMAIL` i `SEED_ADMIN_PASSWORD` (najmanje 12 znakova). Pri pokretanju se automatski kreira restoran MM i admin (`npm run seed:auto`). Kad se prijaviš, obriši `SEED_ADMIN_PASSWORD` iz varijabli, inače se lozinka vraća na tu vrijednost na svakom deployu.
7. **Provjera:** `https://<domena>/api/health` vraća `"status":"ok"` kad rade baza, Redis i worker.

Migracije baze se pokreću same pri startu web servisa (`prisma migrate deploy`).

## Meta aplikacija (Facebook i Instagram)

1. developers.facebook.com → Create App → tip **Business**.
2. Dodaj proizvod **Facebook Login for Business** i u **Valid OAuth Redirect URIs** upiši `https://<domena>/api/oauth/meta/callback`.
3. Kopiraj App ID i App Secret u `META_APP_ID` i `META_APP_SECRET`.
4. Dok je aplikacija u razvojnom modu, nalog koji povezuje mora imati ulogu u aplikaciji (Admin, Developer ili Tester) i biti admin Facebook stranice restorana.
5. Instagram restorana mora biti **profesionalni (Business) nalog povezan s Facebook stranicom**.
6. U aplikaciji: Nalozi → Poveži Facebook i Instagram → izaberi stranicu restorana.
7. Za druge restorane (korisnike van aplikacije) treba **App Review** za dozvole `pages_manage_posts`, `pages_read_engagement`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights` i **Business verifikacija**.

Verzija Graph API-ja je u `META_GRAPH_VERSION`; provjeri aktuelnu na developers.facebook.com/docs/graph-api/changelog.

## Cloudflare R2

1. R2 → Create bucket (`mm-objave-media`).
2. Settings → Public access: poveži vlastitu domenu (npr. `media.norvelstudio.com`) → to je `R2_PUBLIC_URL`. Meta mora moći javno preuzeti sliku.
3. CORS bucketa: dozvoli `PUT` sa domene aplikacije (`AllowedOrigins: ["https://<domena>"]`, `AllowedMethods: ["PUT"]`, `AllowedHeaders: ["content-type", "content-length"]`).
4. Manage R2 API Tokens → token s Object Read & Write za bucket → `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`.

## Sigurnost

- Meta tokeni se čuvaju šifrovani (AES-256-GCM). `ENCRYPTION_KEY` se ne smije mijenjati nakon povezivanja naloga, inače se nalozi moraju ponovo povezati.
- Lozinke: bcrypt; prijava ima limit 10 pokušaja u 15 minuta po IP adresi.
- Svi podaci su odvojeni po `restaurantId`.
- `.env` se nikad ne commituje.

## Poznata ograničenja (sljedeći koraci)

- Grafički MM šabloni (renderovanje fotografije u okvir s tekstom) još nisu dio aplikacije; objavljuje se originalna fotografija.
- Korisnici: vlasnik ili admin dodaje ljude u **Korisnici**; oni dobiju email s jednokratnim linkom (7 dana) i sami postave lozinku. Bez Resenda aplikacija prikaže link za ručno slanje. Zaboravljena lozinka šalje link koji važi 1 sat.
- Javne registracije nema; uloga i pripadnost restoranu čitaju se iz baze na svakom zahtjevu, pa uklanjanje korisnika djeluje odmah.
- TikTok je isključen (`ENABLE_TIKTOK=false`) jer traži odobrenje TikTok aplikacije.
