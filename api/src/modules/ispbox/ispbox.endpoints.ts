/**
 * Rotas OFICIAIS da API ISPBOX V2 (collection oficial).
 * ------------------------------------------------------------------
 * Todos os paths são relativos à ISPBOX_BASE_URL (host raiz, sem barra
 * final). O prefixo `/api/v2` faz parte do path oficial e é mantido aqui.
 *
 * Nenhuma rota presumida — apenas as rotas da collection.
 */
export const ISPBOX_ENDPOINTS = {
  // OAuth2 — client_credentials / refresh_token
  oauthToken: () => `/oauth/token`,

  // ----- Clientes -----
  listCustomers: () => `/api/v2/clientes`,
  getCustomer: (clientesId: string) => `/api/v2/clientes/${clientesId}`,

  // ----- Serviços -----
  listServices: (clientesId: string) =>
    `/api/v2/clientes/${clientesId}/servicos`,
  getService: (clientesId: string, servicosId: string) =>
    `/api/v2/clientes/${clientesId}/servicos/${servicosId}`,

  // ----- Internet -----
  internetStatus: (clientesId: string, servicosId: string) =>
    `/api/v2/clientes/${clientesId}/servicos/${servicosId}/internet/status`,
  internetDisconnect: (
    clientesId: string,
    servicosId: string,
    desconectarId: string,
  ) =>
    `/api/v2/clientes/${clientesId}/servicos/${servicosId}/internet/desconectar/${desconectarId}`,
  temporaryUnblock: (clientesId: string, servicosId: string) =>
    `/api/v2/clientes/${clientesId}/servicos/${servicosId}/desbloqueio-temporario`,

  // ----- Cobranças -----
  listCharges: (clientesId: string, servicosId: string) =>
    `/api/v2/clientes/${clientesId}/servicos/${servicosId}/cobrancas`,
  getCharge: (clientesId: string, servicosId: string, cobrancasId: string) =>
    `/api/v2/clientes/${clientesId}/servicos/${servicosId}/cobrancas/${cobrancasId}`,
  chargePaymentPdf: (
    clientesId: string,
    servicosId: string,
    cobrancasId: string,
  ) =>
    `/api/v2/clientes/${clientesId}/servicos/${servicosId}/cobrancas/${cobrancasId}/pagamento/pdf`,
  generatePaymentQrCode: (
    clientesId: string,
    servicosId: string,
    cobrancasId: string,
  ) =>
    `/api/v2/clientes/${clientesId}/servicos/${servicosId}/cobrancas/${cobrancasId}/pagamento/qrcode/gerar`,

  // ----- Ordens de Serviço -----
  listWorkOrders: () => `/api/v2/ordens-servicos`,
  createWorkOrder: () => `/api/v2/ordens-servicos`,
  getWorkOrder: (ordensServicosId: string) =>
    `/api/v2/ordens-servicos/${ordensServicosId}`,
  addWorkOrderNote: (ordensServicosId: string) =>
    `/api/v2/ordens-servicos/${ordensServicosId}/anotacoes`,
  workOrderTypes: () => `/api/v2/ordens-servicos/tipos`,
} as const;
