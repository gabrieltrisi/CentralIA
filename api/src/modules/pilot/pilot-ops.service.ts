import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IspboxService } from '../ispbox/ispbox.service';
import { MetaWhatsappSenderService } from '../meta-whatsapp/meta-whatsapp-sender.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { PilotService } from './pilot.service';

export interface IspboxReadonlyReport {
  query: string;
  customer?: { id: string; nome?: string } | null;
  servicesCount: number;
  internetStatus?: unknown;
  chargesCount: number;
  paymentTested: boolean;
  steps: string[];
}

/**
 * Operações de piloto controlado executadas pelos scripts (boot via app context).
 * NUNCA abre OS no readonly da ISPBOX; o envio à Meta exige flags explícitas.
 */
@Injectable()
export class PilotOpsService {
  private readonly logger = new Logger('PilotOps');

  constructor(
    private readonly config: ConfigService,
    private readonly pilot: PilotService,
    private readonly ispbox: IspboxService,
    private readonly sender: MetaWhatsappSenderService,
    private readonly audit: AuditLogService,
  ) {}

  /**
   * ISPBOX em modo SOMENTE LEITURA: autentica, busca cliente, lista serviços,
   * consulta status de internet e cobranças. Gera PDF/QRCode apenas se
   * PILOT_ALLOW_PAYMENT_TEST=true. Jamais chama createWorkOrder (não abre OS).
   */
  async ispboxReadonly(query?: string): Promise<IspboxReadonlyReport> {
    const q = (query ?? this.config.get<string>('pilot.customerQuery') ?? '').trim();
    const allowPayment = this.config.get<boolean>('pilot.allowPaymentTest') ?? false;
    const steps: string[] = [];
    if (!q) throw new BadRequestException('PILOT_CUSTOMER_QUERY ausente (telefone ou CPF/CNPJ).');

    // 1) Busca cliente (leitura)
    const customers = (await this.ispbox.listCustomers({ search: q })) as Array<{ id: string; nome?: string }>;
    steps.push(`listCustomers(search) → ${customers?.length ?? 0} resultado(s)`);
    const customer = customers?.[0] ?? null;

    let servicesCount = 0;
    let internetStatus: unknown;
    let chargesCount = 0;
    let paymentTested = false;

    if (customer?.id) {
      // 2) Serviços
      const services = (await this.ispbox.listServices(customer.id)) as Array<{ id: string }>;
      servicesCount = services?.length ?? 0;
      steps.push(`listServices → ${servicesCount}`);
      const service = services?.[0];

      if (service?.id) {
        // 3) Status de internet
        internetStatus = await this.ispbox.internetStatus(customer.id, service.id);
        steps.push('internetStatus → ok');

        // 4) Cobranças
        const charges = (await this.ispbox.listCharges(customer.id, service.id, {})) as Array<{ id: string }>;
        chargesCount = charges?.length ?? 0;
        steps.push(`listCharges → ${chargesCount}`);

        // 5) Pagamento (apenas leitura/geração — opcional e protegido por flag)
        if (allowPayment && charges?.[0]?.id) {
          await this.ispbox.generatePaymentQrCode(customer.id, service.id, charges[0].id);
          paymentTested = true;
          steps.push('generatePaymentQrCode → ok (PILOT_ALLOW_PAYMENT_TEST)');
        } else if (charges?.[0]?.id) {
          steps.push('pagamento pulado (PILOT_ALLOW_PAYMENT_TEST=false)');
        }
      }
    }

    await this.audit.record({
      actorType: 'system',
      action: 'pilot.ispbox_readonly',
      entityType: 'ispbox',
      entityId: customer?.id,
      metadata: { query: q, servicesCount, chargesCount, paymentTested },
    });

    return { query: q, customer, servicesCount, internetStatus, chargesCount, paymentTested, steps };
  }

  /**
   * Teste controlado de envio à Meta. Bloqueia sem PILOT_ALLOW_META_SEND, sem
   * PILOT_TEST_PHONE, e em sandbox (salvo PILOT_FORCE_SANDBOX_SEND). Registra
   * AuditLog (IntegrationLog é registrado pelo sender).
   */
  async metaSendTest(): Promise<{ to: string; simulated: boolean; result: unknown }> {
    const decision = this.pilot.metaSendDecision();
    if (!decision.allowed) {
      throw new BadRequestException(decision.reason);
    }
    const to = this.pilot.testPhone;
    this.logger.log(`Enviando teste controlado para ${to} (simulado=${decision.simulated})`);
    const result = await this.sender.sendText(to, this.pilot.metaTestMessage);

    await this.audit.record({
      actorType: 'system',
      action: 'pilot.meta_send_test',
      entityType: 'whatsapp',
      entityId: to,
      metadata: { simulated: decision.simulated },
    });
    return { to, simulated: decision.simulated, result };
  }
}
