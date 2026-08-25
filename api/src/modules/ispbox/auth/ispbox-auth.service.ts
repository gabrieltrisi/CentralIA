import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../redis/redis.module';
import { ISPBOX_ENDPOINTS } from '../ispbox.endpoints';

interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number; // segundos
  refresh_token?: string;
  scope?: string;
}

const ACCESS_TOKEN_KEY = 'ispbox:oauth:access_token';
const REFRESH_TOKEN_KEY = 'ispbox:oauth:refresh_token';

/**
 * Serviço de autenticação OAuth2 da ISPBOX.
 *
 * - Obtém o access token via grant `client_credentials`.
 * - Quando a ISPBOX devolve um `refresh_token`, ele é persistido e usado
 *   para renovar o access token via grant `refresh_token`.
 * - O access token é cacheado no Redis com TTL = expires_in - margem,
 *   compartilhado entre todas as instâncias da aplicação.
 * - Um lock em memória evita corrida de múltiplas renovações simultâneas.
 */
@Injectable()
export class IspboxAuthService {
  private readonly logger = new Logger(IspboxAuthService.name);
  private readonly safetyWindowSec = 30; // renova antes de expirar
  private inFlight: Promise<string> | null = null;

  /** Observabilidade para o diagnóstico (sem segredos). */
  lastRenewedAt: Date | null = null;
  lastError: string | null = null;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  /** Retorna um access token válido, renovando se necessário. */
  async getAccessToken(): Promise<string> {
    const cached = await this.redis.get(ACCESS_TOKEN_KEY);
    if (cached) return cached;

    // Coalesce: se já há uma renovação em andamento, aguarda a mesma.
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.fetchToken().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  /** Força invalidação do cache (ex.: após um 401 vindo da API). */
  async invalidate(): Promise<void> {
    await this.redis.del(ACCESS_TOKEN_KEY);
  }

  /**
   * Tenta renovar via refresh_token; se indisponível ou falhar,
   * recai para client_credentials.
   */
  private async fetchToken(): Promise<string> {
    const refreshToken = await this.redis.get(REFRESH_TOKEN_KEY);
    if (refreshToken) {
      try {
        return await this.requestToken({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        });
      } catch (err) {
        this.logger.warn(
          `Refresh token falhou, recaindo para client_credentials: ${
            (err as Error).message
          }`,
        );
        await this.redis.del(REFRESH_TOKEN_KEY);
      }
    }

    return this.requestToken({
      grant_type: 'client_credentials',
      scope: this.config.get<string>('ispbox.scopes') || undefined,
    });
  }

  private async requestToken(
    extraParams: Record<string, string | undefined>,
  ): Promise<string> {
    const baseUrl = this.config.get<string>('ispbox.baseUrl');
    const clientId = this.config.get<string>('ispbox.clientId');
    const clientSecret = this.config.get<string>('ispbox.clientSecret');

    if (!baseUrl || !clientId || !clientSecret) {
      throw new InternalServerErrorException(
        'Credenciais da ISPBOX ausentes. Configure ISPBOX_BASE_URL / ISPBOX_CLIENT_ID / ISPBOX_CLIENT_SECRET.',
      );
    }

    const body = new URLSearchParams();
    body.set('client_id', clientId);
    body.set('client_secret', clientSecret);
    for (const [key, value] of Object.entries(extraParams)) {
      if (value) body.set(key, value);
    }

    const url = `${baseUrl.replace(/\/$/, '')}${ISPBOX_ENDPOINTS.oauthToken()}`;

    try {
      const { data } = await firstValueFrom(
        this.http.post<OAuthTokenResponse>(url, body.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
            'X-Request-Id': this.config.get<string>('ispbox.requestId'),
          },
        }),
      );

      await this.persistToken(data);
      this.lastRenewedAt = new Date();
      this.lastError = null;
      this.logger.log(
        `Token ISPBOX obtido (grant=${extraParams.grant_type}, expira em ${data.expires_in}s)`,
      );
      return data.access_token;
    } catch (err) {
      const message = (err as Error).message;
      this.lastError = message;
      this.logger.error(`Falha ao obter token ISPBOX: ${message}`);
      throw new InternalServerErrorException(
        'Não foi possível autenticar na ISPBOX.',
      );
    }
  }

  private async persistToken(data: OAuthTokenResponse): Promise<void> {
    const ttl = Math.max(
      (data.expires_in ?? 3600) - this.safetyWindowSec,
      30,
    );
    await this.redis.set(ACCESS_TOKEN_KEY, data.access_token, 'EX', ttl);
    if (data.refresh_token) {
      // refresh tokens costumam viver bem mais que o access token
      await this.redis.set(REFRESH_TOKEN_KEY, data.refresh_token);
    }
  }
}
