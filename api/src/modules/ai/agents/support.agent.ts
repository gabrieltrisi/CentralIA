import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TicketType } from '@prisma/client';
import { Queue } from 'bullmq';
import { QUEUES } from '../../../queue/queue.module';
import { CustomersService } from '../../customers/customers.service';
import { IspboxService } from '../../ispbox/ispbox.service';
import { TicketsService } from '../../tickets/tickets.service';
import { AiService } from '../ai.service';
import { AgentContext, AgentResult } from '../ai.types';

/**
 * Agente de Suporte. Fluxo:
 * 1) identificar cliente → 2) buscar serviços ISPBOX → 3) status da internet
 * → 4) verificar incidente → 5) solicitar vídeo se necessário → 6) criar Ticket
 * → 7) abrir OS ISPBOX automaticamente → 8) gerar resumo.
 */
@Injectable()
export class SupportAgent {
  private static readonly SYSTEM = [
    'Você é o agente de SUPORTE técnico de um provedor de internet, no WhatsApp, em pt-BR.',
    'Ajude com problemas de conexão. Oriente passos básicos (reiniciar ONU/roteador, checar cabos).',
    'Se o status indicar que o serviço está OFFLINE/bloqueado, informe que abrirá um chamado técnico.',
    'Se precisar de evidência, peça um vídeo curto mostrando os LEDs do equipamento.',
    'Seja objetivo e cordial. Uma pergunta por mensagem.',
  ].join(' ');

  constructor(
    private readonly ai: AiService,
    private readonly customers: CustomersService,
    private readonly ispbox: IspboxService,
    private readonly tickets: TicketsService,
    private readonly config: ConfigService,
    @InjectQueue(QUEUES.TICKET_PROCESSING) private readonly ticketQueue: Queue,
  ) {}

  async handle(ctx: AgentContext): Promise<AgentResult> {
    const ispboxQueries: string[] = [];
    const customer =
      ctx.customer ??
      (ctx.contact ? await this.customers.findByPhone(ctx.contact) : null);

    let statusNote = '';
    let offline = false;
    const service = customer?.services?.[0];

    if (customer?.ispboxId && service?.ispboxServiceId) {
      try {
        const status: any = await this.ispbox.internetStatus(
          customer.ispboxId,
          service.ispboxServiceId,
        );
        ispboxQueries.push('Consulta de status da internet');
        offline = status?.online === false || /offline|bloq/i.test(String(status?.status ?? ''));
        statusNote = `Status da internet: ${offline ? 'OFFLINE/instável' : 'online'}`;
      } catch {
        ispboxQueries.push('Consulta de status da internet (falhou)');
      }
    }

    // Incidente confirmado → cria ticket e abre OS automaticamente.
    if (offline && customer) {
      const ticket = await this.tickets.create({
        type: TicketType.SUPPORT,
        summary: `Sem conexão — ${customer.name}`,
        customerId: customer.id,
        conversationId: ctx.conversationId,
      });
      await this.ticketQueue.add('open-os', {
        ticketId: ticket.id,
        ispboxClientId: customer.ispboxId,
        ispboxServiceId: service?.ispboxServiceId,
        tipoId: this.config.get<string>('ispbox.defaultOsTypeId'),
        assunto: 'Sem conexão de internet',
        descricao: `Aberto automaticamente via atendimento (conversa ${ctx.conversationId}).`,
      });
      ispboxQueries.push('Abertura de OS (enfileirada)');

      return {
        reply:
          'Identifiquei uma instabilidade no seu serviço. Já abri um chamado técnico ' +
          'e nossa equipe vai atuar. Se possível, envie um vídeo curto mostrando os LEDs ' +
          'da sua ONU/roteador para agilizarmos o diagnóstico. Você receberá atualizações por aqui.',
        ispboxQueries,
      };
    }

    const conversation = ctx.history
      .slice(-10)
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    const fallback =
      'Vamos tentar o básico: reinicie sua ONU/roteador por 30 segundos e verifique se os LEDs ' +
      'de energia e fibra (PON) estão acesos. Me conte como ficou após reiniciar.';

    const reply = this.ai.isEnabled()
      ? await this.ai.chat({
          system: SupportAgent.SYSTEM,
          user: [
            customer ? `Cliente identificado: ${customer.name}` : 'Cliente não identificado.',
            statusNote,
            `Conversa:\n${conversation}`,
            `Última mensagem do cliente: "${ctx.lastUserMessage}"`,
          ].join('\n'),
        })
      : fallback;

    return { reply, ispboxQueries };
  }
}
