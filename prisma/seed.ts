/**
 * Seed file for events-ms — creates 1 scheduled event + 1 registration.
 * Run: npx ts-node prisma/seed.ts
 *
 * Prerequisite: a user must exist in users-ms with the seed userId below.
 * Update SEED_USER_ID to match a real user ID in the local database.
 */

import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';

const SEED_USER_ID = process.env.SEED_USER_ID ?? '00000000-0000-0000-0000-000000000001';
const SEED_REGISTRANT_ID = process.env.SEED_REGISTRANT_ID ?? '00000000-0000-0000-0000-000000000002';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });

  await prisma.$connect();

  console.log('Seeding events-ms...');

  const event = await prisma.event.upsert({
    where: { id: '00000000-0000-0000-0002-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0002-000000000001',
      ownerId: SEED_USER_ID,
      name: 'Rodada Cordillera Oriental 2026',
      description: 'Recorrido épico por la cordillera oriental colombiana',
      city: 'Bogotá',
      eventType: 'ON_ROAD',
      difficulty: 'MODERATE',
      state: 'SCHEDULED',
      startDate: new Date('2026-06-15T07:00:00Z'),
      meetingTime: new Date('2026-06-15T06:00:00Z'),
      meetingPoint: 'Parque de la 93, Bogotá',
      destination: 'Villa de Leyva',
      allowedBrands: [],
    },
  });

  console.log('Created event:', event.id);

  // Create a pending registration
  const existing = await prisma.eventRegistration.findFirst({
    where: { eventId: event.id, userId: SEED_REGISTRANT_ID },
  });

  if (!existing) {
    const registration = await prisma.eventRegistration.create({
      data: {
        eventId: event.id,
        userId: SEED_REGISTRANT_ID,
        status: 'PENDING',
        fullName: 'Rider de Prueba',
        identificationNumber: '1234567890',
        birthDate: new Date('1990-01-01'),
        phone: '3001234567',
        email: 'rider@example.com',
        residenceCity: 'Bogotá',
        eps: 'Sura',
        bloodType: 'O_POSITIVE',
        emergencyContactName: 'Contacto Emergencia',
        emergencyContactPhone: '3009876543',
      },
    });
    console.log('Created registration:', registration.id);
  } else {
    console.log('Registration already exists:', existing.id);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
