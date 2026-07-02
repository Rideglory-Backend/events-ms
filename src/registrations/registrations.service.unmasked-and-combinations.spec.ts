import 'reflect-metadata';

/**
 * Unit tests for RegistrationsService covering two gaps identified in
 * QA handoff (legal-privacidad-edad-fase2):
 *
 * 1. `findMyRegistrationForEvent()` / `findMyRegistrations()` never apply
 *    `applyPrivacyMask()` — the "self view" of a registration must always
 *    show real values, regardless of event state / consent flags
 *    (QA cases 5.1, 5.2).
 * 2. `applyPrivacyMask()` (exercised via `findByEvent()`) under the fully
 *    unfavorable and fully favorable combinations of its 4 independent
 *    conditions in a single registration (QA cases 6A.1, 6B.1).
 *
 * Mirrors the mocking style of registrations.service.privacy-mask.spec.ts.
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
const mockFindFirst = jest.fn();
const mockEventFindUnique = jest.fn();
const mockConnect = jest.fn().mockResolvedValue(undefined);

jest.mock('../generated/prisma', () => ({
  PrismaClient: class {
    eventRegistration = {
      findMany: mockFindMany,
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

function buildRegistration(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'reg-1',
    eventId,
    userId,
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

describe('RegistrationsService — self-view endpoints never mask (QA 5.1, 5.2)', () => {
  let service: RegistrationsService;

  beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    mockFindMany.mockReset();
    mockFindFirst.mockReset();
    mockEventFindUnique.mockReset();

    service = new RegistrationsService(
      mockUsersService as any,
      mockVehiclesService as any,
    );
  });

  it('findMyRegistrationForEvent() returns all real values for a SCHEDULED event with shareMedicalInfo=false (QA 5.1)', async () => {
    mockFindFirst.mockResolvedValue(
      buildRegistration({ shareMedicalInfo: false, allowOrganizerContact: false }),
    );

    const result = await service.findMyRegistrationForEvent(eventId, userId);

    // ensureEventExists() must NOT be invoked for this path — no mask applied.
    expect(mockEventFindUnique).not.toHaveBeenCalled();

    expect(result).not.toBeNull();
    expect(result!.eps).toBe('Sura');
    expect(result!.medicalInsurance).toBe('PolizaX');
    expect(result!.bloodType).toBe('O_POSITIVE');
    expect(result!.phone).toBe('3001234567');
    expect(result!.identificationNumber).toBe('123456');
    expect(result!.email).toBe('jane@example.com');
    expect(result!.residenceCity).toBe('Bogotá');
    expect(result!.eps).not.toBe('••••');
    expect(result!.phone).not.toBe('••••');
  });

  it('findMyRegistrations() returns all real values for the caller own registrations (QA 5.2)', async () => {
    mockFindMany.mockResolvedValue([
      buildRegistration({ shareMedicalInfo: false, allowOrganizerContact: false }),
    ]);

    const [result] = await service.findMyRegistrations(userId);

    expect(mockEventFindUnique).not.toHaveBeenCalled();

    expect(result.eps).toBe('Sura');
    expect(result.medicalInsurance).toBe('PolizaX');
    expect(result.bloodType).toBe('O_POSITIVE');
    expect(result.phone).toBe('3001234567');
    expect(result.identificationNumber).toBe('123456');
    expect(result.email).toBe('jane@example.com');
    expect(result.residenceCity).toBe('Bogotá');
  });
});

describe('RegistrationsService — applyPrivacyMask() combined conditions (QA 6A.1, 6B.1)', () => {
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

  it('masks every sensitive field when all 4 conditions are unfavorable at once (QA 6A.1)', async () => {
    mockEventFindUnique.mockResolvedValue({
      id: eventId,
      state: 'SCHEDULED',
      sosTriggeredAt: null,
    });
    mockFindMany.mockResolvedValue([
      buildRegistration({
        shareMedicalInfo: false,
        allowOrganizerContact: false,
      }),
    ]);

    const [result] = await service.findByEvent(eventId);

    // Médicos: ocultos por completo.
    expect(result.eps).toBe('••••');
    expect(result.medicalInsurance).toBe('••••');
    expect(result.bloodType).toBe('••••');
    // Identidad/contacto: revelado parcial (primeros 4 visibles).
    expect(result.phone).toBe('3001******');
    expect(result.identificationNumber).toBe('1234**');
    expect(result.email).toBe('jane************');
    expect(result.emergencyContactPhone).toBe('3007******');
    // Los nombres y la ciudad nunca se enmascaran.
    expect(result.emergencyContactName).toBe('John Doe');
    expect(result.residenceCity).toBe('Bogotá');
  });

  it('reveals every sensitive field when all 4 conditions are favorable at once (QA 6B.1)', async () => {
    mockEventFindUnique.mockResolvedValue({
      id: eventId,
      state: 'IN_PROGRESS',
      sosTriggeredAt: new Date('2026-06-30T12:00:00.000Z'),
    });
    mockFindMany.mockResolvedValue([
      buildRegistration({
        shareMedicalInfo: true,
        allowOrganizerContact: true,
      }),
    ]);

    const [result] = await service.findByEvent(eventId);

    expect(result.eps).toBe('Sura');
    expect(result.medicalInsurance).toBe('PolizaX');
    expect(result.bloodType).toBe('O_POSITIVE');
    expect(result.phone).toBe('3001234567');
    expect(result.identificationNumber).toBe('123456');
    expect(result.email).toBe('jane@example.com');
    expect(result.residenceCity).toBe('Bogotá');
  });
});
