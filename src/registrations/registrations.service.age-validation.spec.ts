import 'reflect-metadata';

/**
 * Unit tests for RegistrationsService.create() — age gate (ensureRiderIsAdult).
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
const mockConnect = jest.fn().mockResolvedValue(undefined);

jest.mock('../generated/prisma', () => ({
  PrismaClient: class {
    eventRegistration = {
      upsert: mockUpsert,
      findFirst: mockFindFirst,
    };
    event = {
      findUnique: mockEventFindUnique,
    };
    $connect = mockConnect;
  },
  EventState: {
    DRAFT: 'DRAFT',
    SCHEDULED: 'SCHEDULED',
    IN_PROGRESS: 'IN_PROGRESS',
    CANCELLED: 'CANCELLED',
    FINISHED: 'FINISHED',
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
  phone: '3001234567',
  email: 'jane@example.com',
  residenceCity: 'Bogotá',
  eps: 'Sura',
  bloodType: BloodType.O_POSITIVE,
  emergencyContactName: 'John Doe',
  emergencyContactPhone: '3007654321',
  vehicleId: 'vehicle-1',
};

function daysAgo(days: number, from: Date = new Date()): Date {
  const date = new Date(from);
  date.setDate(date.getDate() - days);
  return date;
}

function yearsAgoToday(years: number, from: Date = new Date()): Date {
  const date = new Date(from);
  date.setFullYear(date.getFullYear() - years);
  return date;
}

describe('RegistrationsService — create() age gate (ensureRiderIsAdult)', () => {
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

  it('rejects a rider who is 17 years and 364 days old with 422 UNDERAGE_RIDER', async () => {
    const birthDate = daysAgo(18 * 365 - 1);

    await expect(
      service.create({ ...basePayload, birthDate } as any),
    ).rejects.toMatchObject({
      error: expect.objectContaining({
        status: 422,
        message: 'UNDERAGE_RIDER',
      }),
    });

    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('accepts a rider whose 18th birthday is exactly today', async () => {
    const birthDate = yearsAgoToday(18);

    await expect(
      service.create({ ...basePayload, birthDate } as any),
    ).resolves.toBeDefined();

    expect(mockUpsert).toHaveBeenCalled();
  });

  it('accepts a rider who is comfortably over 18', async () => {
    const birthDate = new Date('1990-01-01');

    await expect(
      service.create({ ...basePayload, birthDate } as any),
    ).resolves.toBeDefined();

    expect(mockUpsert).toHaveBeenCalled();
  });

  it('rejects a rider who is comfortably under 18', async () => {
    const birthDate = yearsAgoToday(15);

    await expect(
      service.create({ ...basePayload, birthDate } as any),
    ).rejects.toMatchObject({
      error: expect.objectContaining({
        status: 422,
        message: 'UNDERAGE_RIDER',
      }),
    });

    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
