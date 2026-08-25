import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Erro normalizado de qualquer chamada à API ISPBOX.
 * Carrega o status e o corpo retornados pela ISPBOX para diagnóstico.
 */
export class IspboxApiException extends HttpException {
  constructor(
    public readonly operation: string,
    public readonly ispboxStatus: number | undefined,
    public readonly ispboxBody: unknown,
    message = 'Erro ao comunicar com a ISPBOX.',
  ) {
    const status =
      ispboxStatus && ispboxStatus >= 400 && ispboxStatus < 600
        ? ispboxStatus
        : HttpStatus.BAD_GATEWAY;
    super(
      { message, provider: 'ispbox', operation, ispboxStatus, ispboxBody },
      status,
    );
  }
}
