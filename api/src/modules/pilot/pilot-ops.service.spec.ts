import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PilotService } from './pilot.service';
import { PilotOpsService } from './pilot-ops.service';

function makeConfig(cfg: Record<string, unknown>) {
  return { get: (k: string) => cfg[k] } as unknown as ConfigService;
}

function makeIspbox() {
  return {
    listCustomers: jest.fn().mockResolvedValue([{ id: 'cli-1', nome: 'Fulano' }]),
    listServices: jest.fn().mockResolvedValue([{ id: 'svc-1' }]),
    internetStatus: jest.fn().mockResolvedValue({ online: true }),
    listCharges: jest.fn().mockResolvedValue([{ id: 'cob-1' }]),
    generatePaymentQrCode: jest.fn().mockResolvedValue({ copia_cola: 'PIX' }),
    createWorkOrder: jest.fn().mockResolvedValue({ id: 'os-1' }),
  };
}

const audit = { record: jest.fn().mockResolvedValue(undefined) } as any;

describe('PilotOpsService — ISPBOX readonly', () => {
  it('NUNCA abre OS (não chama createWorkOrder) e pula pagamento sem a flag', async () => {
    const config = makeConfig({ 'pilot.customerQuery': '5511999998888', 'pilot.allowPaymentTest': false });
    const ispbox = makeIspbox();
    const svc = new PilotOpsService(config, new PilotService(config), ispbox as any, {} as any, audit);

    const report = await svc.ispboxReadonly();

    expect(ispbox.listCustomers).toHaveBeenCalled();
    expect(ispbox.listServices).toHaveBeenCalled();
    expect(ispbox.internetStatus).toHaveBeenCalled();
    expect(ispbox.listCharges).toHaveBeenCalled();
    expect(ispbox.generatePaymentQrCode).not.toHaveBeenCalled();
    expect(ispbox.createWorkOrder).not.toHaveBeenCalled();
    expect(report.paymentTested).toBe(false);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'pilot.ispbox_readonly' }),
    );
  });

  it('gera QRCode só com PILOT_ALLOW_PAYMENT_TEST, ainda sem abrir OS', async () => {
    const config = makeConfig({ 'pilot.customerQuery': '5511999998888', 'pilot.allowPaymentTest': true });
    const ispbox = makeIspbox();
    const svc = new PilotOpsService(config, new PilotService(config), ispbox as any, {} as any, audit);

    const report = await svc.ispboxReadonly();
    expect(ispbox.generatePaymentQrCode).toHaveBeenCalled();
    expect(ispbox.createWorkOrder).not.toHaveBeenCalled();
    expect(report.paymentTested).toBe(true);
  });

  it('exige PILOT_CUSTOMER_QUERY', async () => {
    const config = makeConfig({ 'pilot.customerQuery': '' });
    const svc = new PilotOpsService(config, new PilotService(config), makeIspbox() as any, {} as any, audit);
    await expect(svc.ispboxReadonly()).rejects.toThrow(BadRequestException);
  });
});

describe('PilotOpsService — teste de envio Meta', () => {
  it('bloqueia sem PILOT_ALLOW_META_SEND', async () => {
    const config = makeConfig({ 'pilot.allowMetaSend': false, 'pilot.testPhone': '5511999998888', appMode: 'production' });
    const sender = { sendText: jest.fn() };
    const svc = new PilotOpsService(config, new PilotService(config), {} as any, sender as any, audit);
    await expect(svc.metaSendTest()).rejects.toThrow(BadRequestException);
    expect(sender.sendText).not.toHaveBeenCalled();
  });

  it('bloqueia em sandbox por padrão', async () => {
    const config = makeConfig({
      'pilot.allowMetaSend': true,
      'pilot.testPhone': '5511999998888',
      'pilot.forceSandboxSend': false,
      appMode: 'sandbox',
    });
    const sender = { sendText: jest.fn() };
    const svc = new PilotOpsService(config, new PilotService(config), {} as any, sender as any, audit);
    await expect(svc.metaSendTest()).rejects.toThrow(BadRequestException);
    expect(sender.sendText).not.toHaveBeenCalled();
  });

  it('envia (simulado) em sandbox com force e audita', async () => {
    const config = makeConfig({
      'pilot.allowMetaSend': true,
      'pilot.testPhone': '5511999998888',
      'pilot.forceSandboxSend': true,
      appMode: 'sandbox',
    });
    const sender = { sendText: jest.fn().mockResolvedValue({ simulated: true }) };
    const svc = new PilotOpsService(config, new PilotService(config), {} as any, sender as any, audit);
    const res = await svc.metaSendTest();
    expect(sender.sendText).toHaveBeenCalledWith('5511999998888', expect.stringContaining('CentralIA'));
    expect(res.simulated).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'pilot.meta_send_test' }),
    );
  });
});
