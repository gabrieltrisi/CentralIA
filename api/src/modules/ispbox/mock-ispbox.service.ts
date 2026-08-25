import { Injectable, Logger } from '@nestjs/common';
import { IntegrationStatus } from '@prisma/client';
import { IntegrationLogService } from '../../common/integration-log/integration-log.service';
import { IspboxHttpService } from './http/ispbox-http.service';
import { IspboxService } from './ispbox.service';
import {
  AddWorkOrderNoteDto,
  CreateWorkOrderDto,
  ListChargesQueryDto,
  ListCustomersQueryDto,
  ListWorkOrdersQueryDto,
  TemporaryUnblockDto,
} from './dto/ispbox.dto';

/**
 * Implementação SANDBOX da ISPBOX. Não realiza chamadas reais: retorna dados
 * fictícios para leituras e simula (sem efeito) as escritas, registrando
 * apenas logs simulados. Usada quando APP_MODE=sandbox.
 */
@Injectable()
export class MockIspboxService extends IspboxService {
  private readonly log = new Logger('IspboxSandbox');

  constructor(
    http: IspboxHttpService,
    private readonly integrationLog: IntegrationLogService,
  ) {
    super(http);
  }

  private simulated(operation: string, payload?: unknown) {
    this.log.log(`[SANDBOX] ${operation}`);
    void this.integrationLog.record({
      provider: 'ispbox',
      operation: `sandbox:${operation}`,
      request: payload,
      response: { simulated: true },
      status: IntegrationStatus.SUCCESS,
    });
  }

  // ----- Clientes -----
  async listCustomers(_query: ListCustomersQueryDto) {
    this.simulated('listCustomers');
    return [this.mockCustomer('1')] as any;
  }
  async getCustomer(clientesId: string) {
    this.simulated('getCustomer');
    return this.mockCustomer(clientesId) as any;
  }

  // ----- Serviços -----
  async listServices(_clientesId: string) {
    this.simulated('listServices');
    return [this.mockService('svc-1')] as any;
  }
  async getService(_clientesId: string, servicosId: string) {
    this.simulated('getService');
    return this.mockService(servicosId) as any;
  }

  // ----- Internet -----
  async internetStatus(_clientesId: string, _servicosId: string) {
    this.simulated('internetStatus');
    // Sandbox simula um incidente para demonstrar a abertura de OS.
    return { online: false, status: 'offline' } as any;
  }
  async disconnectInternet(c: string, s: string, d: string) {
    this.simulated('disconnectInternet', { c, s, d });
    return { simulated: true } as any;
  }
  async temporaryUnblock(c: string, s: string, dto: TemporaryUnblockDto) {
    this.simulated('temporaryUnblock', { c, s, dto });
    return { simulated: true, ...dto } as any;
  }

  // ----- Cobranças -----
  async listCharges(
    _c: string,
    _s: string,
    _query: ListChargesQueryDto,
  ) {
    this.simulated('listCharges');
    return [this.mockCharge('cob-1')] as any;
  }
  async getCharge(_c: string, _s: string, cobrancasId: string) {
    this.simulated('getCharge');
    return this.mockCharge(cobrancasId) as any;
  }
  async chargePaymentPdf(_c: string, _s: string, _cob: string) {
    this.simulated('chargePaymentPdf');
    return Buffer.from('%PDF-1.4 sandbox', 'utf-8');
  }
  async generatePaymentQrCode(_c: string, _s: string, cobrancasId: string) {
    this.simulated('generatePaymentQrCode');
    return {
      qrcode: `SANDBOX-QR-${cobrancasId}`,
      copia_cola: `00020126SANDBOX-PIX-${cobrancasId}5204000053039865802BR6009CENTRALIA`,
    } as any;
  }

  // ----- Ordens de Serviço -----
  async listWorkOrders(_query: ListWorkOrdersQueryDto) {
    this.simulated('listWorkOrders');
    return [] as any;
  }
  async createWorkOrder(dto: CreateWorkOrderDto) {
    this.simulated('createWorkOrder', dto);
    return { id: `os-sandbox-${Date.now()}`, status: 'aberta' } as any;
  }
  async getWorkOrder(ordensServicosId: string) {
    this.simulated('getWorkOrder');
    return { id: ordensServicosId, status: 'aberta' } as any;
  }
  async addWorkOrderNote(ordensServicosId: string, dto: AddWorkOrderNoteDto) {
    this.simulated('addWorkOrderNote', { ordensServicosId, dto });
    return { simulated: true } as any;
  }
  async workOrderTypes() {
    this.simulated('workOrderTypes');
    return [
      { id: '1', nome: 'Suporte Técnico' },
      { id: '2', nome: 'Instalação' },
    ] as any;
  }

  // ----- mocks -----
  private mockCustomer(id: string) {
    return {
      id,
      nome: 'Cliente Sandbox',
      cpf_cnpj: '000.000.000-00',
      email: 'cliente@sandbox.local',
      telefone: '5511999990000',
    };
  }
  private mockService(id: string) {
    return { id, tipo: 'FIBRA', status: 'ativo' };
  }
  private mockCharge(id: string) {
    // Cobrança vencida para a demonstração do fluxo financeiro.
    return {
      id,
      valor: 99.9,
      status: 'vencida',
      vencimento: '2026-06-01',
    };
  }
}
