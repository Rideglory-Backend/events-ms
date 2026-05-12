import { Module } from '@nestjs/common';
import { EventsModule } from './events/events.module';
import { RegistrationsModule } from './registrations/registrations.module';

@Module({
  imports: [EventsModule, RegistrationsModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
