import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationStatus } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { IntegrationLogService } from '../../common/integration-log/integration-log.service';
import { AuditLogService } from '../../common/audit/audit-log.service';

export interface InteractiveButton {
  id: string;
  title: string;
}

/**
 * Camada robusta de envio para a WhatsApp Cloud API.
 * Em APP_MODE=sandbox NÃO envia para a Meta: registra IntegrationLog e log JSON.
 */
@Injectable()
export class MetaWhatsappSenderService {
  private readonly logger = new Logger(MetaWhatsappSenderService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly integrationLog: IntegrationLogService,
    private readonly audit: AuditLogService,
  ) {}

  sendText(to: string, message: string) {
    return this.send('text', to, { type: 'text', text: { body: message } });
  }

  sendImage(to: string, url: string, caption?: string) {
    return this.send('image', to, { type: 'image', image: { link: url, caption } });
  }

  sendDocument(to: string, url: string, filename: string, caption?: string) {
    return this.send('document', to, {
      type: 'document',
      document: { link: url, filename, caption },
    });
  }

  sendInteractiveButtons(to: string, body: string, buttons: InteractiveButton[]) {
    return this.send('interactive', to, {
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: body },
        action: {
          buttons: buttons.slice(0, 3).map((b) => ({
            type: 'reply',
            reply: { id: b.id, title: b.title.slice(0, 20) },
          })),
        },
      },
    });
  }

  private async send(kind: string, to: string, partial: Record<string, unknown>) {
    const payload = { messaging_product: 'whatsapp', to, ...partial };

    if (this.config.get<string>('appMode') === 'sandbox') {
      this.logger.log(`[SANDBOX] WhatsApp(${kind}) → ${to}: ${JSON.stringify(partial)}`);
      await this.integrationLog.record({
        provider: 'meta',
        operation: `sandbox:send:${kind}`,
        request: { to, payload },
        response: { simulated: true },
        status: IntegrationStatus.SUCCESS,
      });
      return { simulated: true, to, kind };
    }

    const version = this.config.get<string>('meta.graphVersion');
    const phoneId = this.config.get<string>('meta.phoneNumberId');
    const accessToken = this.config.get<string>('meta.accessToken');
    const url = `https://graph.facebook.com/${version}/${phoneId}/messages`;

    try {
      const { data } = await firstValueFrom(
        this.http.post(url, payload, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      );
      await this.integrationLog.record({
        provider: 'meta',
        operation: `send:${kind}`,
        request: { to },
        response: { ok: true },
        status: IntegrationStatus.SUCCESS,
      });
      await this.audit.record({
        actorType: 'system',
        action: 'outbound.send',
        entityType: 'whatsapp',
        entityId: to,
        metadata: { kind },
      });
      return data;
    } catch (err) {
      this.logger.error(`Falha ao enviar WhatsApp(${kind}): ${(err as Error).message}`);
      await this.integrationLog.record({
        provider: 'meta',
        operation: `send:${kind}`,
        request: { to },
        response: { message: (err as Error).message },
        status: IntegrationStatus.ERROR,
      });
      throw err;
    }
  }
}
