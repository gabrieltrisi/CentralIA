import { IspboxService } from './ispbox.service';
import { IspboxHttpService } from './http/ispbox-http.service';

describe('IspboxService (integração de rotas oficiais)', () => {
  let http: jest.Mocked<Pick<IspboxHttpService, 'get' | 'post' | 'patch'>>;
  let service: IspboxService;

  beforeEach(() => {
    http = {
      get: jest.fn().mockResolvedValue({}),
      post: jest.fn().mockResolvedValue({ id: 'os1' }),
      patch: jest.fn().mockResolvedValue({}),
    };
    service = new IspboxService(http as unknown as IspboxHttpService);
  });

  it('lista clientes na rota oficial', async () => {
    await service.listCustomers({});
    expect(http.get).toHaveBeenCalledWith(
      '/api/v2/clientes',
      expect.objectContaining({ operation: 'listCustomers' }),
    );
  });

  it('consulta status da internet na rota aninhada', async () => {
    await service.internetStatus('10', '20');
    expect(http.get).toHaveBeenCalledWith(
      '/api/v2/clientes/10/servicos/20/internet/status',
      expect.objectContaining({ operation: 'internetStatus' }),
    );
  });

  it('gera QR Code PIX via POST na rota de pagamento', async () => {
    await service.generatePaymentQrCode('10', '20', '30');
    expect(http.post).toHaveBeenCalledWith(
      '/api/v2/clientes/10/servicos/20/cobrancas/30/pagamento/qrcode/gerar',
      {},
      expect.objectContaining({ operation: 'generatePaymentQrCode' }),
    );
  });

  it('abre ordem de serviço na rota oficial', async () => {
    await service.createWorkOrder({
      clientesId: '10',
      tipoId: '1',
      assunto: 'Sem conexão',
    });
    expect(http.post).toHaveBeenCalledWith(
      '/api/v2/ordens-servicos',
      expect.objectContaining({ clientesId: '10', tipoId: '1' }),
      expect.objectContaining({ operation: 'createWorkOrder' }),
    );
  });

  it('faz desbloqueio temporário via PATCH', async () => {
    await service.temporaryUnblock('10', '20', { dias: 3 });
    expect(http.patch).toHaveBeenCalledWith(
      '/api/v2/clientes/10/servicos/20/desbloqueio-temporario',
      { dias: 3 },
      expect.objectContaining({ operation: 'temporaryUnblock' }),
    );
  });
});
