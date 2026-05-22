import 'reflect-metadata';

/**
 * Unit tests for iter-3 tracking methods in EventsService:
 * - startTracking (organizer guard + state check)
 * - endTracking (organizer guard + state check)
 * - getRouteGeoJson (null vs. GeoJSON)
 * - markSosTriggered (deduplication guard)
 * - getApprovedRegistrantUserIds
 * - markReminderSent + findEventsNeedingReminder
 */

// ── Mocks (must be declared before imports) ───────────────────────────────────

jest.mock('../config', () => ({
  envs: {
    port: 3002,
    usersMsPort: 3003,
    usersMsHost: 'localhost',
  },
  USERS_SERVICE: 'USERS_SERVICE',
}));

const mockFindUnique = jest.fn();
const mockUpdate = jest.fn();
const mockFindMany = jest.fn();
const mockFindFirst = jest.fn();
const mockConnect = jest.fn().mockResolvedValue(undefined);

jest.mock('../generated/prisma', () => ({
  PrismaClient: class {
    event = {
      findUnique: mockFindUnique,
      update: mockUpdate,
      findMany: mockFindMany,
    };
    eventRegistration = {
      findFirst: mockFindFirst,
      findMany: mockFindMany,
    };
    $connect = mockConnect;
    $transaction = jest.fn();
  },
}));

jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: jest.fn().mockImplementation(() => ({})),
}));

// ── Actual imports ─────────────────────────────────────────────────────────────

import { RpcException } from '@nestjs/microservices';
import { EventsService } from './events.service';

const mockClientProxy = { send: jest.fn() };

