import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationStatus } from '@prisma/client';
import { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';
import { IntegrationLogService } from '../../../common/integration-log/integration-log.service';
import { IspboxAuthService } from '../auth/ispbox-auth.service';
import { IspboxApiException } from '../errors/ispbox-api.exception';

interface RequestOptions extends AxiosRequestConfig {
  /** Rótulo da operação para logs estruturados (ex.: "getCustomer"). */
  operation?: string;
}

/**
 * Client HTTP da ISPBOX com Bearer Token automático.
 *
 * - Prefixa todas as requisições com a ISPBOX_BASE_URL.
 * - Injeta `Authorization: Bearer <token>` e `X-Request-Id` (ISPBOX_REQUEST_ID).
 * - Em 401, invalida o token e refaz a requisição uma única vez.
 * - Registra IntegrationLog (sucesso/erro) e logs estruturados.
 * - Normaliza erros em IspboxApiException (tratada por filtro global).
 */
@Injectable()
export class IspboxHttpService {
  private readonly logger = new Logger(IspboxHttpService.name);

  constructor(
    private readonly http: HttpService,
    private readonly auth: IspboxAuthService,
    private readonly config: ConfigService,
    private readonly integrationLog: IntegrationLogService,
  ) {}

  get<T = any>(path: string, options?: RequestOptions) {
    return this.request<T>({ ...options, method: 'GET', url: path });
  }

  post<T = any>(path: string, data?: unknown, options?: RequestOptions) {
    return this.request<T>({ ...options, method: 'POST', url: path, data });
  }

  patch<T = any>(path: string, data?: unknown, options?: RequestOptions) {
    return this.request<T>({ ...options, method: 'PATCH', url: path, data });
  }

  put<T = any>(path: string, data?: unknown, options?: RequestOptions) {
    return this.request<T>({ ...options, method: 'PUT', url: path, data });
  }

  delete<T = any>(path: string, options?: RequestOptions) {
    return this.request<T>({ ...options, method: 'DELETE', url: path });
  }

  private async request<T>(
    options: RequestOptions,
    isRetry = false,
  ): Promise<T> {
    const operation = options.operation ?? `${options.method} ${options.url}`;
    const token = await this.auth.getAccessToken();
    const baseUrl = (this.config.get<string>('ispbox.baseUrl') ?? '').replace(
      /\/$/,
      '',
    );

    const { operation: _drop, ...axiosConfig } = options;
    const merged: AxiosRequestConfig = {
      ...axiosConfig,
      url: `${baseUrl}${options.url}`,
      headers: {
        Accept: 'application/json',
        'X-Request-Id': this.config.get<string>('ispbox.requestId'),
        ...options.headers,
        Authorization: `Bearer ${token}`,
      },
    };

    try {
      const response: AxiosResponse<T> = await firstValueFrom(
        this.http.request<T>(merged),
      );

      await this.integrationLog.record({
        provider: 'ispbox',
        operation,
        request: { url: options.url, method: options.method, params: options.params },
        response: { status: response.status },
        status: IntegrationStatus.SUCCESS,
      });

      return response.data;
    } catch (err) {
      const axiosErr = err as AxiosError;
      const status = axiosErr.response?.status;

      if (status === 401 && !isRetry) {
        this.logger.warn(`401 em ${operation} — renovando token e repetindo.`);
        await this.auth.invalidate();
        return this.request<T>(options, true);
      }

      await this.integrationLog.record({
        provider: 'ispbox',
        operation,
        request: { url: options.url, method: options.method },
        response: { status, body: axiosErr.response?.data, message: axiosErr.message },
        status: IntegrationStatus.ERROR,
      });

      throw new IspboxApiException(operation, status, axiosErr.response?.data);
    }
  }
}
