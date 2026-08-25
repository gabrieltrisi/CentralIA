import { Injectable } from '@nestjs/common';
import { CustomersService } from '../../customers/customers.service';
import { IspboxService } from '../../ispbox/ispbox.service';
import { AiService } from '../ai.service';
import { AgentContext, AgentResult } from '../ai.types';

/**
 * Agente Financeiro. Fluxo:
 * 1) identificar cliente → 2) buscar cobranças → 3) exibir pendências
 * → 4) gerar PIX → 5) gerar PDF → 6) registrar histórico.
 */
@Injectable()
export class FinancialAgent {
  private static readonly SYSTEM = [
    'Você é o agente FINANCEIRO de um provedor de internet, no WhatsApp, em pt-BR.',
    'Ajude com 2ª via, cobranças e PIX. Nunca invente valores: use apenas os dados fornecidos.',
    'Se houver pendências, liste-as de forma clara e ofereça gerar o PIX ou o PDF.',
    'Seja objetivo e cordial.',
  ].join(' ');

  constructor(
    private readonly ai: AiService,
    private readonly customers: CustomersService,
    private readonly ispbox: IspboxService,
  ) {}

  async handle(ctx: AgentContext): Promise<AgentResult> {
    const ispboxQueries: string[] = [];
    const customer =
      ctx.customer ??
      (ctx.contact ? await this.customers.findByPhone(ctx.contact) : null);

    if (!customer?.ispboxId) {
      const fallback =
        'Para localizar seu cadastro, poderia me informar o CPF ou CNPJ do titular?';
      const reply = this.ai.isEnabled()
        ? await this.ai.chat({
            system: FinancialAgent.SYSTEM,
            user:
              `Cliente não identificado. Última mensagem: "${ctx.lastUserMessage}". ` +
              'Peça o CPF/CNPJ para localizar o cadastro.',
          })
        : fallback;
      return { reply, ispboxQueries };
    }

    const service = customer.services?.[0];
    let charges: any[] = [];
    if (service?.ispboxServiceId) {
      try {
        charges =
          (await this.ispbox.listCharges(
            customer.ispboxId,
            service.ispboxServiceId,
            {},
          )) ?? [];
        ispboxQueries.push('Listagem de cobranças');
      } catch {
        ispboxQueries.push('Listagem de cobranças (falhou)');
      }
    }

    const pending = charges.filter(
      (c) => !/pag/i.test(String(c?.status ?? '')),
    );

    // Tenta gerar PIX + PDF da primeira pendência se o cliente pediu.
    let pixNote = '';
    let pdfNote = '';
    const wantsPix = /pix|qr|2.?via|segunda via|pagar|boleto|fatura/i.test(
      ctx.lastUserMessage,
    );
    if (wantsPix && pending[0] && service?.ispboxServiceId) {
      const chargeId = String(pending[0].id);
      try {
        const pix: any = await this.ispbox.generatePaymentQrCode(
          customer.ispboxId,
          service.ispboxServiceId,
          chargeId,
        );
        ispboxQueries.push('Geração de QR Code PIX');
        const code = pix?.copia_cola ?? pix?.qrcode ?? '';
        pixNote = code ? `PIX copia-e-cola:\n${code}` : 'PIX gerado.';
      } catch {
        ispboxQueries.push('Geração de QR Code PIX (falhou)');
      }
      try {
        const pdf = await this.ispbox.chargePaymentPdf(
          customer.ispboxId,
          service.ispboxServiceId,
          chargeId,
        );
        ispboxQueries.push('Geração do PDF do boleto');
        pdfNote = `Boleto em PDF gerado (${pdf.length} bytes).`;
      } catch {
        ispboxQueries.push('Geração do PDF do boleto (falhou)');
      }
    }

    const pendingSummary =
      pending.length > 0
        ? pending
            .map(
              (c) =>
                `- Cobrança ${c.id}: R$ ${c.valor ?? '—'} (venc. ${c.vencimento ?? '—'}, ${c.status ?? '—'})`,
            )
            .join('\n')
        : 'Nenhuma pendência encontrada.';

    const fallback = [
      `Olá, ${customer.name}! Encontrei o seguinte:`,
      pendingSummary,
      pixNote,
      pdfNote,
      !wantsPix ? 'Posso gerar o PIX e o boleto em PDF, se desejar.' : '',
    ]
      .filter(Boolean)
      .join('\n');

    const reply = this.ai.isEnabled()
      ? await this.ai.chat({
          system: FinancialAgent.SYSTEM,
          user: [
            `Cliente: ${customer.name}`,
            `Pendências:\n${pendingSummary}`,
            pixNote,
            pdfNote,
            `Última mensagem do cliente: "${ctx.lastUserMessage}"`,
            'Responda ao cliente com base apenas nestes dados.',
          ].join('\n'),
        })
      : fallback;

    return { reply, ispboxQueries };
  }
}
