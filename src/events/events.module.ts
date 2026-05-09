import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { envs, USERS_SERVICE } from '../config';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { TrackingController } from '../tracking/tracking.controller';
import { TrackingService } from '../tracking/tracking.service';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: USERS_SERVICE,
        transport: Transport.TCP,
        options: {
          host: envs.usersMsHost,
          port: envs.usersMsPort,
        },
      },
    ]),
  ],
  controllers: [EventsController, TrackingController],
  providers: [EventsService, TrackingService],
})
export class EventsModule {}
