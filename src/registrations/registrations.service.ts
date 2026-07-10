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
import { EventState, PrismaClient } from '../generated/prisma';
import { USERS_SERVICE, VEHICLES_SERVICE } from '../config';

type VehicleSummary = {
  id: string;
  brand?: string | null;
  model?: string | null;
  licensePlate?: string | null;
  vin?: string | null;
};

/** Máscara total para datos completamente ocultos. */
const FULL_MASK = '••••';
/** Cantidad de caracteres iniciales visibles en un revelado parcial. */
const PARTIAL_VISIBLE = 4;
/**
 * Nombre que reemplaza `fullName` cuando el usuario elimina su cuenta. Es un
 * mecanismo de anonimización permanente, distinto e independiente de
 * `FULL_MASK` (enmascarado reversible en runtime según `shareMedicalInfo`).
 */
const ANONYMIZED_FULL_NAME = 'Usuario eliminado';

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
    this.ensureRiderIsAdult(data.birthDate);
    this.ensureVehicleIdForNonOwner(data.vehicleId, event.ownerId, userId);
    await this.validateAllowedBrands(event, data.vehicleId);

    if (saveToProfile) {
      await this.persistRiderProfile(userId, payload).catch((error) =>
        this.logger.warn(
          `saveToProfile failed for user ${userId}: ${this.describeError(error)}`,
        ),
      );
    }

    const registrationData = {
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
      shareMedicalInfo: data.shareMedicalInfo ?? false,
      allowOrganizerContact: data.allowOrganizerContact ?? false,
      riskAcceptedAt: data.riskAcceptedAt ?? null,
      riskAcceptanceVersion: data.riskAcceptanceVersion ?? null,
      medicalConsentAcceptedAt: data.medicalConsentAcceptedAt ?? null,
      medicalConsentVersion: data.medicalConsentVersion ?? null,
    };

    const createdRegistration = await this.eventRegistration.upsert({
      where: { eventId_userId: { eventId, userId } },
      create: { eventId, userId, ...registrationData },
      update: registrationData,
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
          data.identificationNumber ?? existing.identificationNumber ?? undefined,
        birthDate: data.birthDate ?? existing.birthDate ?? undefined,
        phone: data.phone ?? existing.phone ?? undefined,
        residenceCity: data.residenceCity ?? existing.residenceCity ?? undefined,
        eps: data.eps ?? existing.eps ?? undefined,
        medicalInsurance:
          data.medicalInsurance ?? existing.medicalInsurance ?? undefined,
        bloodType: (data.bloodType ?? existing.bloodType) as BloodType,
        emergencyContactName:
          data.emergencyContactName ?? existing.emergencyContactName ?? undefined,
        emergencyContactPhone:
          data.emergencyContactPhone ?? existing.emergencyContactPhone ?? undefined,
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
    const event = await this.ensureEventExists(eventId);

    const registrations = await this.eventRegistration.findMany({
      where: { eventId },
      orderBy: { createdAt: 'asc' },
    });

    const enriched = await this.enrichRegistrationsWithVehicle(registrations);
    return enriched.map((registration) => this.applyPrivacyMask(registration, event));
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

  /**
   * Anonimiza permanentemente los datos personales de todas las
   * `EventRegistration` de un usuario que eliminó su cuenta, preservando la
   * evidencia legal de aceptación de consentimientos (timestamp + versión,
   * sin nombre asociado). No toca `bloodType` ni `Event`. Filtra por
   * `EventRegistration.userId`, nunca por `Event.ownerId`. Idempotente: una
   * segunda llamada para el mismo `userId` no falla y deja el mismo estado.
   */
  async anonymizeByUserId(userId: string): Promise<{ count: number }> {
    const { count } = await this.eventRegistration.updateMany({
      where: { userId },
      data: {
        fullName: ANONYMIZED_FULL_NAME,
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
      },
    });

    return { count };
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

  private ensureRiderIsAdult(birthDate: Date): void {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    if (age < 18) {
      throw new RpcException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        message: 'UNDERAGE_RIDER',
      });
    }
  }

  private async persistRiderProfile(
    userId: string,
    rider: Partial<
      Pick<
        CreateRegistrationPayloadDto,
        | 'identificationNumber'
        | 'birthDate'
        | 'phone'
        | 'residenceCity'
        | 'eps'
        | 'medicalInsurance'
        | 'emergencyContactName'
        | 'emergencyContactPhone'
      >
    > &
      Pick<CreateRegistrationPayloadDto, 'fullName' | 'bloodType'>,
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

  private applyPrivacyMask<
    T extends {
      shareMedicalInfo: boolean;
      allowOrganizerContact: boolean;
      eps: string | null;
      medicalInsurance: string | null;
      bloodType: string; // widened from Prisma's BloodType enum — sentinel is a plain string
      emergencyContactName: string | null;
      emergencyContactPhone: string | null;
      phone: string | null;
      identificationNumber: string | null;
      email: string | null;
      residenceCity: string | null;
    },
  >(
    registration: T,
    event: { state: EventState; sosTriggeredAt: Date | null },
  ): T {
    const medicalVisible =
      event.state === EventState.IN_PROGRESS && registration.shareMedicalInfo === true;
    const emergencyVisible = event.state === EventState.IN_PROGRESS;
    const contactVisible = registration.allowOrganizerContact === true;
    const sosVisible = event.sosTriggeredAt !== null;

    return {
      ...registration,
      // Los datos médicos son los más sensibles: se ocultan por completo.
      eps: medicalVisible ? registration.eps : FULL_MASK,
      medicalInsurance: medicalVisible ? registration.medicalInsurance : FULL_MASK,
      bloodType: medicalVisible ? registration.bloodType : FULL_MASK,
      // Los nombres nunca se enmascaran.
      // Identidad/contacto: revelado parcial (primeros caracteres visibles).
      emergencyContactPhone: emergencyVisible
        ? registration.emergencyContactPhone
        : this.maskTail(registration.emergencyContactPhone),
      phone: contactVisible ? registration.phone : this.maskTail(registration.phone),
      identificationNumber: sosVisible
        ? registration.identificationNumber
        : this.maskTail(registration.identificationNumber),
      email: sosVisible ? registration.email : this.maskTail(registration.email),
      // La ciudad de residencia nunca se enmascara.
    };
  }

  /**
   * Revelado parcial: deja visibles los primeros `visible` caracteres y
   * reemplaza el resto por asteriscos (p. ej. `1004******`). Si el valor es
   * demasiado corto para dejar al menos 2 caracteres ocultos, se enmascara
   * por completo para no revelar casi todo.
   */
  private maskTail(value: string | null | undefined, visible = PARTIAL_VISIBLE): string {
    const trimmed = (value ?? '').trim();
    if (trimmed.length <= visible + 1) {
      return FULL_MASK;
    }
    return trimmed.slice(0, visible) + '*'.repeat(trimmed.length - visible);
  }
}
