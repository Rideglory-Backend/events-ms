import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ClsModule, ClsService } from 'nestjs-cls';
import { TracingSerializer } from '@rideglory/common-lib';
import { envs, USERS_SERVICE, VEHICLES_SERVICE } from '../config';
import { RegistrationsController } from './registrations.controller';
import { RegistrationsService } from './registrations.service';

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
      {
        name: VEHICLES_SERVICE,
        imports: [ClsModule],
        inject: [ClsService],
        useFactory: (cls: ClsService) => ({
          transport: Transport.TCP,
          options: {
            host: envs.vehiclesMsHost,
            port: envs.vehiclesMsPort,
            serializer: new TracingSerializer(cls),
          },
        }),
      },
    ]),
  ],
  controllers: [RegistrationsController],
  providers: [RegistrationsService],
})
export class RegistrationsModule {}
