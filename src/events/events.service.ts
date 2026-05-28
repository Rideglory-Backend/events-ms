import { HttpStatus, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CreateEventDto, EventFilterDto, FindAllEventsPayloadDto, EventState, RegistrationStatus, UpdateEventDto } from '@rideglory/contracts';
import { Prisma, PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { USERS_SERVICE } from '../config';
import {
  buildOwnerAutoRegistrationCreate,
  type OwnerProfileForRegistration,
} from './owner-auto-registration';

@Injectable()
export class EventsService extends PrismaClient implements OnModuleInit {
  private logger = new Logger('Events Service')

  constructor(
    @Inject(USERS_SERVICE) private readonly usersService: ClientProxy,
  ) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL is not set');
    }
    super({
      adapter: new PrismaPg({ connectionString: url }),
    });


    this.logger.log('Database connected');
  }

  private async validateOwnerExists(ownerId: string) {
    try {
      await firstValueFrom(
        this.usersService.send('findOneUser', { id: ownerId }).pipe(timeout(3000)),
      );
    } catch {
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: `Owner user with id ${ownerId} does not exist`,
      });
    }
  }

  private async fetchOwnerName(ownerId: string): Promise<string | null> {
    try {
      const owner = (await firstValueFrom(
        this.usersService.send('findOneUser', { id: ownerId }).pipe(timeout(3000)),
      )) as { fullName?: string | null } | null;
      return owner?.fullName ?? null;
    } catch (error) {
      this.logger.warn(`Failed to resolve ownerName for ${ownerId}: ${String(error)}`);
      return null;
    }
  }

  private async withOwnerName<T extends { ownerId: string }>(
    event: T,
  ): Promise<T & { ownerName: string | null }> {
    const ownerName = await this.fetchOwnerName(event.ownerId);
    return { ...event, ownerName };
  }

  private async withOwnerNames<T extends { ownerId: string }>(
    events: T[],
  ): Promise<Array<T & { ownerName: string | null }>> {
    const uniqueOwnerIds = Array.from(new Set(events.map((event) => event.ownerId)));
    const ownerNameById = new Map<string, string | null>();
    await Promise.all(
      uniqueOwnerIds.map(async (ownerId) => {
        ownerNameById.set(ownerId, await this.fetchOwnerName(ownerId));
      }),
    );
    return events.map((event) => ({
      ...event,
      ownerName: ownerNameById.get(event.ownerId) ?? null,
    }));
  }

  async onModuleInit() {
    await this.$connect();
  }

  async create(createEventDto: CreateEventDto) {
    let ownerProfile: OwnerProfileForRegistration;
    try {
      ownerProfile = (await firstValueFrom(
        this.usersService
          .send('findOneUser', { id: createEventDto.ownerId })
          .pipe(timeout(3000)),
      )) as OwnerProfileForRegistration;
    } catch {
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: `Owner user with id ${createEventDto.ownerId} does not exist`,
      });
    }

    const ownerRegistrationFields = buildOwnerAutoRegistrationCreate(
      createEventDto.ownerId,
      ownerProfile,
    );

    const { routeGeoJson, ...rest } = createEventDto;

    const created = await this.$transaction(async (tx) => {
      return tx.event.create({
        data: {
          ...rest,
          ...(routeGeoJson !== undefined && {
            routeGeoJson: routeGeoJson as Prisma.InputJsonValue,
          }),
          registrations: {
            create: {
              userId: createEventDto.ownerId,
              status: RegistrationStatus.APPROVED,
              ...ownerRegistrationFields,
            },
          },
        },
      });
    });

    return {
      ...created,
      ownerName: ownerProfile?.fullName ?? null,
    };
  }

  async findAll(filters: FindAllEventsPayloadDto = {}) {
    const { type, dateFrom, dateTo, city, authUserId } = filters;
    const startDateFilter =
      dateFrom || dateTo
        ? {
            ...(dateFrom && { gte: new Date(dateFrom) }),
            ...(dateTo && { lte: new Date(dateTo) }),
          }
        : undefined;

    // Eventos IN_PROGRESS solo son visibles para el owner o usuarios con inscripción aprobada.
    // En todos los casos se excluyen los DRAFTs del listado general.
    // SQL resultante con authUserId:
    //   WHERE (state NOT IN ('DRAFT','IN_PROGRESS'))
    //      OR (state = 'IN_PROGRESS' AND (ownerId = ? OR registrations.some(userId=?, status=APPROVED)))
    const inProgressVisibilityClause = authUserId
      ? {
          OR: [
            // Eventos visibles para todos: no DRAFT y no IN_PROGRESS
            { state: { notIn: [EventState.DRAFT, EventState.IN_PROGRESS] } },
            // Eventos IN_PROGRESS solo para owner o inscrito aprobado
            {
              state: EventState.IN_PROGRESS,
              OR: [
                { ownerId: authUserId },
                {
                  registrations: {
                    some: {
                      userId: authUserId,
                      status: RegistrationStatus.APPROVED,
                    },
                  },
                },
              ],
            },
          ],
        }
      : { state: { notIn: [EventState.DRAFT, EventState.IN_PROGRESS] } };

    const events = await this.event.findMany({
      where: {
        ...inProgressVisibilityClause,
        ...(type && { eventType: type }),
        ...(city && { city: { contains: city, mode: 'insensitive' } }),
        ...(startDateFilter && { startDate: startDateFilter }),
      },
      orderBy: { startDate: 'asc' },
    });
    return this.withOwnerNames(events);
  }

  async findByOwnerId(ownerId: string) {
    const events = await this.event.findMany({
      where: { ownerId },
      orderBy: { startDate: 'asc' },
    });
    return this.withOwnerNames(events);
  }

  async findUpcoming(filters: EventFilterDto = {}, limit = 5) {
    const { type, dateFrom, dateTo, city } = filters;
    const events = await this.event.findMany({
      where: {
        state: { not: EventState.DRAFT },
        startDate: {
          gte: dateFrom ? new Date(dateFrom) : new Date(),
          ...(dateTo && { lte: new Date(dateTo) }),
        },
        ...(type && { eventType: type }),
        ...(city && { city: { contains: city, mode: 'insensitive' } }),
      },
      orderBy: { startDate: 'asc' },
      take: limit,
    });
    return this.withOwnerNames(events);
  }

  async findOne(id: string) {
    const event = await this.event.findUnique({
      where: { id }
    });

    if (!event) {
      throw new RpcException({
        status: HttpStatus.NOT_FOUND,
        message: `Event with id ${id} not found`
      });
    }

    return event;
  }

  async findOneEnriched(id: string) {
    const event = await this.findOne(id);
    return this.withOwnerName(event);
  }

  async findOneEventForViewer(id: string, authUserId: string) {
    const event = await this.findOne(id);
    if (event.state === EventState.DRAFT && event.ownerId !== authUserId) {
      throw new RpcException({
        status: HttpStatus.NOT_FOUND,
        message: `Event with id ${id} not found`,
      });
    }
    return this.withOwnerName(event);
  }

  async publishEvent(id: string, ownerId: string) {
    const event = await this.findOne(id);
    if (event.ownerId !== ownerId) {
      throw new RpcException({
        status: HttpStatus.FORBIDDEN,
        message: 'Only the event organizer can publish this event',
      });
    }
    if (event.state !== EventState.DRAFT) {
      throw new RpcException({
        status: HttpStatus.CONFLICT,
        message: `Cannot publish: event state is ${event.state}, expected DRAFT`,
      });
    }
    const updated = await this.event.update({
      where: { id },
      data: { state: EventState.SCHEDULED },
    });
    return this.withOwnerName(updated);
  }

  async update(id: string, updateEventDto: UpdateEventDto) {
    if (updateEventDto.ownerId) {
      await this.validateOwnerExists(updateEventDto.ownerId);
    }

    await this.findOne(id);

    const { routeGeoJson, ...restUpdate } = updateEventDto;

    const updated = await this.event.update({
      where: { id },
      data: {
        ...restUpdate,
        ...(routeGeoJson !== undefined && {
          routeGeoJson: routeGeoJson as Prisma.InputJsonValue,
        }),
      },
    });
    return this.withOwnerName(updated);
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.event.delete({
      where: { id },
    });
  }

  // ── Tracking organizer controls ───────────────────────────────────────────────

  async startTracking(eventId: string, authUserId: string): Promise<{ id: string; state: string }> {
    const event = await this.findOne(eventId);

    if (event.ownerId !== authUserId) {
      throw new RpcException({
        status: HttpStatus.FORBIDDEN,
        message: 'Only the event organizer can start tracking',
      });
    }

    if (event.state !== EventState.SCHEDULED) {
      throw new RpcException({
        status: HttpStatus.CONFLICT,
        message: `Cannot start tracking: event state is ${event.state}, expected SCHEDULED`,
      });
    }

    const updated = await this.event.update({
      where: { id: eventId },
      data: { state: EventState.IN_PROGRESS },
    });

    return { id: updated.id, state: updated.state };
  }

  async endTracking(eventId: string, authUserId: string): Promise<{ id: string; state: string }> {
    const event = await this.findOne(eventId);

    if (event.ownerId !== authUserId) {
      throw new RpcException({
        status: HttpStatus.FORBIDDEN,
        message: 'Only the event organizer can end tracking',
      });
    }

    if (event.state !== EventState.IN_PROGRESS) {
      throw new RpcException({
        status: HttpStatus.CONFLICT,
        message: `Cannot end tracking: event state is ${event.state}, expected IN_PROGRESS`,
      });
    }

    const updated = await this.event.update({
      where: { id: eventId },
      data: { state: EventState.FINISHED },
    });

    return { id: updated.id, state: updated.state };
  }

  async getRouteGeoJson(eventId: string): Promise<object | null> {
    const event = await this.findOne(eventId);
    if (!event.routeGeoJson) {
      return null;
    }
    return event.routeGeoJson as object;
  }

  async markSosTriggered(
    eventId: string,
    userId: string,
  ): Promise<{
    triggered: boolean;
    fullName: string;
    phone?: string | null;
    latitude: number | null;
    longitude: number | null;
  }> {
    const event = await this.findOne(eventId);

    // Deduplication: if already triggered, no-op
    if (event.sosTriggeredAt !== null) {
      return { triggered: false, fullName: '', phone: null, latitude: null, longitude: null };
    }

    await this.event.update({
      where: { id: eventId },
      data: { sosTriggeredAt: new Date() },
    });

    // Fetch rider info from registrations
    const registration = await this.eventRegistration.findFirst({
      where: { eventId, userId },
    });

    return {
      triggered: true,
      fullName: registration?.fullName ?? userId,
      phone: registration?.phone ?? null,
      latitude: null, // Location comes from WS room state in gateway
      longitude: null,
    };
  }

  async getApprovedRegistrantUserIds(eventId: string): Promise<string[]> {
    const registrations = await this.eventRegistration.findMany({
      where: { eventId, status: RegistrationStatus.APPROVED },
      select: { userId: true },
    });
    return registrations.map((r) => r.userId);
  }

  async markReminderSent(eventId: string): Promise<void> {
    await this.event.update({
      where: { id: eventId },
      data: { reminderSentAt: new Date() },
    });
  }

  async findEventsNeedingReminder(fromDate: Date, toDate: Date): Promise<Array<{ id: string; name: string }>> {
    return this.event.findMany({
      where: {
        startDate: { gte: fromDate, lte: toDate },
        state: EventState.SCHEDULED,
        reminderSentAt: null,
      },
      select: { id: true, name: true },
    });
  }
}
