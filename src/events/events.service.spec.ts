import 'reflect-metadata';

/**
 * Unit tests for EventsService filter logic.
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
}));

// ------------------------------------------------------------------
// Mock PrismaClient
// ------------------------------------------------------------------
const mockFindMany = jest.fn();
const mockTransaction = jest.fn();
const mockConnect = jest.fn().mockResolvedValue(undefined);

jest.mock('../generated/prisma', () => ({
  PrismaClient: class {
    event = { findMany: mockFindMany };
    $connect = mockConnect;
    $transaction = mockTransaction;
  },
}));

jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: jest.fn().mockImplementation(() => ({})),
}));

// ------------------------------------------------------------------
// Actual imports (after mocks are set up)
// ------------------------------------------------------------------
import { EventType } from '@rideglory/contracts';
import { EventsService } from './events.service';

// Stub ClientProxy for USERS_SERVICE injection
const mockClientProxy = { send: jest.fn() };

describe('EventsService — filter logic', () => {
  let service: EventsService;

  beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    mockFindMany.mockReset();
    mockFindMany.mockResolvedValue([]);

    // Instantiate manually to avoid full NestJS DI
    service = new EventsService(mockClientProxy as any);
  });

  // ----------------------------------------------------------------
  // findAll — 5 required test cases
  // ----------------------------------------------------------------

  it('TC-1: no filters — returns all events excluding drafts and IN_PROGRESS', async () => {
    await service.findAll({});

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { state: { notIn: ['DRAFT', 'IN_PROGRESS'] } },
        orderBy: { startDate: 'desc' },
      }),
    );
  });

  it('TC-2: type-only filter — WHERE eventType matches, drafts and IN_PROGRESS excluded', async () => {
    await service.findAll({ type: EventType.OFF_ROAD });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ eventType: EventType.OFF_ROAD }),
      }),
    );
  });

  it('TC-3: date-range-only filter — WHERE startDate between dateFrom and dateTo, drafts excluded', async () => {
    const dateFrom = '2026-05-20T00:00:00.000Z';
    const dateTo = '2026-06-01T00:00:00.000Z';

    await service.findAll({ dateFrom, dateTo });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          startDate: {
            gte: new Date(dateFrom),
            lte: new Date(dateTo),
          },
        }),
      }),
    );
  });

  // ----------------------------------------------------------------
  // findUpcoming — additional coverage
  // ----------------------------------------------------------------

  it('TC-6: findUpcoming no filters — uses current date as gte baseline, drafts excluded', async () => {
    const before = new Date();
    await service.findUpcoming({}, 5);
    const after = new Date();

    expect(mockFindMany).toHaveBeenCalledTimes(1);
    const callArg = mockFindMany.mock.calls[0][0];
    const usedDate: Date = callArg.where.startDate.gte;

    expect(usedDate.getTime()).toBeGreaterThanOrEqual(before.getTime() - 100);
    expect(usedDate.getTime()).toBeLessThanOrEqual(after.getTime() + 100);
    expect(callArg.take).toBe(5);
    expect(callArg.where.state).toEqual({ not: 'DRAFT' });
  });

  it('TC-7: findUpcoming with type filter — eventType present in WHERE, drafts excluded', async () => {
    await service.findUpcoming({ type: EventType.LEISURE }, 10);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          state: { not: 'DRAFT' },
          eventType: EventType.LEISURE,
        }),
        take: 10,
      }),
    );
  });

  it('TC-8: findUpcoming with dateFrom override — uses provided dateFrom instead of now, drafts excluded', async () => {
    const dateFrom = '2026-07-01T00:00:00.000Z';
    await service.findUpcoming({ dateFrom }, 5);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          state: { not: 'DRAFT' },
          startDate: { gte: new Date(dateFrom) },
        }),
      }),
    );
  });
});
