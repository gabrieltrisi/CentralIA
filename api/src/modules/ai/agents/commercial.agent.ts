import { Inject, Injectable } from '@nestjs/common';
import { AiService } from '../ai.service';
import { AgentContext, AgentResult } from '../ai.types';
import {
  COVERAGE_PROVIDER,
  CoverageProvider,
} from '../coverage/coverage.provider';

/**
 * Agente Comercial. Conduz o fluxo de contratação:
 * 1) serviço desejado (Fibra/Móvel) → 2) CEP (se Fibra) → 3) cobertura
 * → 4) dados cadastrais → 5) documentos → 6) resumo → 7) transferir humano.
 *
 * A condução conversacional é guiada por prompt; a verificação de cobertura é
 * determinística via CoverageProvider quando um CEP é detectado.
 */
@Injectable()
export class CommercialAgent {
  private static readonly SYSTEM = [
    'Você é o agente COMERCIAL de um provedor de internet, no WhatsApp, em pt-BR.',
    'Siga rigorosamente este fluxo, um passo por vez:',
    '1. Pergunte qual serviço deseja: Fibra ou Móvel.',
    '2. Se Fibra, peça o CEP para verificar cobertura.',
    '3. Informe o resultado de cobertura (fornecido no contexto, se houver).',
    '4. Colete: Nome, CPF, RG, Telefone, Email e Endereço.',
    '5. Solicite os documentos: RG, CPF e comprovante de residência.',
    '6. Faça um resumo dos dados coletados.',
    '7. Avise que vai transferir para um atendente humano finalizar.',
    'Seja cordial e objetivo. Faça apenas uma pergunta por mensagem.',
  ].join(' ');

  constructor(
    private readonly ai: AiService,
    @Inject(COVERAGE_PROVIDER)
    private readonly coverage: CoverageProvider,
  ) {}

  async handle(ctx: AgentContext): Promise<AgentResult> {
    const ispboxQueries: string[] = [];
    let coverageNote = '';

    const cep = this.extractCep(ctx.lastUserMessage);
    if (cep) {
      const result = await this.coverage.checkByCep(cep);
      coverageNote = `Cobertura para CEP ${cep}: ${result.message ?? (result.covered ? 'disponível' : 'indisponível')}`;
      ispboxQueries.push(`Verificação de cobertura (CEP ${cep})`);
    }

    // Pedido explícito de humano encerra para transferência.
    if (/atendente|humano|pessoa|consultor/i.test(ctx.lastUserMessage)) {
      return {
        reply: 'Claro! Vou te transferir para um de nossos consultores. Um momento, por favor.',
        escalateReason: 'NEGOTIATION',
        ispboxQueries,
      };
    }

    // Serviço já está claro na mensagem → NÃO repetir a pergunta "Fibra ou Móvel?".
    // (Sprint 15.1, item 10) Se mencionou fibra e ainda não deu CEP, vai direto ao CEP;
    // se mencionou móvel, segue para o plano móvel.
    if (!cep) {
      const svc = this.detectService(ctx.lastUserMessage);
      if (svc === 'fibra') {
        return {
          reply: 'Ótimo, internet fibra! 🚀 Me envie o seu CEP (formato 00000-000) que eu já verifico a cobertura no seu endereço.',
          ispboxQueries,
        };
      }
      if (svc === 'movel') {
        return {
          reply: 'Perfeito, plano móvel! 📱 Temos pacotes com ligações ilimitadas a partir de R$ 49,90. Me informe seu nome completo e o melhor telefone para eu seguir com a proposta.',
          ispboxQueries,
        };
      }
    }

    const conversation = ctx.history
      .slice(-10)
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    const fallback = coverageNote
      ? `${coverageNote} Plano exemplo: Fibra 500MB por R$ 119,90/mês, instalação grátis. ` +
        'Para seguir, me informe seu nome completo, CPF e o melhor telefone para contato.'
      : 'Você prefere internet por Fibra ou plano Móvel? Se for Fibra, me envie seu CEP para eu verificar a cobertura.';

    const reply = this.ai.isEnabled()
      ? await this.ai.chat({
          system: CommercialAgent.SYSTEM,
          user: [
            coverageNote ? `Contexto de cobertura: ${coverageNote}` : '',
            `Conversa:\n${conversation}`,
            `Última mensagem do cliente: "${ctx.lastUserMessage}"`,
            'Responda conduzindo o próximo passo do fluxo.',
          ].join('\n'),
        })
      : fallback;

    return { reply, ispboxQueries };
  }

  private extractCep(text: string): string | null {
    const match = text.match(/\b\d{5}-?\d{3}\b/);
    return match ? match[0] : null;
  }

  /** Detecta o serviço desejado já mencionado pelo cliente (determinístico). */
  private detectService(text: string): 'fibra' | 'movel' | null {
    const t = (text ?? '').toLowerCase();
    if (/\bfibra\b|fibr[ao]|internet\s+fixa|banda\s*larga/.test(t)) return 'fibra';
    if (/\bm[óo]vel\b|movel|celular|\bchip\b|plano\s+m[óo]vel/.test(t)) return 'movel';
    return null;
  }
}
