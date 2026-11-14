/**
 * Kreira Restoran MM i korisnike iz varijabli okruženja. Može se pokretati više puta.
 *   SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD   (Norvel admin, obavezno)
 *   SEED_OWNER_EMAIL / SEED_OWNER_PASSWORD / SEED_OWNER_NAME   (vlasnica, opcionalno)
 *   SEED_STAFF_EMAIL / SEED_STAFF_PASSWORD / SEED_STAFF_NAME   (osoblje, opcionalno)
 * Lozinke: najmanje 12 znakova.
 */
import { PrismaClient, type Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { MM_BRAND_VOICE } from '../lib/brandVoice';

const prisma = new PrismaClient();

async function upsertUser(role: Role, prefix: string, restaurantId: string, required: boolean) {
  const email = process.env[`SEED_${prefix}_EMAIL`]?.trim().toLowerCase();
  const password = process.env[`SEED_${prefix}_PASSWORD`];
  const name = process.env[`SEED_${prefix}_NAME`] || null;
  if (!email || !password) {
    if (required) throw new Error(`SEED_${prefix}_EMAIL i SEED_${prefix}_PASSWORD su obavezni.`);
    return;
  }
  if (password.length < 12) throw new Error(`Lozinka za ${email} mora imati bar 12 znakova.`);
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email },
    create: { email, name, role, passwordHash, restaurantId },
    update: { role, passwordHash, restaurantId, ...(name ? { name } : {}) },
  });
  console.log(`✓ ${role}: ${email}`);
}

async function main() {
  const restaurant = await prisma.restaurant.upsert({
    where: { slug: 'restoran-mm' },
    create: {
      name: 'Restoran MM',
      slug: 'restoran-mm',
      timezone: 'Europe/Sarajevo',
      defaultPostTime: '11:00',
      autoPublishMinutes: 30,
      brandVoice: MM_BRAND_VOICE,
    },
    update: { brandVoice: MM_BRAND_VOICE },
  });
  console.log(`✓ Restoran: ${restaurant.name}`);
  await upsertUser('ADMIN', 'ADMIN', restaurant.id, true);
  await upsertUser('OWNER', 'OWNER', restaurant.id, false);
  await upsertUser('STAFF', 'STAFF', restaurant.id, false);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
