import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { IspboxApiException } from './ispbox-api.exception';

/**
 * Tratamento global de erros da ISPBOX: responde com um envelope
 * estruturado e registra log estruturado do incidente.
 */
@Catch(IspboxApiException)
export class IspboxExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('IspboxExceptionFilter');

  catch(exception: IspboxApiException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    this.logger.error(
      `ISPBOX falhou em "${exception.operation}" (status=${
        exception.ispboxStatus ?? 'n/a'
      })`,
    );

    response.status(exception.getStatus()).json({
      error: 'ispbox_error',
      operation: exception.operation,
      ispboxStatus: exception.ispboxStatus ?? null,
      message: 'Falha na integração com a ISPBOX.',
      details: exception.ispboxBody ?? null,
    });
  }
}
