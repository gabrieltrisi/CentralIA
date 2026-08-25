import { Injectable } from '@nestjs/common';
import { IspboxHttpService } from './http/ispbox-http.service';
import { ISPBOX_ENDPOINTS } from './ispbox.endpoints';
import {
  AddWorkOrderNoteDto,
  CreateWorkOrderDto,
  IspboxCharge,
  IspboxCustomer,
  IspboxInternetStatus,
  IspboxPixQrCode,
  IspboxService as IspboxServiceShape,
  IspboxWorkOrder,
  ListChargesQueryDto,
  ListCustomersQueryDto,
  ListWorkOrdersQueryDto,
  TemporaryUnblockDto,
} from './dto/ispbox.dto';

/**
 * Camada de domínio da integração ISPBOX V2. Cada método mapeia uma rota
 * oficial e usa o IspboxHttpService (Bearer + X-Request-Id + logs automáticos).
 */
@Injectable()
export class IspboxService {
  constructor(private readonly api: IspboxHttpService) {}

  // ----- Clientes -----
  listCustomers(query: ListCustomersQueryDto) {
    return this.api.get<IspboxCustomer[]>(ISPBOX_ENDPOINTS.listCustomers(), {
      params: query,
      operation: 'listCustomers',
    });
  }

  getCustomer(clientesId: string) {
    return this.api.get<IspboxCustomer>(
      ISPBOX_ENDPOINTS.getCustomer(clientesId),
      { operation: 'getCustomer' },
    );
  }

  // ----- Serviços -----
  listServices(clientesId: string) {
    return this.api.get<IspboxServiceShape[]>(
      ISPBOX_ENDPOINTS.listServices(clientesId),
      { operation: 'listServices' },
    );
  }

  getService(clientesId: string, servicosId: string) {
    return this.api.get<IspboxServiceShape>(
      ISPBOX_ENDPOINTS.getService(clientesId, servicosId),
      { operation: 'getService' },
    );
  }

  // ----- Internet -----
  internetStatus(clientesId: string, servicosId: string) {
    return this.api.get<IspboxInternetStatus>(
      ISPBOX_ENDPOINTS.internetStatus(clientesId, servicosId),
      { operation: 'internetStatus' },
    );
  }

  disconnectInternet(
    clientesId: string,
    servicosId: string,
    desconectarId: string,
  ) {
    return this.api.post(
      ISPBOX_ENDPOINTS.internetDisconnect(clientesId, servicosId, desconectarId),
      {},
      { operation: 'disconnectInternet' },
    );
  }

  temporaryUnblock(
    clientesId: string,
    servicosId: string,
    dto: TemporaryUnblockDto,
  ) {
    return this.api.patch(
      ISPBOX_ENDPOINTS.temporaryUnblock(clientesId, servicosId),
      dto,
      { operation: 'temporaryUnblock' },
    );
  }

  // ----- Cobranças -----
  listCharges(
    clientesId: string,
    servicosId: string,
    query: ListChargesQueryDto,
  ) {
    return this.api.get<IspboxCharge[]>(
      ISPBOX_ENDPOINTS.listCharges(clientesId, servicosId),
      { params: query, operation: 'listCharges' },
    );
  }

  getCharge(clientesId: string, servicosId: string, cobrancasId: string) {
    return this.api.get<IspboxCharge>(
      ISPBOX_ENDPOINTS.getCharge(clientesId, servicosId, cobrancasId),
      { operation: 'getCharge' },
    );
  }

  /** PDF do pagamento (binário). */
  chargePaymentPdf(
    clientesId: string,
    servicosId: string,
    cobrancasId: string,
  ): Promise<Buffer> {
    return this.api
      .get<ArrayBuffer>(
        ISPBOX_ENDPOINTS.chargePaymentPdf(clientesId, servicosId, cobrancasId),
        {
          responseType: 'arraybuffer',
          headers: { Accept: 'application/pdf' },
          operation: 'chargePaymentPdf',
        },
      )
      .then((data) => Buffer.from(data));
  }

  generatePaymentQrCode(
    clientesId: string,
    servicosId: string,
    cobrancasId: string,
  ) {
    return this.api.post<IspboxPixQrCode>(
      ISPBOX_ENDPOINTS.generatePaymentQrCode(
        clientesId,
        servicosId,
        cobrancasId,
      ),
      {},
      { operation: 'generatePaymentQrCode' },
    );
  }

  // ----- Ordens de Serviço -----
  listWorkOrders(query: ListWorkOrdersQueryDto) {
    return this.api.get<IspboxWorkOrder[]>(
      ISPBOX_ENDPOINTS.listWorkOrders(),
      { params: query, operation: 'listWorkOrders' },
    );
  }

  createWorkOrder(dto: CreateWorkOrderDto) {
    return this.api.post<IspboxWorkOrder>(
      ISPBOX_ENDPOINTS.createWorkOrder(),
      dto,
      { operation: 'createWorkOrder' },
    );
  }

  getWorkOrder(ordensServicosId: string) {
    return this.api.get<IspboxWorkOrder>(
      ISPBOX_ENDPOINTS.getWorkOrder(ordensServicosId),
      { operation: 'getWorkOrder' },
    );
  }

  addWorkOrderNote(ordensServicosId: string, dto: AddWorkOrderNoteDto) {
    return this.api.post(
      ISPBOX_ENDPOINTS.addWorkOrderNote(ordensServicosId),
      dto,
      { operation: 'addWorkOrderNote' },
    );
  }

  workOrderTypes() {
    return this.api.get(ISPBOX_ENDPOINTS.workOrderTypes(), {
      operation: 'workOrderTypes',
    });
  }
}
