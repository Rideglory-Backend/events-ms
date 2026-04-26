import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { BaseRpcExceptionFilter, RpcException } from '@nestjs/microservices';

@Catch()
export class RpcAllExceptionsFilter extends BaseRpcExceptionFilter {
  private readonly logger = new Logger(RpcAllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    if (exception instanceof RpcException) {
      const rpcError = exception.getError();
      const message =
        typeof rpcError === 'string'
          ? rpcError
          : JSON.stringify(rpcError);

      this.logger.error(`Handled RPC exception: ${message}`);
      return super.catch(exception, host);
    }

    // ValidationPipe and other Nest HTTP exceptions can happen in microservices too.
    // Preserve their status/message instead of coercing everything to 500.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const message =
        typeof response === 'string'
          ? response
          : Array.isArray((response as { message?: unknown }).message)
            ? (response as { message: string[] }).message
            : (response as { message?: string }).message ?? exception.message;

      this.logger.error(`Handled HTTP exception as RPC: ${JSON.stringify(message)}`);
      return super.catch(
        new RpcException({
          status,
          message,
        }),
        host,
      );
    }

    const message =
      exception instanceof Error
        ? exception.message
        : 'Internal server error';
    const stack = exception instanceof Error ? exception.stack : undefined;

    this.logger.error(`Unhandled exception: ${message}`, stack);

    return super.catch(
      new RpcException({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message,
      }),
      host,
    );
  }
}
