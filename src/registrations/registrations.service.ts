import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import {
  BloodType,
  CreateRegistrationPayloadDto,
  RegistrationStatus,
  UpdateRegistrationDto,
} from '@rideglory/contracts';
import { PrismaPg } from '@prisma/adapter-pg';
import { firstValueFrom, timeout } from 'rxjs';
import { PrismaClient } from '../generated/prisma';
import { USERS_SERVICE, VEHICLES_SERVICE } from '../config';

type VehicleSummary = {
  id: string;
  brand?: string | null;
  model?: string | null;
  licensePlate?: string | null;
  vin?: string | null;
};

@Injectable()
export class RegistrationsService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger('Registrations Service');

  constructor(
    @Inject(USERS_SERVICE) private readonly usersService: ClientProxy,
    @Inject(VEHICLES_SERVICE) private readonly vehiclesService: ClientProxy,
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

  async onModuleInit() {
    await this.$connect();
  }

  async create(payload: CreateRegistrationPayloadDto) {
    const { eventId, userId, saveToProfile, ...data } = payload;

    const event = await this.ensureEventExists(eventId);
    if (event.ownerId === userId) {
      throw new RpcException({
        status: HttpStatus.FORBIDDEN,
        message:
          'OWNER_CANNOT_REGISTER_MANUALLY: The event organizer is already registered automatically.',
      });
    }
    await this.ensureUserHasNoActiveRegistration(eventId, userId);
    this.ensureVehicleIdForNonOwner(data.vehicleId, event.ownerId, userId);
    await this.validateAllowedBrands(event, data.vehicleId);

    if (saveToProfile) {
      await this.persistRiderProfile(userId, payload).catch((error) =>
        this.logger.warn(
          `saveToProfile failed for user ${userId}: ${this.describeError(error)}`,
        ),
      );
    }

    const createdRegistration = await this.eventRegistration.create({
      data: {
        eventId,
        userId,
        status: RegistrationStatus.PENDING,
        fullName: data.fullName,
        identificationNumber: data.identificationNumber,
        birthDate: data.birthDate,
        phone: data.phone,
        email: data.email,
        residenceCity: data.residenceCity,
        eps: data.eps,
        medicalInsurance: data.medicalInsurance ?? null,
        bloodType: data.bloodType,
        emergencyContactName: data.emergencyContactName,
        emergencyContactPhone: data.emergencyContactPhone,
        vehicleId: data.vehicleId,
      },
    });

    return this.enrichRegistrationWithVehicle(createdRegistration);
  }

  async update(
    registrationId: string,
    userId: string,
    data: UpdateRegistrationDto,
  ) {
    const existing = await this.findRegistrationOrThrow(registrationId);

    if (existing.userId !== userId) {
      throw new RpcException({
        status: HttpStatus.FORBIDDEN,
        message: 'You cannot update a registration that does not belong to you',
      });
    }

    const event = await this.ensureEventExists(existing.eventId);
    const isEventOwner = event.ownerId === existing.userId;

    if (data.saveToProfile) {
      await this.persistRiderProfile(userId, {
        fullName: data.fullName ?? existing.fullName,
        identificationNumber:
          data.identificationNumber ?? existing.identificationNumber,
        birthDate: data.birthDate ?? existing.birthDate,
        phone: data.phone ?? existing.phone,
        residenceCity: data.residenceCity ?? existing.residenceCity,
        eps: data.eps ?? existing.eps,
        medicalInsurance:
          data.medicalInsurance ?? existing.medicalInsurance ?? undefined,
        bloodType: (data.bloodType ?? existing.bloodType) as BloodType,
        emergencyContactName:
          data.emergencyContactName ?? existing.emergencyContactName,
        emergencyContactPhone:
          data.emergencyContactPhone ?? existing.emergencyContactPhone,
      }).catch((error) =>
        this.logger.warn(
          `saveToProfile failed for user ${userId}: ${this.describeError(error)}`,
        ),
      );
    }

    const { saveToProfile, ...rest } = data;

    const nextStatus = isEventOwner
      ? RegistrationStatus.APPROVED
      : RegistrationStatus.PENDING;

    this.ensureVehicleIdForNonOwner(
      rest.vehicleId ?? existing.vehicleId,
      event.ownerId,
      userId,
    );
    await this.validateAllowedBrands(event, rest.vehicleId ?? existing.vehicleId);

    const updatedRegistration = await this.eventRegistration.update({
      where: { id: registrationId },
      data: {
        ...rest,
        status: nextStatus,
        medicalInsurance: rest.medicalInsurance ?? null,
      },
    });

    return this.enrichRegistrationWithVehicle(updatedRegistration);
  }

  async cancel(registrationId: string, userId: string) {
    const existing = await this.findRegistrationOrThrow(registrationId);
    if (existing.userId !== userId) {
      throw new RpcException({
        status: HttpStatus.FORBIDDEN,
        message: 'You cannot cancel a registration that does not belong to you',
      });
    }

    const event = await this.ensureEventExists(existing.eventId);
    if (event.ownerId === existing.userId) {
      throw new RpcException({
        status: HttpStatus.FORBIDDEN,
        message:
          'OWNER_REGISTRATION_NOT_CANCELLABLE: The organizer cannot cancel their own attendance registration.',
      });
    }

    const cancelledRegistration = await this.eventRegistration.update({
      where: { id: registrationId },
      data: { status: RegistrationStatus.CANCELLED },
    });

    return this.enrichRegistrationWithVehicle(cancelledRegistration);
  }

  approve(registrationId: string) {
    return this.changeStatus(registrationId, RegistrationStatus.APPROVED);
  }

  reject(registrationId: string) {
    return this.changeStatus(registrationId, RegistrationStatus.REJECTED);
  }

  setReadyForEdit(registrationId: string) {
    return this.changeStatus(registrationId, RegistrationStatus.READY_FOR_EDIT);
  }

  async findByEvent(eventId: string) {
    await this.ensureEventExists(eventId);

    const registrations = await this.eventRegistration.findMany({
      where: { eventId },
      orderBy: { createdAt: 'asc' },
    });

    return this.enrichRegistrationsWithVehicle(registrations);
  }

  async findMyRegistrationForEvent(eventId: string, userId: string) {
    const registration = await this.eventRegistration.findFirst({
      where: { eventId, userId },
      orderBy: { createdAt: 'desc' },
    });

    if (!registration) {
      return null;
    }

    return this.enrichRegistrationWithVehicle(registration);
  }

  async findMyRegistrations(userId: string) {
    const registrations = await this.eventRegistration.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return this.enrichRegistrationsWithVehicle(registrations);
  }

  private async changeStatus(
    registrationId: string,
    status: RegistrationStatus,
  ) {
    const registration = await this.findRegistrationOrThrow(registrationId);
    const event = await this.ensureEventExists(registration.eventId);

    if (
      event.ownerId === registration.userId &&
      status === RegistrationStatus.REJECTED
    ) {
      throw new RpcException({
        status: HttpStatus.FORBIDDEN,
        message:
          'OWNER_REGISTRATION_NOT_REJECTABLE: The organizer registration cannot be rejected.',
      });
    }

    const updatedRegistration = await this.eventRegistration.update({
      where: { id: registrationId },
      data: { status },
    });

    return this.enrichRegistrationWithVehicle(updatedRegistration);
  }

  private async findRegistrationOrThrow(registrationId: string) {
    const registration = await this.eventRegistration.findUnique({
      where: { id: registrationId },
    });

    if (!registration) {
      throw new RpcException({
        status: HttpStatus.NOT_FOUND,
        message: `Registration with id ${registrationId} not found`,
      });
    }

    return registration;
  }

  private async ensureEventExists(eventId: string) {
    const event = await this.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new RpcException({
        status: HttpStatus.NOT_FOUND,
        message: `Event with id ${eventId} not found`,
      });
    }
    return event;
  }

  private async ensureUserHasNoActiveRegistration(
    eventId: string,
    userId: string,
  ) {
    const existing = await this.eventRegistration.findFirst({
      where: {
        eventId,
        userId,
        status: { not: RegistrationStatus.CANCELLED },
      },
    });

    if (existing) {
      throw new RpcException({
        status: HttpStatus.CONFLICT,
        message: 'You already have an active registration for this event',
      });
    }
  }

  private async persistRiderProfile(
    userId: string,
    rider: Pick<
      CreateRegistrationPayloadDto,
      | 'fullName'
      | 'identificationNumber'
      | 'birthDate'
      | 'phone'
      | 'residenceCity'
      | 'eps'
      | 'medicalInsurance'
      | 'bloodType'
      | 'emergencyContactName'
      | 'emergencyContactPhone'
    >,
  ) {
    await firstValueFrom(
      this.usersService
        .send('updateUser', {
          id: userId,
          fullName: rider.fullName,
          identificationNumber: rider.identificationNumber,
          birthDate: rider.birthDate,
          phone: rider.phone,
          residenceCity: rider.residenceCity,
          eps: rider.eps,
          medicalInsurance: rider.medicalInsurance ?? undefined,
          bloodType: rider.bloodType,
          emergencyContactName: rider.emergencyContactName,
          emergencyContactPhone: rider.emergencyContactPhone,
        })
        .pipe(timeout(3000)),
    );
  }

  private describeError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return JSON.stringify(error);
  }

  private ensureVehicleIdForNonOwner(
    vehicleId: string | null | undefined,
    eventOwnerId: string,
    userId: string,
  ) {
    if (eventOwnerId !== userId && !vehicleId) {
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: 'VEHICLE_REQUIRED: vehicleId is required for non-owner registrations.',
      });
    }
  }

  private async validateAllowedBrands(
    event: { allowedBrands: string[] },
    vehicleId: string | null | undefined,
  ) {
    if (!vehicleId) {
      return;
    }

    const vehicle = await this.fetchVehicleById(vehicleId);
    if (!vehicle) {
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: `Vehicle with id ${vehicleId} was not found.`,
      });
    }

    const normalizedAllowedBrands = event.allowedBrands
      .map((brand) => brand.trim().toLowerCase())
      .filter((brand) => brand.length > 0 && brand !== '*');

    if (normalizedAllowedBrands.length === 0) {
      return;
    }

    const vehicleBrand = (vehicle.brand ?? '').trim().toLowerCase();
    if (vehicleBrand && normalizedAllowedBrands.includes(vehicleBrand)) {
      return;
    }

    throw new RpcException({
      status: HttpStatus.BAD_REQUEST,
      message: `VEHICLE_BRAND_NOT_ALLOWED: Allowed brands are ${event.allowedBrands.join(', ')}`,
    });
  }

  private async fetchVehicleById(vehicleId: string): Promise<VehicleSummary | null> {
    try {
      return await firstValueFrom(
        this.vehiclesService
          .send('getVehicleById', { vehicleId })
          .pipe(timeout(3000)),
      );
    } catch (error) {
      this.logger.warn(
        `Unable to fetch vehicle ${vehicleId} from vehicles-ms: ${this.describeError(error)}`,
      );
      return null;
    }
  }

  private enrichRegistrationWithVehicle<T extends { vehicleId: string | null }>(
    registration: T,
  ): Promise<T & { vehicleSummary: VehicleSummary | null }> {
    return this.buildVehicleSummary(registration);
  }

  private async enrichRegistrationsWithVehicle<T extends { vehicleId: string | null }>(
    registrations: T[],
  ): Promise<Array<T & { vehicleSummary: VehicleSummary | null }>> {
    return Promise.all(registrations.map((registration) => this.buildVehicleSummary(registration)));
  }

  private async buildVehicleSummary<T extends { vehicleId: string | null }>(
    registration: T,
  ): Promise<T & { vehicleSummary: VehicleSummary | null }> {
    if (!registration.vehicleId) {
      return { ...registration, vehicleSummary: null };
    }

    const vehicle = await this.fetchVehicleById(registration.vehicleId);
    return { ...registration, vehicleSummary: vehicle };
  }
}
