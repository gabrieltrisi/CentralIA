import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface OutboundStatus {
  allowed: boolean;
  reason: string;
}

export interface MetaSendDecision {
  allowed: boolean;
  /** Motivo legível quando bloqueado. */
  reason: string;
  /** true quando o envio será apenas simulado (sandbox forçado). */
  simulated: boolean;
}

/**
 * Núcleo do piloto controlado (sem dependências pesadas). Centraliza a allowlist
 * de telefones e as regras de guarda de envio — reutilizado pelo processor de
 * webhook, pelo diagnóstico da Meta e pelos scripts de piloto.
 */
@Injectable()
export class PilotService {
  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return this.config.get<boolean>('pilot.enabled') ?? false;
  }

  get allowedPhones(): string[] {
    return this.config.get<string[]>('pilot.allowedPhones') ?? [];
  }

  private get sandbox(): boolean {
    return this.config.get<string>('appMode') === 'sandbox';
  }

  /** Normaliza para apenas dígitos (compara por sufixo para tolerar DDI/0). */
  normalize(phone: string | null | undefined): string {
    return (phone ?? '').replace(/\D/g, '');
  }

  /**
   * Normaliza um telefone BR para o padrão WhatsApp/E.164 (apenas dígitos com DDI 55):
   * aceita com/sem 55, com espaços, parênteses, hífen e zeros à esquerda.
   * Ex.: "(71) 99167-4248" / "71991674248" / "5571991674248" → "5571991674248".
   */
  normalizeBr(phone: string | null | undefined): string {
    let d = this.normalize(phone).replace(/^0+/, '');
    if (!d) return '';
    // 10 (fixo) ou 11 (móvel) dígitos = número nacional sem DDI → prefixa 55.
    if (d.length === 10 || d.length === 11) d = `55${d}`;
    return d;
  }

  /** Mascara parcialmente para logs: "5571991674248" → "5571*****248". */
  mask(phone: string | null | undefined): string {
    const d = this.normalizeBr(phone);
    if (!d) return '';
    if (d.length < 8) return '***';
    return `${d.slice(0, 4)}*****${d.slice(-3)}`;
  }

  /** Em PILOT_MODE, só telefones da allowlist são processados. */
  isPhoneAllowed(phone: string | null | undefined): boolean {
    if (!this.enabled) return true;
    const digits = this.normalizeBr(phone);
    if (!digits) return false;
    return this.allowedPhones.some((allowed) => {
      const a = this.normalizeBr(allowed);
      if (!a) return false;
      return digits === a || digits.endsWith(a) || a.endsWith(digits);
    });
  }

  /** Situação do outbound real para o diagnóstico (sem expor segredos). */
  outboundStatus(metaConfigured: boolean): OutboundStatus {
    if (this.sandbox) return { allowed: false, reason: 'sandbox: envios são simulados (não vão à Meta)' };
    if (!metaConfigured) return { allowed: false, reason: 'Meta não configurada (token/phoneNumberId ausentes)' };
    return { allowed: true, reason: 'produção: outbound real habilitado' };
  }

  /**
   * Decide se o teste de envio à Meta pode ocorrer.
   * - exige PILOT_ALLOW_META_SEND=true;
   * - exige PILOT_TEST_PHONE;
   * - em sandbox, bloqueia salvo PILOT_FORCE_SANDBOX_SEND=true (apenas simula).
   */
  metaSendDecision(): MetaSendDecision {
    const allowMetaSend = this.config.get<boolean>('pilot.allowMetaSend') ?? false;
    const forceSandboxSend = this.config.get<boolean>('pilot.forceSandboxSend') ?? false;
    const testPhone = this.config.get<string>('pilot.testPhone') ?? '';

    if (!allowMetaSend) {
      return { allowed: false, simulated: false, reason: 'PILOT_ALLOW_META_SEND não está habilitado' };
    }
    if (!testPhone) {
      return { allowed: false, simulated: false, reason: 'PILOT_TEST_PHONE ausente' };
    }
    if (this.sandbox && !forceSandboxSend) {
      return {
        allowed: false,
        simulated: false,
        reason: 'Bloqueado em sandbox (use PILOT_FORCE_SANDBOX_SEND=true para simular)',
      };
    }
    return { allowed: true, simulated: this.sandbox, reason: 'ok' };
  }

  get testPhone(): string {
    return this.config.get<string>('pilot.testPhone') ?? '';
  }

  /** Mensagem padrão do teste controlado. */
  get metaTestMessage(): string {
    return 'Teste controlado CentralIA/ChipNews. Responda OK para validar o recebimento.';
  }
}
