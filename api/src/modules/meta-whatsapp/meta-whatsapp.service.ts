import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUES } from '../../queue/queues.constants';

/**
 * Concerns de webhook do WhatsApp (verificação, enfileiramento, marcação).
 * O envio fica em MetaWhatsappSenderService; o parsing em MetaWhatsappMessageParser.
 */
@Injectable()
export class MetaWhatsappService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUES.WHATSAPP_INBOUND) private readonly inbound: Queue,
  ) {}

  verifyToken(token: string): boolean {
    return token === this.config.get<string>('meta.verifyToken');
  }

  /** Persiste o evento bruto e o enfileira para processamento assíncrono. */
  async enqueueInbound(payload: any): Promise<void> {
    const event = await this.prisma.webhookEvent.create({
      data: { provider: 'meta', payload, processed: false },
    });
    await this.inbound.add('inbound', { webhookEventId: event.id, payload });
  }

  markProcessed(webhookEventId: string) {
    return this.prisma.webhookEvent.update({
      where: { id: webhookEventId },
      data: { processed: true },
    });
  }
}