describe('EventsService — iter-3 tracking methods', () => {
  let service: EventsService;

  beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    jest.clearAllMocks();
    service = new EventsService(mockClientProxy as any);
  });

  // Helper: mock findOne to return a specific event shape
  function mockEventInDb(partial: Record<string, unknown>) {
    const base = {
      id: 'event-1',
      ownerId: 'user-organizer',
      name: 'Test Rodada',
      state: 'SCHEDULED',
      sosTriggeredAt: null,
      reminderSentAt: null,
      routeGeoJson: null,
    };
    mockFindUnique.mockResolvedValue({ ...base, ...partial });
    mockUpdate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...base, ...partial, ...data }),
    );
  }

  // ── startTracking ─────────────────────────────────────────────────────────────

  describe('startTracking', () => {
    it('TC-3-1: starts tracking when organizer + state=SCHEDULED', async () => {
      mockEventInDb({ state: 'SCHEDULED', ownerId: 'user-organizer' });

      const result = await service.startTracking('event-1', 'user-organizer');

      expect(result).toMatchObject({ id: 'event-1', state: 'IN_PROGRESS' });
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { state: 'IN_PROGRESS' } }),
      );
    });

    it('TC-3-2: throws 403 when caller is not the organizer', async () => {
      mockEventInDb({ state: 'SCHEDULED', ownerId: 'user-organizer' });

      await expect(service.startTracking('event-1', 'user-other')).rejects.toThrow(
        RpcException,
      );
    });

    it('TC-3-3: throws 409 when event state is not SCHEDULED', async () => {
      mockEventInDb({ state: 'IN_PROGRESS', ownerId: 'user-organizer' });

      await expect(
        service.startTracking('event-1', 'user-organizer'),
      ).rejects.toThrow(RpcException);
    });

    it('TC-3-4: throws 409 when event is already FINISHED', async () => {
      mockEventInDb({ state: 'FINISHED', ownerId: 'user-organizer' });

      await expect(
        service.startTracking('event-1', 'user-organizer'),
      ).rejects.toThrow(RpcException);
    });
  });

  // ── endTracking ───────────────────────────────────────────────────────────────

  describe('endTracking', () => {
    it('TC-3-5: ends tracking when organizer + state=IN_PROGRESS', async () => {
      mockEventInDb({ state: 'IN_PROGRESS', ownerId: 'user-organizer' });

      const result = await service.endTracking('event-1', 'user-organizer');

      expect(result).toMatchObject({ id: 'event-1', state: 'FINISHED' });
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { state: 'FINISHED' } }),
      );
    });

    it('TC-3-6: throws 403 when caller is not the organizer', async () => {
      mockEventInDb({ state: 'IN_PROGRESS', ownerId: 'user-organizer' });

      await expect(service.endTracking('event-1', 'user-other')).rejects.toThrow(
        RpcException,
      );
    });

    it('TC-3-7: throws 409 when event state is SCHEDULED (not IN_PROGRESS)', async () => {
      mockEventInDb({ state: 'SCHEDULED', ownerId: 'user-organizer' });

      await expect(
        service.endTracking('event-1', 'user-organizer'),
      ).rejects.toThrow(RpcException);
    });
  });

  // ── getRouteGeoJson ───────────────────────────────────────────────────────────

  describe('getRouteGeoJson', () => {
    it('TC-3-8: returns null when routeGeoJson is null', async () => {
      mockEventInDb({ routeGeoJson: null });

      const result = await service.getRouteGeoJson('event-1');

      expect(result).toBeNull();
    });

    it('TC-3-9: returns GeoJSON object when present', async () => {
      const geoJson = { type: 'LineString', coordinates: [[74.1, 4.7], [74.2, 4.8]] };
      mockEventInDb({ routeGeoJson: geoJson });

      const result = await service.getRouteGeoJson('event-1');

      expect(result).toEqual(geoJson);
    });
  });

  // ── markSosTriggered ──────────────────────────────────────────────────────────

  // ── findOneEventForViewer ─────────────────────────────────────────────────────

  describe('findOneEventForViewer', () => {
    it('TC-3-12: returns event when state is SCHEDULED (any viewer)', async () => {
      mockEventInDb({ state: 'SCHEDULED', ownerId: 'user-organizer' });

      const result = await service.findOneEventForViewer('event-1', 'user-other');

      expect(result).toMatchObject({ id: 'event-1', state: 'SCHEDULED' });
    });

    it('TC-3-13: returns draft event when viewer is the owner', async () => {
      mockEventInDb({ state: 'DRAFT', ownerId: 'user-organizer' });

      const result = await service.findOneEventForViewer('event-1', 'user-organizer');

      expect(result).toMatchObject({ id: 'event-1', state: 'DRAFT' });
    });

    it('TC-3-14: throws 404 when event is DRAFT and viewer is not the owner', async () => {
      mockEventInDb({ state: 'DRAFT', ownerId: 'user-organizer' });

      await expect(
        service.findOneEventForViewer('event-1', 'user-other'),
      ).rejects.toThrow(RpcException);
    });
  });

  // ── publishEvent ──────────────────────────────────────────────────────────────

  describe('publishEvent', () => {
    it('TC-3-15: transitions DRAFT → SCHEDULED when owner publishes', async () => {
      mockEventInDb({ state: 'DRAFT', ownerId: 'user-organizer' });

      const result = await service.publishEvent('event-1', 'user-organizer');

      expect(result).toMatchObject({ state: 'SCHEDULED' });
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { state: 'SCHEDULED' } }),
      );
    });

    it('TC-3-16: throws 403 when non-owner tries to publish', async () => {
      mockEventInDb({ state: 'DRAFT', ownerId: 'user-organizer' });

      await expect(
        service.publishEvent('event-1', 'user-other'),
      ).rejects.toThrow(RpcException);
    });

    it('TC-3-17: throws 409 when event is already SCHEDULED (not a draft)', async () => {
      mockEventInDb({ state: 'SCHEDULED', ownerId: 'user-organizer' });

      await expect(
        service.publishEvent('event-1', 'user-organizer'),
      ).rejects.toThrow(RpcException);
    });

    it('TC-3-18: throws 409 when event is IN_PROGRESS', async () => {
      mockEventInDb({ state: 'IN_PROGRESS', ownerId: 'user-organizer' });

      await expect(
        service.publishEvent('event-1', 'user-organizer'),
      ).rejects.toThrow(RpcException);
    });
  });

  describe('markSosTriggered', () => {
    it('TC-3-10: sets sosTriggeredAt and returns triggered=true on first SOS', async () => {
      mockEventInDb({ sosTriggeredAt: null });
      mockFindFirst.mockResolvedValue({
        fullName: 'Rider Uno',
        phone: '3001234567',
      });

      const result = await service.markSosTriggered('event-1', 'user-rider');

      expect(result.triggered).toBe(true);
      expect(result.fullName).toBe('Rider Uno');
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ sosTriggeredAt: expect.any(Date) }) }),
      );
    });

    it('TC-3-11: returns triggered=false when SOS already triggered (dedup)', async () => {
      mockEventInDb({ sosTriggeredAt: new Date('2026-05-15T10:00:00Z') });

      const result = await service.markSosTriggered('event-1', 'user-rider');

      expect(result.triggered).toBe(false);
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });
});
