import { Controller, ParseUUIDPipe } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  CreateRegistrationPayloadDto,
  EventRegistrationsForUserQueryDto,
  EventRegistrationsQueryDto,
  MyRegistrationsQueryDto,
  RegistrationIdPayloadDto,
  UpdateRegistrationPayloadDto,
} from '@rideglory/contracts';
import { RegistrationsService } from './registrations.service';

@Controller()
export class RegistrationsController {
  constructor(private readonly registrationsService: RegistrationsService) {}

  @MessagePattern('createRegistration')
  create(@Payload() payload: CreateRegistrationPayloadDto) {
    return this.registrationsService.create(payload);
  }

  @MessagePattern('updateRegistration')
  update(@Payload() payload: UpdateRegistrationPayloadDto) {
    const { registrationId, userId, ...data } = payload;
    return this.registrationsService.update(registrationId, userId, data);
  }

  @MessagePattern('cancelRegistration')
  cancel(@Payload() payload: RegistrationIdPayloadDto) {
    return this.registrationsService.cancel(
      payload.registrationId,
      payload.userId!,
    );
  }

  @MessagePattern('approveRegistration')
  approve(@Payload('registrationId', ParseUUIDPipe) registrationId: string) {
    return this.registrationsService.approve(registrationId);
  }

  @MessagePattern('rejectRegistration')
  reject(@Payload('registrationId', ParseUUIDPipe) registrationId: string) {
    return this.registrationsService.reject(registrationId);
  }

  @MessagePattern('setRegistrationReadyForEdit')
  setReadyForEdit(
    @Payload('registrationId', ParseUUIDPipe) registrationId: string,
  ) {
    return this.registrationsService.setReadyForEdit(registrationId);
  }

  @MessagePattern('getRegistrationsByEvent')
  findByEvent(@Payload() payload: EventRegistrationsQueryDto) {
    return this.registrationsService.findByEvent(payload.eventId);
  }

  @MessagePattern('getMyRegistrationForEvent')
  findMyRegistrationForEvent(
    @Payload() payload: EventRegistrationsForUserQueryDto,
  ) {
    return this.registrationsService.findMyRegistrationForEvent(
      payload.eventId,
      payload.userId,
    );
  }

  @MessagePattern('getMyRegistrations')
  findMyRegistrations(@Payload() payload: MyRegistrationsQueryDto) {
    return this.registrationsService.findMyRegistrations(payload.userId);
  }
}
