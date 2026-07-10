import 'reflect-metadata';

/**
 * Unit tests for RegistrationsService.anonymizeByUserId() — permanent PII
 * anonymization triggered by account deletion (eliminacion-cuenta-phase-03).
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
const mockUpdateMany = jest.fn();
const mockConnect = jest.fn().mockResolvedValue(undefined);

jest.mock('../generated/prisma', () => ({
  PrismaClient: class {
    eventRegistration = {
      updateMany: mockUpdateMany,
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
import { RegistrationsService } from './registrations.service';

const mockUsersService = { send: jest.fn() };
const mockVehiclesService = { send: jest.fn() };

const userId = 'user-deleted-1';

describe('RegistrationsService — anonymizeByUserId()', () => {
  let service: RegistrationsService;

  beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    mockUpdateMany.mockReset();

    service = new RegistrationsService(
      mockUsersService as any,
      mockVehiclesService as any,
    );
  });

  it('filters strictly by EventRegistration.userId, never by Event.ownerId', async () => {
    mockUpdateMany.mockResolvedValue({ count: 3 });

    await service.anonymizeByUserId(userId);

    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId } }),
    );
  });

  it('anonymizes exactly the 8 PII fields plus fullName and the two consent-related booleans', async () => {
    mockUpdateMany.mockResolvedValue({ count: 2 });

    await service.anonymizeByUserId(userId);

    const { data } = mockUpdateMany.mock.calls[0][0];

    expect(data).toEqual({
      fullName: 'Usuario eliminado',
      identificationNumber: null,
      birthDate: null,
      phone: null,
      email: null,
      residenceCity: null,
      eps: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
      shareMedicalInfo: false,
      allowOrganizerContact: false,
    });
  });

  it('does not touch bloodType, legal-evidence fields, vehicleId, status, eventId or userId', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });

    await service.anonymizeByUserId(userId);

    const { data } = mockUpdateMany.mock.calls[0][0];

    expect(data).not.toHaveProperty('bloodType');
    expect(data).not.toHaveProperty('medicalInsurance');
    expect(data).not.toHaveProperty('riskAcceptedAt');
    expect(data).not.toHaveProperty('riskAcceptanceVersion');
    expect(data).not.toHaveProperty('medicalConsentAcceptedAt');
    expect(data).not.toHaveProperty('medicalConsentVersion');
    expect(data).not.toHaveProperty('vehicleId');
    expect(data).not.toHaveProperty('status');
    expect(data).not.toHaveProperty('eventId');
    expect(data).not.toHaveProperty('userId');
    expect(data).not.toHaveProperty('id');
  });

  it('does not reuse or reference FULL_MASK — anonymization writes a distinct literal name', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });

    await service.anonymizeByUserId(userId);

    const { data } = mockUpdateMany.mock.calls[0][0];

    expect(data.fullName).toBe('Usuario eliminado');
    expect(data.fullName).not.toBe('••••');
  });

  it('returns the count of affected registrations', async () => {
    mockUpdateMany.mockResolvedValue({ count: 5 });

    const result = await service.anonymizeByUserId(userId);

    expect(result).toEqual({ count: 5 });
  });

  it('is idempotent: a second call for the same userId does not throw and yields the same effect', async () => {
    mockUpdateMany.mockResolvedValue({ count: 4 });

    const first = await service.anonymizeByUserId(userId);
    const second = await service.anonymizeByUserId(userId);

    expect(first).toEqual({ count: 4 });
    expect(second).toEqual({ count: 4 });
    expect(mockUpdateMany).toHaveBeenCalledTimes(2);
    expect(mockUpdateMany.mock.calls[0][0]).toEqual(mockUpdateMany.mock.calls[1][0]);
  });

  it('resolves with count 0 without throwing when the user has no registrations', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });

    await expect(service.anonymizeByUserId(userId)).resolves.toEqual({
      count: 0,
    });
  });
});
