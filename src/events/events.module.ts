import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ClsModule, ClsService } from 'nestjs-cls';
import { TracingSerializer } from '@rideglory/common-lib';
import { envs, USERS_SERVICE } from '../config';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { TrackingController } from '../tracking/tracking.controller';
import { TrackingService } from '../tracking/tracking.service';

@Module({
  imports: [
    ClsModule,
    ClientsModule.registerAsync([
      {
        name: USERS_SERVICE,
        imports: [ClsModule],
        inject: [ClsService],
        useFactory: (cls: ClsService) => ({
          transport: Transport.TCP,
          options: {
            host: envs.usersMsHost,
            port: envs.usersMsPort,
            serializer: new TracingSerializer(cls),
          },
        }),
      },
    ]),
  ],
  controllers: [EventsController, TrackingController],
  providers: [EventsService, TrackingService],
})
export class EventsModule {}
