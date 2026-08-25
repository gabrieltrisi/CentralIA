import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { IntegrationLogService } from '../../common/integration-log/integration-log.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { MetaWhatsappSenderService } from './meta-whatsapp-sender.service';

const auditStub = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditLogService;

describe('MetaWhatsappSenderService (sandbox)', () => {
  const httpPost = jest.fn();
  const http = { post: httpPost } as unknown as HttpService;
  const config = { get: (k: string) => (k === 'appMode' ? 'sandbox' : undefined) } as unknown as ConfigService;
  const record = jest.fn().mockResolvedValue(undefined);
  const integrationLog = { record } as unknown as IntegrationLogService;

  beforeEach(() => {
    httpPost.mockClear();
    record.mockClear();
  });

  it('sendText em sandbox NÃO chama a Meta e registra IntegrationLog', async () => {
    const sender = new MetaWhatsappSenderService(http, config, integrationLog, auditStub);
    const r: any = await sender.sendText('5511999998888', 'olá');
    expect(r.simulated).toBe(true);
    expect(httpPost).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ operation: 'sandbox:send:text' }));
  });

  it('sendInteractiveButtons em sandbox não envia para a Meta', async () => {
    const sender = new MetaWhatsappSenderService(http, config, integrationLog, auditStub);
    await sender.sendInteractiveButtons('5511999998888', 'Escolha', [
      { id: 'sim', title: 'Sim' },
      { id: 'nao', title: 'Não' },
    ]);
    expect(httpPost).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ operation: 'sandbox:send:interactive' }));
  });
});
