import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PilotService } from '../pilot/pilot.service';

export interface AccessDecision {
  allowed: boolean;
  /** true quando a ação será apenas simulada (sandbox/mock). */
  simulated: boolean;
  reason: string;
}

/**
 * Decisões de acesso à ISPBOX (centralizadas e reutilizadas por fluxos e
 * endpoints). Leitura exige ISPBOX_ENABLED; qualquer ESCRITA real (PIX/PDF/OS)
 * exige flag explícita e respeita o piloto. Em sandbox tudo é simulado (mock).
 */
@Injectable()
export class IspboxAccessService {
  constructor(
    private readonly config: ConfigService,
    private readonly pilot: PilotService,
  ) {}

  get sandbox(): boolean {
    return this.config.get<string>('appMode') === 'sandbox';
  }

  get enabled(): boolean {
    return this.config.get<boolean>('ispbox.enabled') ?? false;
  }

  /** Leitura permitida? (sandbox usa mock; produção exige ISPBOX_ENABLED). */
  canRead(): boolean {
    return this.sandbox || this.enabled;
  }

  /** Decisão para gerar PIX/PDF (ação financeira). */
  paymentDecision(phone?: string | null): AccessDecision {
    return this.writeDecision(
      this.config.get<boolean>('financial.allowPaymentActions') ?? false,
      'FINANCIAL_ALLOW_PAYMENT_ACTIONS',
      phone,
    );
  }

  /** Decisão para abrir OS (ação de suporte). */
  osDecision(phone?: string | null): AccessDecision {
    return this.writeDecision(
      this.config.get<boolean>('support.allowOsCreation') ?? false,
      'SUPPORT_ALLOW_OS_CREATION',
      phone,
    );
  }

  /**
   * Regra única para escritas reais:
   * - sandbox → permitido, porém SIMULADO (mock);
   * - produção → exige a flag da ação;
   * - em PILOT_MODE → exige PILOT_ALLOW_ISPBOX_WRITE e telefone na allowlist.
   */
  private writeDecision(actionFlag: boolean, flagName: string, phone?: string | null): AccessDecision {
    if (this.sandbox) {
      return { allowed: true, simulated: true, reason: 'sandbox: ação simulada (sem efeito real na ISPBOX)' };
    }
    if (!this.enabled) {
      return { allowed: false, simulated: false, reason: 'ISPBOX_ENABLED=false' };
    }
    if (!actionFlag) {
      return { allowed: false, simulated: false, reason: `${flagName}=false` };
    }
    if (this.pilot.enabled) {
      if (!(this.config.get<boolean>('pilot.allowIspboxWrite') ?? false)) {
        return { allowed: false, simulated: false, reason: 'PILOT_ALLOW_ISPBOX_WRITE=false' };
      }
      if (!this.pilot.isPhoneAllowed(phone)) {
        return { allowed: false, simulated: false, reason: 'telefone fora da allowlist do piloto' };
      }
    }
    return { allowed: true, simulated: false, reason: 'ok' };
  }
}
