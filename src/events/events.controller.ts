import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { EventsService } from './events.service';
import { CreateEventDto, UpdateEventPayloadDto } from '@rideglory/contracts';

@Controller()
export class EventsController {
  constructor(private readonly eventsService: EventsService) { }

  @MessagePattern('createEvent')
  create(@Payload() createEventDto: CreateEventDto) {
    return this.eventsService.create(createEventDto);
  }

  @MessagePattern('findAllEvents')
  findAll() {
    return this.eventsService.findAll();
  }

  @MessagePattern('findEventsByOwnerId')
  findByOwnerId(@Payload('ownerId') ownerId: string) {
    return this.eventsService.findByOwnerId(ownerId);
  }

  @MessagePattern('findUpcomingEvents')
  findUpcoming(@Payload('limit') limit?: number) {
    return this.eventsService.findUpcoming(limit);
  }

  @MessagePattern('findOneEvent')
  findOne(@Payload() id: string) {
    return this.eventsService.findOne(id);
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
}
