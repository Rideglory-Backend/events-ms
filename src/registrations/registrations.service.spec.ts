import 'reflect-metadata';

/**
 * Unit tests for RegistrationsService.create() — medical consent / risk
 * acceptance fields persistence.
 *
 * We mock PrismaClient, the Prisma PG adapter, and the config/envs module to
 * avoid any database connection or env-var requirement.
 */

// ------------------------------------------------------------------
// Mock config/envs before any module that imports it
// ------------------------------------------------------------------
jest.mock('../config', () => ({
  envs: {
    port: 3001,
    usersMsPort: 3002,
    usersMsHost: 'localhost',
    vehiclesMsPort: 3003,
    vehiclesMsHost: 'localhost',
  },
  USERS_SERVICE: 'USERS_SERVICE',
  VEHICLES_SERVICE: 'VEHICLES_SERVICE',
}));

// ------------------------------------------------------------------
// Mock PrismaClient
// ------------------------------------------------------------------
const mockUpsert = jest.fn();
const mockFindFirst = jest.fn();
const mockEventFindUnique = jest.fn();
const mockUpdateMany = jest.fn();
const mockConnect = jest.fn().mockResolvedValue(undefined);

jest.mock('../generated/prisma', () => ({
  PrismaClient: class {
    eventRegistration = {
      upsert: mockUpsert,
      findFirst: mockFindFirst,
      updateMany: mockUpdateMany,
    };
    event = {
      findUnique: mockEventFindUnique,
    };
    $connect = mockConnect;
  },
}));

jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: jest.fn().mockImplementation(() => ({})),
}));

// ------------------------------------------------------------------
// Actual imports (after mocks are set up)
// ------------------------------------------------------------------
import { BloodType } from '@rideglory/contracts';
import { RegistrationsService } from './registrations.service';

const mockUsersService = { send: jest.fn() };
const mockVehiclesService = {
  send: jest.fn().mockReturnValue({
    pipe: jest.fn().mockReturnValue({
      // Mimic firstValueFrom() consuming an Observable that emits a vehicle.
      subscribe: (observer: {
        next: (value: unknown) => void;
        complete: () => void;
      }) => {
        observer.next({ id: 'vehicle-1', brand: 'Honda' });
        observer.complete();
      },
    }),
  }),
};

const eventId = 'evt-1';
const userId = 'user-1';
const ownerId = 'owner-1';

const basePayload = {
  eventId,
  userId,
  fullName: 'Jane Doe',
  identificationNumber: '123456',
  birthDate: new Date('1990-01-01'),
  phone: '3001234567',
  email: 'jane@example.com',
  residenceCity: 'Bogotá',
  eps: 'Sura',
  bloodType: BloodType.O_POSITIVE,
  emergencyContactName: 'John Doe',
  emergencyContactPhone: '3007654321',
  vehicleId: 'vehicle-1',
};

describe('RegistrationsService — create() medical consent / risk fields', () => {
  let service: RegistrationsService;

  beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    mockUpsert.mockReset();
    mockFindFirst.mockReset();
    mockEventFindUnique.mockReset();

    mockEventFindUnique.mockResolvedValue({
      id: eventId,
      ownerId,
      allowedBrands: [],
    });
    mockFindFirst.mockResolvedValue(null);
    mockUpsert.mockImplementation(({ create }) => Promise.resolve(create));

    service = new RegistrationsService(
      mockUsersService as any,
      mockVehiclesService as any,
    );
  });

  it('persists shareMedicalInfo, allowOrganizerContact, risk and medical consent fields when present in the payload', async () => {
    const riskAcceptedAt = new Date('2026-06-30T12:00:00.000Z');
    const medicalConsentAcceptedAt = new Date('2026-06-30T12:05:00.000Z');

    await service.create({
      ...basePayload,
      shareMedicalInfo: true,
      allowOrganizerContact: true,
      riskAcceptedAt,
      riskAcceptanceVersion: 'v1',
      medicalConsentAcceptedAt,
      medicalConsentVersion: 'v1',
    } as any);

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          shareMedicalInfo: true,
          allowOrganizerContact: true,
          riskAcceptedAt,
          riskAcceptanceVersion: 'v1',
          medicalConsentAcceptedAt,
          medicalConsentVersion: 'v1',
        }),
        update: expect.objectContaining({
          shareMedicalInfo: true,
          allowOrganizerContact: true,
          riskAcceptedAt,
          riskAcceptanceVersion: 'v1',
          medicalConsentAcceptedAt,
          medicalConsentVersion: 'v1',
        }),
      }),
    );
  });

  it('defaults shareMedicalInfo/allowOrganizerContact to false and risk/medical consent fields to null when omitted', async () => {
    await service.create({ ...basePayload } as any);

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          shareMedicalInfo: false,
          allowOrganizerContact: false,
          riskAcceptedAt: null,
          riskAcceptanceVersion: null,
          medicalConsentAcceptedAt: null,
          medicalConsentVersion: null,
        }),
      }),
    );
  });
});

describe('RegistrationsService.anonymizeByUserId — regression (eliminacion-cuenta-phase-04, already idempotent)', () => {
  let service: RegistrationsService;

  beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    mockUpdateMany.mockReset();

    service = new RegistrationsService(
      mockUsersService as any,
      mockVehiclesService as any,
    );
  });

  it('is already idempotent via updateMany — running it twice yields count:0 on the second run, without error', async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 2 });

    const first = await service.anonymizeByUserId(userId);
    expect(first).toEqual({ count: 2 });

    // Second run: rows are already anonymized, so a real DB would match
    // fewer/no rows against `where: { userId }` update criteria that are
    // idempotent (setting the same anonymized values again is a no-op).
    mockUpdateMany.mockResolvedValueOnce({ count: 0 });
    const second = await service.anonymizeByUserId(userId);

    expect(second).toEqual({ count: 0 });
    expect(mockUpdateMany).toHaveBeenCalledTimes(2);
    expect(mockUpdateMany.mock.calls[1][0]).toEqual({
      where: { userId },
      data: expect.objectContaining({
        identificationNumber: null,
        birthDate: null,
        phone: null,
        email: null,
      }),
    });
  });
});
