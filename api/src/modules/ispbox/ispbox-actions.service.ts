import { Inject, Injectable, Logger } from '@nestjs/common';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { FileSecurityService } from '../../common/storage/file-security.service';
import { STORAGE_PROVIDER, StorageProvider } from '../../common/storage/storage.provider';
import { IspboxService } from './ispbox.service';
import { IspboxAccessService } from './ispbox-access.service';
import { IspboxMapperService, NormalizedCharge } from './ispbox-mapper.service';

export interface ActionActor {
  actorType: 'system' | 'user';
  actorId?: string;
  companyId?: string | null;
  phone?: string | null;
}

export interface IspboxSnapshot {
  available: boolean;
  reason?: string;
  services?: { ispboxServiceId: string; tipo: string | null; status: string | null }[];
  internetStatus?: { online: boolean; status: string };
  charges?: { open: NormalizedCharge[]; overdue: NormalizedCharge[]; paid: NormalizedCharge[]; total: number };
  fetchedAt?: string;
}

/**
 * Ações ISPBOX guardadas (snapshot de leitura + geração de PIX/PDF). Respeita
 * ISPBOX_ENABLED, sandbox (simulado) e as flags de pagamento/piloto, e registra
 * auditoria. Não cria OS (evita ciclo com TicketsModule — a OS é tratada nos
 * fluxos/conversas).
 */
@Injectable()
export class IspboxActionsService {
  private readonly logger = new Logger('IspboxActions');

  constructor(
    private readonly ispbox: IspboxService,
    private readonly access: IspboxAccessService,
    private readonly mapper: IspboxMapperService,
    private readonly audit: AuditLogService,
    private readonly fileSecurity: FileSecurityService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  /** Leitura consolidada (serviços + status + cobranças). */
  async snapshot(params: { ispboxId: string; serviceId?: string; actor: ActionActor }): Promise<IspboxSnapshot> {
    if (!this.access.canRead()) {
      return { available: false, reason: 'ISPBOX_ENABLED=false' };
    }
    if (!params.ispboxId) {
      return { available: false, reason: 'Cliente sem ispboxId.' };
    }

    const services = ((await this.ispbox.listServices(params.ispboxId)) ?? []).map((s) => this.mapper.service(s));
    const serviceId = params.serviceId ?? services[0]?.ispboxServiceId;

    let internetStatus;
    let charges;
    if (serviceId) {
      const rawStatus = await this.ispbox.internetStatus(params.ispboxId, serviceId);
      internetStatus = this.mapper.internetStatus(rawStatus);
      await this.record('support.internet.status', params.actor, params.ispboxId, { online: internetStatus.online });

      const rawCharges = (await this.ispbox.listCharges(params.ispboxId, serviceId, {})) ?? [];
      const normalized = rawCharges.map((c) => this.mapper.charge(c));
      charges = {
        open: normalized.filter((c) => c.situacao === 'open'),
        overdue: normalized.filter((c) => c.situacao === 'overdue'),
        paid: normalized.filter((c) => c.situacao === 'paid'),
        total: normalized.length,
      };
      await this.record('financial.billing.lookup', params.actor, params.ispboxId, { total: normalized.length });
    }

    return { available: true, services, internetStatus, charges, fetchedAt: new Date().toISOString() };
  }

  /** Gera o PIX copia-e-cola da cobrança (guardado). */
  async generatePix(params: { ispboxId: string; serviceId: string; chargeId: string; actor: ActionActor }) {
    const decision = this.access.paymentDecision(params.actor.phone);
    if (!decision.allowed) {
      await this.record('financial.pix.generate', params.actor, params.ispboxId, { blocked: true, reason: decision.reason });
      return { blocked: true, reason: decision.reason };
    }
    const pix: any = await this.ispbox.generatePaymentQrCode(params.ispboxId, params.serviceId, params.chargeId);
    await this.record('financial.pix.generate', params.actor, params.ispboxId, { simulated: decision.simulated, chargeId: params.chargeId });
    return { blocked: false, simulated: decision.simulated, copiaCola: pix?.copia_cola ?? pix?.qrcode ?? '' };
  }

  /** Gera o PDF do boleto, armazena e devolve a URL (guardado). */
  async generatePdf(params: { ispboxId: string; serviceId: string; chargeId: string; actor: ActionActor }) {
    const decision = this.access.paymentDecision(params.actor.phone);
    if (!decision.allowed) {
      await this.record('financial.pdf.generate', params.actor, params.ispboxId, { blocked: true, reason: decision.reason });
      return { blocked: true, reason: decision.reason };
    }
    const pdf = await this.ispbox.chargePaymentPdf(params.ispboxId, params.serviceId, params.chargeId);
    const storedName = this.fileSecurity.buildStoredName('application/pdf');
    const stored = await this.storage.save({ buffer: pdf, storedName, mimeType: 'application/pdf' });
    await this.record('financial.pdf.generate', params.actor, params.ispboxId, { simulated: decision.simulated, chargeId: params.chargeId });
    return { blocked: false, simulated: decision.simulated, url: stored.url };
  }

  private record(action: string, actor: ActionActor, ispboxId: string, metadata: Record<string, unknown>) {
    return this.audit.record({
      companyId: actor.companyId ?? undefined,
      actorType: actor.actorType,
      actorId: actor.actorId ?? undefined,
      action,
      entityType: 'ispbox',
      entityId: ispboxId,
      metadata,
    });
  }
}
