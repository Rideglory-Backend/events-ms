import './instrument';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { envs } from './config';
import { MicroserviceOptions } from '@nestjs/microservices';
import { Transport } from '@nestjs/microservices';
import { RpcAllExceptionsFilter, TracingDeserializer } from '@rideglory/common-lib';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: envs.port,
      deserializer: new TracingDeserializer(),
    },
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));

  app.useGlobalPipes(new ValidationPipe({
    transform: true,
  }));

  app.useGlobalFilters(new RpcAllExceptionsFilter('events-ms'));

  await app.listen();

  app.get(Logger).log(`Events MS is running on port ${envs.port}`);
}
bootstrap();
