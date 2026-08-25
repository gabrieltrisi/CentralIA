import { MockIspboxService } from './mock-ispbox.service';
import { IspboxHttpService } from './http/ispbox-http.service';
import { IntegrationLogService } from '../../common/integration-log/integration-log.service';

describe('MockIspboxService (sandbox)', () => {
  const http = {} as unknown as IspboxHttpService;
  const integrationLog = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as IntegrationLogService;
  const mock = new MockIspboxService(http, integrationLog);

  it('status da internet retorna offline (incidente simulado)', async () => {
    const status: any = await mock.internetStatus('1', '2');
    expect(status.online).toBe(false);
  });

  it('listCharges retorna cobrança vencida', async () => {
    const charges: any[] = await mock.listCharges('1', '2', {});
    expect(charges).toHaveLength(1);
    expect(charges[0].status).toBe('vencida');
  });

  it('generatePaymentQrCode retorna copia-e-cola PIX', async () => {
    const pix: any = await mock.generatePaymentQrCode('1', '2', '3');
    expect(pix.copia_cola).toContain('SANDBOX-PIX-3');
  });

  it('chargePaymentPdf retorna um Buffer', async () => {
    const pdf = await mock.chargePaymentPdf('1', '2', '3');
    expect(Buffer.isBuffer(pdf)).toBe(true);
  });

  it('createWorkOrder retorna um id simulado e registra log', async () => {
    const os: any = await mock.createWorkOrder({
      clientesId: '1',
      tipoId: '1',
      assunto: 'teste',
    });
    expect(os.id).toMatch(/^os-sandbox-/);
    expect(integrationLog.record).toHaveBeenCalled();
  });
});
