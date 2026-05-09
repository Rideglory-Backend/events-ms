import { HttpStatus, Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import {
  EventState,
  RiderTrackingDto,
  TrackingSnapshotPayloadDto,
  TrackingStartSessionPayloadDto,
  TrackingStopSessionPayloadDto,
  TrackingUpdateLocationPayloadDto,
} from '@rideglory/contracts';
import { EventsService } from '../events/events.service';

type RiderPlain = Record<string, unknown>;

@Injectable()
export class TrackingService {
  private readonly ridersByEvent = new Map<string, Map<string, RiderTrackingDto>>();

  constructor(private readonly eventsService: EventsService) {}

  async startSession(payload: TrackingStartSessionPayloadDto) {
    const { eventId, rider, authUserId } = payload;
    if (rider.userId !== authUserId) {
      throw new RpcException({
        status: HttpStatus.FORBIDDEN,
        message: 'Cannot start tracking session for another user',
      });
    }

    const event = await this.eventsService.findOne(eventId);
    if (event.state !== EventState.IN_PROGRESS) {
      throw new RpcException({
        status: HttpStatus.CONFLICT,
        message: 'Live tracking is only available while the event is in progress',
      });
    }

    const room = this.getOrCreateRoom(eventId);
    const normalized = this.normalizeRider(rider);
    room.set(normalized.userId, normalized);
    return { ok: true as const };
  }

  async stopSession(payload: TrackingStopSessionPayloadDto) {
    const { eventId, userId, authUserId } = payload;
    if (userId !== authUserId) {
      throw new RpcException({
        status: HttpStatus.FORBIDDEN,
        message: 'Cannot stop tracking session for another user',
      });
    }

    await this.eventsService.findOne(eventId);
    const room = this.ridersByEvent.get(eventId);
    room?.delete(userId);
    if (room?.size === 0) {
      this.ridersByEvent.delete(eventId);
    }
    return { ok: true as const };
  }

  async snapshot(payload: TrackingSnapshotPayloadDto): Promise<RiderPlain[]> {
    await this.eventsService.findOne(payload.eventId);
    const room = this.ridersByEvent.get(payload.eventId);
    if (!room) {
      return [];
    }
    return [...room.values()].map((rider) => this.serializeRider(rider));
  }

  async updateLocation(
    payload: TrackingUpdateLocationPayloadDto,
  ): Promise<RiderPlain> {
    const { eventId, userId, authUserId } = payload;
    if (userId !== authUserId) {
      throw new RpcException({
        status: HttpStatus.FORBIDDEN,
        message: 'Cannot publish location for another user',
      });
    }

    const event = await this.eventsService.findOne(eventId);
    if (event.state !== EventState.IN_PROGRESS) {
      throw new RpcException({
        status: HttpStatus.CONFLICT,
        message: 'Live tracking is only available while the event is in progress',
      });
    }

    const room = this.ridersByEvent.get(eventId);
    const existing = room?.get(userId);
    if (!existing) {
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: 'Start a tracking session before sending location updates',
      });
    }

    const normalizedExisting = this.normalizeRider(existing);
    const updated: RiderTrackingDto = {
      ...normalizedExisting,
      latitude: payload.latitude,
      longitude: payload.longitude,
      speedKmh: payload.speedKmh,
      distanceMeters: payload.distanceMeters,
      batteryPercent: payload.batteryPercent,
      lastUpdated: new Date(),
    };
    room!.set(userId, updated);
    return this.serializeRider(updated);
  }

  removeRiderFromRoom(eventId: string, userId: string) {
    const room = this.ridersByEvent.get(eventId);
    if (!room) {
      return;
    }
    room.delete(userId);
    if (room.size === 0) {
      this.ridersByEvent.delete(eventId);
    }
  }

  private getOrCreateRoom(eventId: string): Map<string, RiderTrackingDto> {
    let room = this.ridersByEvent.get(eventId);
    if (!room) {
      room = new Map();
      this.ridersByEvent.set(eventId, room);
    }
    return room;
  }

  private normalizeRider(rider: RiderTrackingDto): RiderTrackingDto {
    const lastUpdated =
      rider.lastUpdated instanceof Date
        ? rider.lastUpdated
        : new Date(rider.lastUpdated as unknown as string | number);
    return {
      ...rider,
      lastUpdated,
    };
  }

  private serializeRider(rider: RiderTrackingDto): RiderPlain {
    return {
      userId: rider.userId,
      firstName: rider.firstName,
      lastName: rider.lastName,
      role: rider.role,
      latitude: rider.latitude,
      longitude: rider.longitude,
      speedKmh: rider.speedKmh,
      distanceMeters: rider.distanceMeters,
      batteryPercent: rider.batteryPercent,
      isActive: rider.isActive,
      deviceLabel: rider.deviceLabel,
      lastUpdated: rider.lastUpdated.toISOString(),
    };
  }
}
