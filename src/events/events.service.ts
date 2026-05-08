import { HttpStatus, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CreateEventDto, UpdateEventDto } from '@rideglory/contracts';
import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { USERS_SERVICE } from '../config';

@Injectable()
export class EventsService extends PrismaClient implements OnModuleInit {
  private logger = new Logger('Events Service')

  constructor(
    @Inject(USERS_SERVICE) private readonly usersService: ClientProxy,
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

  private async validateOwnerExists(ownerId: string) {
    try {
      await firstValueFrom(
        this.usersService.send('findOneUser', { id: ownerId }).pipe(timeout(3000)),
      );
    } catch {
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: `Owner user with id ${ownerId} does not exist`,
      });
    }
  }

  async onModuleInit() {
    await this.$connect();
  }

  async create(createEventDto: CreateEventDto) {
    await this.validateOwnerExists(createEventDto.ownerId);

    return this.event.create({
      data: createEventDto
    });
  }

  findAll() {
    return this.event.findMany({
      orderBy: { startDate: 'asc' },
    });
  }

  findByOwnerId(ownerId: string) {
    return this.event.findMany({
      where: { ownerId },
      orderBy: { startDate: 'asc' },
    });
  }

  findUpcoming(limit = 5) {
    return this.event.findMany({
      where: {
        startDate: {
          gte: new Date(),
        },
      },
      orderBy: { startDate: 'asc' },
      take: limit,
    });
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
    if (updateEventDto.ownerId) {
      await this.validateOwnerExists(updateEventDto.ownerId);
    }

    await this.findOne(id);

    return this.event.update({
      where: { id },
      data: updateEventDto
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.event.delete({
      where: { id },
    });
  }
}
