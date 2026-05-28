import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { EventsService } from './events.service';
import { CreateEventDto, FindAllEventsPayloadDto, FindUpcomingEventsPayloadDto, UpdateEventPayloadDto } from '@rideglory/contracts';

@Controller()
export class EventsController {
  constructor(private readonly eventsService: EventsService) { }

  @MessagePattern('createEvent')
  create(@Payload() createEventDto: CreateEventDto) {
    return this.eventsService.create(createEventDto);
  }

  @MessagePattern('findAllEvents')
  findAll(@Payload() filters: FindAllEventsPayloadDto) {
    return this.eventsService.findAll(filters);
  }

  @MessagePattern('findEventsByOwnerId')
  findByOwnerId(@Payload('ownerId') ownerId: string) {
    return this.eventsService.findByOwnerId(ownerId);
  }

  @MessagePattern('findUpcomingEvents')
  findUpcoming(@Payload() payload: FindUpcomingEventsPayloadDto) {
    const { limit, ...filters } = payload ?? {};
    return this.eventsService.findUpcoming(filters, limit);
  }

  @MessagePattern('findOneEvent')
  findOne(@Payload() id: string) {
    return this.eventsService.findOneEnriched(id);
  }

  @MessagePattern('findOneEventForViewer')
  findOneForViewer(@Payload() payload: { id: string; authUserId: string }) {
    return this.eventsService.findOneEventForViewer(payload.id, payload.authUserId);
  }

  @MessagePattern('publishEvent')
  publishEvent(@Payload() payload: { id: string; ownerId: string }) {
    return this.eventsService.publishEvent(payload.id, payload.ownerId);
  }

  @MessagePattern('updateEvent')
  update(@Payload() updateEventDto: UpdateEventPayloadDto) {
    const { id, ...data } = updateEventDto;
    return this.eventsService.update(id, data);
  }

  @MessagePattern('removeEvent')
  remove(@Payload() id: string) {
    return this.eventsService.remove(id);
  }

  @MessagePattern('trackingStart')
  startTracking(@Payload() payload: { eventId: string; authUserId: string }) {
    return this.eventsService.startTracking(payload.eventId, payload.authUserId);
  }

  @MessagePattern('trackingEnd')
  endTracking(@Payload() payload: { eventId: string; authUserId: string }) {
    return this.eventsService.endTracking(payload.eventId, payload.authUserId);
  }

  @MessagePattern('getRouteGeoJson')
  getRouteGeoJson(@Payload() payload: { eventId: string }) {
    return this.eventsService.getRouteGeoJson(payload.eventId);
  }

  @MessagePattern('markSosTriggered')
  markSosTriggered(@Payload() payload: { eventId: string; userId: string }) {
    return this.eventsService.markSosTriggered(payload.eventId, payload.userId);
  }

  @MessagePattern('getApprovedRegistrantUserIds')
  getApprovedRegistrantUserIds(@Payload() payload: { eventId: string }) {
    return this.eventsService.getApprovedRegistrantUserIds(payload.eventId);
  }

  @MessagePattern('markReminderSent')
  markReminderSent(@Payload() payload: { eventId: string }) {
    return this.eventsService.markReminderSent(payload.eventId);
  }

  @MessagePattern('findEventsNeedingReminder')
  findEventsNeedingReminder(@Payload() payload: { fromDate: string; toDate: string }) {
    return this.eventsService.findEventsNeedingReminder(
      new Date(payload.fromDate),
      new Date(payload.toDate),
    );
  }
}
