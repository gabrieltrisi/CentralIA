import { Injectable } from '@nestjs/common';

export interface NormalizedCustomer {
  ispboxId: string;
  nome: string;
  cpfCnpj: string | null;
  email: string | null;
  telefone: string | null;
}

export interface NormalizedService {
  ispboxServiceId: string;
  tipo: string | null;
  status: string | null;
}

export type ChargeSituation = 'open' | 'overdue' | 'paid';

export interface NormalizedCharge {
  id: string;
  valor: number | null;
  vencimento: string | null;
  status: string | null;
  situacao: ChargeSituation;
}

export interface NormalizedInternetStatus {
  online: boolean;
  status: string;
}

export interface NormalizedWorkOrder {
  id: string;
  status: string | null;
}

/**
 * Normaliza os payloads crus da ISPBOX V2 em formas estáveis, evitando que o
 * acesso a campos brutos (nome/cpf_cnpj/copia_cola/...) se espalhe pelo código.
 */
@Injectable()
export class IspboxMapperService {
  private str(v: unknown): string | null {
    if (v === undefined || v === null || v === '') return null;
    return String(v);
  }

  customer(raw: any): NormalizedCustomer {
    return {
      ispboxId: String(raw?.id ?? ''),
      nome: this.str(raw?.nome ?? raw?.razao_social) ?? 'Sem nome',
      cpfCnpj: this.str(raw?.cpf_cnpj ?? raw?.cpf ?? raw?.cnpj),
      email: this.str(raw?.email),
      telefone: this.str(raw?.telefone ?? raw?.celular ?? raw?.whatsapp),
    };
  }

  service(raw: any): NormalizedService {
    return {
      ispboxServiceId: String(raw?.id ?? ''),
      tipo: this.str(raw?.tipo ?? raw?.plano),
      status: this.str(raw?.status),
    };
  }

  /** Classifica a cobrança em aberta / vencida / paga. */
  charge(raw: any, now: Date = new Date()): NormalizedCharge {
    const status = this.str(raw?.status ?? raw?.situacao);
    const vencimento = this.str(raw?.vencimento ?? raw?.data_vencimento);
    const valorRaw = raw?.valor ?? raw?.valor_total;
    const valor = valorRaw === undefined || valorRaw === null ? null : Number(valorRaw);

    let situacao: ChargeSituation;
    if (status && /pag|quit|liquid/i.test(status)) {
      situacao = 'paid';
    } else if (status && /venc|atras/i.test(status)) {
      situacao = 'overdue';
    } else if (vencimento && this.isPastDue(vencimento, now)) {
      situacao = 'overdue';
    } else {
      situacao = 'open';
    }

    return { id: String(raw?.id ?? ''), valor: Number.isNaN(valor as number) ? null : valor, vencimento, status, situacao };
  }

  internetStatus(raw: any): NormalizedInternetStatus {
    const statusText = this.str(raw?.status) ?? '';
    const online =
      raw?.online === true ||
      (raw?.online !== false && /online|ativ|conect|normal/i.test(statusText) && !/offline|bloq|perda|sem\s*sinal/i.test(statusText));
    return { online, status: statusText || (online ? 'online' : 'offline') };
  }

  workOrder(raw: any): NormalizedWorkOrder {
    return { id: String(raw?.id ?? ''), status: this.str(raw?.status) };
  }

  private isPastDue(vencimento: string, now: Date): boolean {
    const t = Date.parse(vencimento);
    return !Number.isNaN(t) && t < now.getTime();
  }
}
