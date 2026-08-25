import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUES } from '../queue/queue.module';
import { DeadLetterService } from '../queue/dead-letter.service';
import { MetaWhatsappSenderService } from '../modules/meta-whatsapp/meta-whatsapp-sender.service';

/** Envio assíncrono outbound (texto / botões / documento / imagem). */
@Processor(QUEUES.WHATSAPP_OUTBOUND)
export class WhatsappOutboundProcessor extends WorkerHost {
  private readonly logger = new Logger('WhatsappOutboundProcessor');

  constructor(
    private readonly sender: MetaWhatsappSenderService,
    private readonly deadLetter: DeadLetterService,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    const d = job.data as {
      to: string;
      kind?: 'text' | 'buttons' | 'document' | 'image';
      text?: string;
      body?: string;
      buttons?: { id: string; title: string }[];
      url?: string;
      filename?: string;
      caption?: string;
    };
    this.logger.log(`Enviando WhatsApp(${d.kind ?? 'text'}) para ${d.to}`);

    switch (d.kind) {
      case 'buttons':
        return this.sender.sendInteractiveButtons(d.to, d.body ?? d.text ?? '', d.buttons ?? []);
      case 'image':
        return this.sender.sendImage(d.to, d.url!, d.caption);
      case 'document':
        return this.sender.sendDocument(d.to, d.url!, d.filename ?? 'arquivo', d.caption);
      default:
        return this.sender.sendText(d.to, d.text ?? d.body ?? '');
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    return this.deadLetter.handleFailure(QUEUES.WHATSAPP_OUTBOUND, job, err);
  }
}
