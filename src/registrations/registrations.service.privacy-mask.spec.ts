import 'reflect-metadata';

/**
 * Unit tests for RegistrationsService.findByEvent() — applyPrivacyMask().
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
const mockFindMany = jest.fn();
const mockEventFindUnique = jest.fn();
const mockConnect = jest.fn().mockResolvedValue(undefined);

jest.mock('../generated/prisma', () => ({
  PrismaClient: class {
    eventRegistration = {
      findMany: mockFindMany,
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

function buildRegistration(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'reg-1',
    eventId,
    userId: 'user-1',
    vehicleId: 'vehicle-1',
    shareMedicalInfo: false,
    allowOrganizerContact: false,
    eps: 'Sura',
    medicalInsurance: 'PolizaX',
    bloodType: 'O_POSITIVE',
    emergencyContactName: 'John Doe',
    emergencyContactPhone: '3007654321',
    phone: '3001234567',
    identificationNumber: '123456',
    email: 'jane@example.com',
    residenceCity: 'Bogotá',
    ...overrides,
  };
}

describe('RegistrationsService — findByEvent() applyPrivacyMask()', () => {
  let service: RegistrationsService;

  beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    mockFindMany.mockReset();
    mockEventFindUnique.mockReset();

    service = new RegistrationsService(
      mockUsersService as any,
      mockVehiclesService as any,
    );
  });

  it('masks medical fields with __NOT_SHARED__ when event is SCHEDULED, regardless of shareMedicalInfo', async () => {
    mockEventFindUnique.mockResolvedValue({
      id: eventId,
      state: 'SCHEDULED',
      sosTriggeredAt: null,
    });
    mockFindMany.mockResolvedValue([
      buildRegistration({ shareMedicalInfo: true }),
    ]);

    const [result] = await service.findByEvent(eventId);

    expect(result.eps).toBe('__NOT_SHARED__');
    expect(result.medicalInsurance).toBe('__NOT_SHARED__');
    expect(result.bloodType).toBe('__NOT_SHARED__');
    expect(result.vehicleSummary).toEqual({ id: 'vehicle-1', brand: 'Honda' });
  });

  it('reveals medical fields when event is IN_PROGRESS and shareMedicalInfo is true', async () => {
    mockEventFindUnique.mockResolvedValue({
      id: eventId,
      state: 'IN_PROGRESS',
      sosTriggeredAt: null,
    });
    mockFindMany.mockResolvedValue([
      buildRegistration({ shareMedicalInfo: true }),
    ]);

    const [result] = await service.findByEvent(eventId);

    expect(result.eps).toBe('Sura');
    expect(result.medicalInsurance).toBe('PolizaX');
    expect(result.bloodType).toBe('O_POSITIVE');
  });

  it('masks medical fields when event is IN_PROGRESS but shareMedicalInfo is false', async () => {
    mockEventFindUnique.mockResolvedValue({
      id: eventId,
      state: 'IN_PROGRESS',
      sosTriggeredAt: null,
    });
    mockFindMany.mockResolvedValue([
      buildRegistration({ shareMedicalInfo: false }),
    ]);

    const [result] = await service.findByEvent(eventId);

    expect(result.eps).toBe('__NOT_SHARED__');
    expect(result.medicalInsurance).toBe('__NOT_SHARED__');
    expect(result.bloodType).toBe('__NOT_SHARED__');
  });

  it('masks phone with •••• when allowOrganizerContact is false, and reveals it when true', async () => {
    mockEventFindUnique.mockResolvedValue({
      id: eventId,
      state: 'SCHEDULED',
      sosTriggeredAt: null,
    });
    mockFindMany.mockResolvedValue([
      buildRegistration({ allowOrganizerContact: false }),
      buildRegistration({ id: 'reg-2', allowOrganizerContact: true }),
    ]);

    const [maskedResult, revealedResult] = await service.findByEvent(eventId);

    expect(maskedResult.phone).toBe('••••');
    expect(revealedResult.phone).toBe('3001234567');
  });

  it('masks identificationNumber, email and residenceCity when sosTriggeredAt is null, reveals when set', async () => {
    mockEventFindUnique.mockResolvedValue({
      id: eventId,
      state: 'SCHEDULED',
      sosTriggeredAt: null,
    });
    mockFindMany.mockResolvedValue([buildRegistration()]);

    const [maskedResult] = await service.findByEvent(eventId);

    expect(maskedResult.identificationNumber).toBe('••••');
    expect(maskedResult.email).toBe('••••');
    expect(maskedResult.residenceCity).toBe('••••');

    mockEventFindUnique.mockResolvedValue({
      id: eventId,
      state: 'SCHEDULED',
      sosTriggeredAt: new Date('2026-06-30T12:00:00.000Z'),
    });

    const [revealedResult] = await service.findByEvent(eventId);

    expect(revealedResult.identificationNumber).toBe('123456');
    expect(revealedResult.email).toBe('jane@example.com');
    expect(revealedResult.residenceCity).toBe('Bogotá');
  });
});
