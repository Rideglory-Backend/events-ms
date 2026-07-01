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
const mockFindUnique = jest.fn();
const mockUpdate = jest.fn();
const mockTransaction = jest.fn();
const mockConnect = jest.fn().mockResolvedValue(undefined);

jest.mock('../generated/prisma', () => ({
  PrismaClient: class {
    event = {
      findMany: mockFindMany,
      findUnique: mockFindUnique,
      update: mockUpdate,
    };
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
import { EventState, EventType } from '@rideglory/contracts';
import { EventsService } from './events.service';

// Stub ClientProxy for USERS_SERVICE injection
const mockClientProxy = { send: jest.fn() };

describe('EventsService — filter logic', () => {
  let service: EventsService;

  beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    mockFindMany.mockReset();
    mockFindMany.mockResolvedValue([]);
    mockFindUnique.mockReset();
    mockUpdate.mockReset();

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
  // findUpcoming — updated to match current implementation
  // (Two findMany calls: first for IN_PROGRESS active events [only when
  //  authUserId provided], second for SCHEDULED upcoming events)
  // ----------------------------------------------------------------

  it('TC-6: findUpcoming no filters — uses midnight today as gte baseline, excludes DRAFT/IN_PROGRESS/FINISHED', async () => {
    await service.findUpcoming({}, 5);

    // Without authUserId, only the scheduledEvents findMany is called
    expect(mockFindMany).toHaveBeenCalledTimes(1);
    const callArg = mockFindMany.mock.calls[0][0];
    const usedDate: Date = callArg.where.startDate.gte;

    // The service uses midnight UTC today (toISOString().substring(0,10))
    const expectedMidnight = new Date(
      new Date().toISOString().substring(0, 10),
    );
    expect(usedDate.getTime()).toBe(expectedMidnight.getTime());
    expect(callArg.take).toBe(5);
    expect(callArg.where.state).toEqual({
      notIn: ['DRAFT', 'IN_PROGRESS', 'FINISHED'],
    });
  });

  it('TC-7: findUpcoming with type filter — eventType present in WHERE, state excludes DRAFT/IN_PROGRESS/FINISHED', async () => {
    await service.findUpcoming({ type: EventType.LEISURE }, 10);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          state: { notIn: ['DRAFT', 'IN_PROGRESS', 'FINISHED'] },
          eventType: EventType.LEISURE,
        }),
        take: 10,
      }),
    );
  });

  it('TC-8: findUpcoming with dateFrom override — uses provided dateFrom instead of now, state excludes DRAFT/IN_PROGRESS/FINISHED', async () => {
    const dateFrom = '2026-07-01T00:00:00.000Z';
    await service.findUpcoming({ dateFrom }, 5);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          state: { notIn: ['DRAFT', 'IN_PROGRESS', 'FINISHED'] },
          startDate: { gte: new Date(dateFrom) },
        }),
      }),
    );
  });
});

// ----------------------------------------------------------------
// findActiveEventsOlderThan
// ----------------------------------------------------------------

describe('EventsService — findActiveEventsOlderThan', () => {
  let service: EventsService;

  beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    mockFindMany.mockReset();
    mockFindMany.mockResolvedValue([]);
    mockFindUnique.mockReset();
    mockUpdate.mockReset();

    service = new EventsService(mockClientProxy as any);
  });

  it('queries only IN_PROGRESS events with startDate lte the cutoff', async () => {
    const cutoff = new Date('2026-06-29T00:00:00.000Z');
    mockFindMany.mockResolvedValue([{ id: 'evt-1' }]);

    const result = await service.findActiveEventsOlderThan(cutoff);

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        state: EventState.IN_PROGRESS,
        startDate: { lte: cutoff },
      },
      select: { id: true },
    });
    expect(result).toEqual([{ id: 'evt-1' }]);
  });

  it('returns empty array when no stalled events found', async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await service.findActiveEventsOlderThan(new Date());
    expect(result).toEqual([]);
  });

  it('does NOT include FINISHED events (Prisma lte on null startDate is excluded automatically)', async () => {
    const cutoff = new Date();
    await service.findActiveEventsOlderThan(cutoff);

    const callArg = mockFindMany.mock.calls[0][0];
    // State must be strictly IN_PROGRESS; FINISHED is never in scope
    expect(callArg.where.state).toBe(EventState.IN_PROGRESS);
  });

  it('AC2 explicit exclusion — a 23h-old event has startDate AFTER the 24h cutoff and is excluded by the lte clause', async () => {
    const cutoff = new Date(Date.now() - 24 * 60 * 60_000);
    const event23hOldStartDate = new Date(Date.now() - 23 * 60 * 60_000);

    // Prisma would return [] because event23hOldStartDate > cutoff (not lte)
    mockFindMany.mockResolvedValue([]);

    const result = await service.findActiveEventsOlderThan(cutoff);

    // Verify the query passes the correct cutoff
    const callArg = mockFindMany.mock.calls[0][0] as {
      where: { startDate: { lte: Date } };
    };
    expect(callArg.where.startDate.lte).toEqual(cutoff);

    // Prove mathematically that a 23h-old event is outside the window:
    // its startDate is AFTER the cutoff, so Prisma's lte condition is false.
    expect(event23hOldStartDate.getTime()).toBeGreaterThan(cutoff.getTime());
    expect(result).toEqual([]);
  });
});

// ----------------------------------------------------------------
// forceEndTracking
// ----------------------------------------------------------------

describe('EventsService — forceEndTracking', () => {
  let service: EventsService;

  beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    mockFindMany.mockReset();
    mockFindUnique.mockReset();
    mockUpdate.mockReset();

    service = new EventsService(mockClientProxy as any);
  });

  it('transitions IN_PROGRESS event to FINISHED and returns updated state', async () => {
    const eventId = 'evt-active';
    mockFindUnique.mockResolvedValue({
      id: eventId,
      state: EventState.IN_PROGRESS,
    });
    mockUpdate.mockResolvedValue({ id: eventId, state: EventState.FINISHED });

    const result = await service.forceEndTracking(eventId);

    expect(mockFindUnique).toHaveBeenCalledWith({ where: { id: eventId } });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: eventId },
      data: { state: EventState.FINISHED },
    });
    expect(result).toEqual({ id: eventId, state: EventState.FINISHED });
  });

  it('is idempotent — returns current state without calling update when event is already FINISHED', async () => {
    const eventId = 'evt-done';
    mockFindUnique.mockResolvedValue({
      id: eventId,
      state: EventState.FINISHED,
    });

    const result = await service.forceEndTracking(eventId);

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(result).toEqual({ id: eventId, state: EventState.FINISHED });
  });

  it('returns UNKNOWN state when event does not exist, without calling update', async () => {
    const eventId = 'evt-missing';
    mockFindUnique.mockResolvedValue(null);

    const result = await service.forceEndTracking(eventId);

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(result).toEqual({ id: eventId, state: 'UNKNOWN' });
  });
});
