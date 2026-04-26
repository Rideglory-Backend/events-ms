import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { envs } from './config';
import { MicroserviceOptions } from '@nestjs/microservices';
import { Transport } from '@nestjs/microservices';
import { RpcAllExceptionsFilter } from './common/filters/rpc-all-exceptions.filter';

async function bootstrap() {

  const logger = new Logger('Events MS');

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.TCP,
    options: {
      port: envs.port,
    },
  });

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  app.useGlobalFilters(new RpcAllExceptionsFilter());

  await app.listen();

  logger.log(`Events MS is running on port ${envs.port}`);
}
bootstrap();
