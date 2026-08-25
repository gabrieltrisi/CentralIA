import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { MessageRole } from '@prisma/client';
import { Job } from 'bullmq';
import { QUEUES } from '../queue/queue.module';
import { DeadLetterService } from '../queue/dead-letter.service';
import { RequestContext } from '../common/context/request-context';
import { MediaKind } from '../common/storage/file-security.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/audit/audit-log.service';
import { ConversationsService } from '../modules/conversations/conversations.service';
import { CustomersService } from '../modules/customers/customers.service';
import { AiOrchestratorService } from '../modules/ai/ai-orchestrator.service';
import { IncomingAttachment } from '../modules/ai/ai.types';
import { MetaWhatsappService } from '../modules/meta-whatsapp/meta-whatsapp.service';
import { MetaWhatsappMessageParser, NormalizedMessage } from '../modules/meta-whatsapp/meta-whatsapp-message.parser';
import { MetaWhatsappMediaService } from '../modules/meta-whatsapp/meta-whatsapp-media.service';
import { PilotService } from '../modules/pilot/pilot.service';

const MEDIA_TYPES: MediaKind[] = ['image', 'document', 'video', 'audio'];

/**
 * Pipeline WhatsApp inbound: parse (texto/mídia/interactive) → download de mídia
 * → Conversation/Message/Attachment → Orquestrador (Supervisor/Agente/FSM).
 */
@Processor(QUEUES.WHATSAPP_INBOUND)
export class WhatsappInboundProcessor extends WorkerHost {
  private readonly logger = new Logger('WhatsappInboundProcessor');

  constructor(
    private readonly meta: MetaWhatsappService,
    private readonly parser: MetaWhatsappMessageParser,
    private readonly media: MetaWhatsappMediaService,
    private readonly conversations: ConversationsService,
    private readonly customers: CustomersService,
    private readonly orchestrator: AiOrchestratorService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly deadLetter: DeadLetterService,
    private readonly pilot: PilotService,
  ) {
    super();
  }

  process(job: Job): Promise<unknown> {
    return RequestContext.run({}, () => this.handle(job));
  }

  private async handle(job: Job): Promise<unknown> {
    const { webhookEventId, payload } = job.data as {
      webhookEventId?: string;
      payload: unknown;
    };

    const messages = this.parser.parse(payload);
    for (const msg of messages) {
      await this.handleMessage(msg);
    }

    if (webhookEventId) await this.meta.markProcessed(webhookEventId);
    return { processed: messages.length };
  }

  private async handleMessage(msg: NormalizedMessage): Promise<void> {
    // Piloto controlado: fora da allowlist, não responde nem aciona o FSM.
    // O evento bruto já foi salvo (WebhookEvent) ao enfileirar.
    if (!this.pilot.isPhoneAllowed(msg.waId)) {
      this.logger.warn(
        JSON.stringify({ event: 'pilot.phone_not_allowed', waId: this.pilot.mask(msg.waId) }),
      );
      await this.audit.record({
        actorType: 'system',
        action: 'pilot.phone_not_allowed',
        entityType: 'whatsapp',
        entityId: this.pilot.mask(msg.waId),
      });
      return;
    }

    // Idempotência: reenvio da Meta não deve reprocessar.
    if (msg.providerMessageId) {
      const existing = await this.prisma.message.findUnique({
        where: { externalId: msg.providerMessageId },
      });
      if (existing) {
        this.logger.log(
          JSON.stringify({
            event: 'duplicate_webhook_ignored',
            messageId: msg.providerMessageId,
            correlationId: RequestContext.get()?.correlationId,
          }),
        );
        await this.audit.record({
          actorType: 'meta',
          action: 'webhook.duplicate_ignored',
          entityType: 'message',
          entityId: msg.providerMessageId,
        });
        return;
      }
    }

    const customer = await this.customers.findByPhone(msg.waId);
    const conversation = await this.conversations.findOrCreateByContact(
      msg.waId,
      customer?.id,
      customer?.companyId,
    );

    const content = msg.text || `[${msg.type}]`;
    let message;
    try {
      message = await this.conversations.addMessage({
        conversationId: conversation.id,
        role: MessageRole.CUSTOMER,
        content,
        externalId: msg.providerMessageId,
        metadata: { type: msg.type, mediaId: msg.mediaId },
      });
    } catch (err) {
      // Corrida de unicidade (P2002): tratado como duplicado.
      if ((err as { code?: string }).code === 'P2002') {
        this.logger.log(
          JSON.stringify({ event: 'duplicate_webhook_ignored', messageId: msg.providerMessageId }),
        );
        return;
      }
      throw err;
    }

    this.logger.log(
      JSON.stringify({
        provider: 'meta',
        messageId: msg.providerMessageId,
        waId: this.pilot.mask(msg.waId),
        conversationId: conversation.id,
        type: msg.type,
        correlationId: RequestContext.get()?.correlationId,
      }),
    );

    const attachments: IncomingAttachment[] = [];
    if (msg.mediaId && MEDIA_TYPES.includes(msg.type as MediaKind)) {
      try {
        const att = await this.media.ingest({
          conversationId: conversation.id,
          messageId: message.id,
          mediaId: msg.mediaId,
          type: msg.type as MediaKind,
          mimeType: msg.mimeType,
          filename: msg.filename,
        });
        attachments.push({
          id: att.id,
          type: att.type ?? msg.type,
          mimeType: att.mimeType ?? undefined,
          filename: att.filename ?? undefined,
          caption: msg.text,
        });
      } catch (err) {
        this.logger.warn(`Falha ao ingerir mídia ${msg.mediaId}: ${(err as Error).message}`);
      }
    }

    await this.orchestrator.handleIncoming(conversation.id, msg.text ?? '', {
      type: msg.type,
      attachments,
    });
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    return this.deadLetter.handleFailure(QUEUES.WHATSAPP_INBOUND, job, err);
  }
}
