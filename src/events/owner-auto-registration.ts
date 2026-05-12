import { BloodType, RegistrationStatus } from '@rideglory/contracts';
import type { Prisma } from '../generated/prisma';

/**
 * Snapshot used when creating the organizer's auto-registration alongside a new event.
 *
 * Strategy (best-effort, never blocks event creation):
 * - Prefer `users-ms` profile fields when present.
 * - Use short neutral placeholders for required Prisma columns when data is missing
 *   so the row stays valid; the organizer can complete details later via registration edit.
 * - Owner auto-registration keeps `vehicleId` nullable by design.
 */
const PLACEHOLDER_SHORT = 'N/D';
const PLACEHOLDER_ID = 'PENDIENTE';
const PLACEHOLDER_PHONE = '0000000000';
const DEFAULT_BIRTH = new Date('1970-01-01T00:00:00.000Z');

export type OwnerProfileForRegistration = {
  fullName: string | null;
  identificationNumber: string | null;
  birthDate: Date | null;
  phone: string | null;
  email: string | null;
  residenceCity: string | null;
  eps: string | null;
  medicalInsurance: string | null;
  bloodType: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
};

function resolveOwnerRegistrationFullName(
  fullName: string | null | undefined,
): string {
  const trimmed = (fullName ?? '').trim();
  if (!trimmed) {
    return `Organizador ${PLACEHOLDER_SHORT}`;
  }
  if (!trimmed.includes(' ')) {
    return `${trimmed} ${PLACEHOLDER_SHORT}`;
  }
  return trimmed;
}

function firstWordOfFullName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) {
    return 'Organizador';
  }
  const space = trimmed.indexOf(' ');
  if (space === -1) {
    return trimmed;
  }
  return trimmed.slice(0, space).trim() || 'Organizador';
}

export function buildOwnerAutoRegistrationCreate(
  ownerId: string,
  user: OwnerProfileForRegistration,
): Omit<
  Prisma.EventRegistrationCreateWithoutEventInput,
  'event' | 'userId' | 'status'
> {
  const registrationFullName = resolveOwnerRegistrationFullName(user.fullName);
  const phone = (user.phone ?? '').trim() || PLACEHOLDER_PHONE;
  const email =
    (user.email ?? '').trim() ||
    `owner+${ownerId}@placeholder.invalid.rideglory`;
  const emergencyPhone =
    (user.emergencyContactPhone ?? '').trim() || phone || PLACEHOLDER_PHONE;

  return {
    fullName: registrationFullName,
    identificationNumber:
      (user.identificationNumber ?? '').trim() || PLACEHOLDER_ID,
    birthDate: user.birthDate ?? DEFAULT_BIRTH,
    phone,
    email,
    residenceCity: (user.residenceCity ?? '').trim() || PLACEHOLDER_SHORT,
    eps: (user.eps ?? '').trim() || PLACEHOLDER_SHORT,
    medicalInsurance: user.medicalInsurance?.trim() || null,
    bloodType: (Object.values(BloodType).includes(user.bloodType as BloodType)
      ? (user.bloodType as BloodType)
      : BloodType.O_POSITIVE) as BloodType,
    emergencyContactName:
      (user.emergencyContactName ?? '').trim() ||
      firstWordOfFullName(registrationFullName),
    emergencyContactPhone: emergencyPhone,
    vehicleId: null,
  };
}
