import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { RpcException } from '@nestjs/microservices';

@Injectable()
export class EventsService extends PrismaClient implements OnModuleInit {
  private logger = new Logger('Events Service')

  constructor() {
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

  create(createEventDto: CreateEventDto) {
    return this.event.create({
      data: createEventDto
    });
  }

  findAll() {
    return this.event.findMany();
  }

  async findOne(id: string) {
    const event = await this.event.findUnique({
      where: { id }
    });

    if (!event) {
      throw new RpcException({
        status: HttpStatus.NOT_FOUND,
        message: `Event with id ${id} not found`
      });
    }

    return event;
  }

  async update(id: string, updateEventDto: UpdateEventDto) {
    await this.findOne(id);

    return this.event.update({
      where: { id },
      data: updateEventDto
    });
  }

  // async remove(id: string) {
  //   await this.findOne(id);

  //   return this.update(id, { state: EventState.CANCELLED });
  // }
}
