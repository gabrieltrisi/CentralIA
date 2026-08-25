import { Inject, Injectable } from '@nestjs/common';
import { ConversationStateValue as S } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  COVERAGE_PROVIDER,
  CoverageProvider,
} from '../../coverage/coverage.provider';
import { DataExtractorService } from '../data-extractor.service';
import { ValidationService } from '../validation.service';
import { PlanProviderService } from '../../../knowledge/plan-provider.service';
import { ConversationStateContext } from '../conversation-state-context';
import { FsmFlow, StateHandler, StepResult } from '../flow.types';
import { AgentContext } from '../../ai.types';

function formatBRL(value?: number): string {
  return value != null ? `R$ ${value.toFixed(2).replace('.', ',')}` : 'consultar';
}

const FIELDS = ['nome', 'cpf', 'rg', 'telefone', 'email', 'endereco'] as const;
const LABELS: Record<(typeof FIELDS)[number], string> = {
  nome: 'Qual é o seu nome completo?',
  cpf: 'Qual é o seu CPF?',
  rg: 'Qual é o número do seu RG?',
  telefone: 'Qual é o melhor telefone para contato (com DDD)?',
  email: 'Qual é o seu e-mail?',
  endereco: 'Qual é o seu endereço completo (rua, número, bairro)?',
};

/**
 * Fluxo Comercial completo. Coleta estruturada com contexto acumulado:
 * nunca repete uma pergunta já respondida; pede sempre o próximo campo faltante.
 */
@Injectable()
export class CommercialFlow implements FsmFlow {
  constructor(
    private readonly extractor: DataExtractorService,
    private readonly validation: ValidationService,
    private readonly plans: PlanProviderService,
    private readonly prisma: PrismaService,
    @Inject(COVERAGE_PROVIDER) private readonly coverage: CoverageProvider,
  ) {}

  handlers(): Partial<Record<S, StateHandler>> {
    return {
      [S.COMMERCIAL_SERVICE_SELECTION]: this.serviceSelection,
      [S.COMMERCIAL_CEP]: this.cep,
      [S.COMMERCIAL_COVERAGE_CHECK]: this.coverageCheck,
      [S.COMMERCIAL_PLAN_PRESENTATION]: this.planPresentation,
      [S.COMMERCIAL_DATA_COLLECTION]: this.dataCollection,
      [S.COMMERCIAL_DOCUMENT_UPLOAD]: this.documentUpload,
      [S.COMMERCIAL_SUMMARY]: this.summary,
    };
  }

  private serviceSelection: StateHandler = async (state, agent) => {
    let service = state.getCollected<string>('servico');
    if (!service) service = this.extractor.extractServiceType(agent.lastUserMessage) ?? undefined;
    if (!service) {
      const body = 'Você deseja internet fibra ou plano móvel?';
      return {
        reply: body,
        outbound: [
          {
            kind: 'buttons',
            body,
            buttons: [
              { id: 'fibra', title: 'Internet Fibra' },
              { id: 'movel', title: 'Plano Móvel' },
            ],
          },
        ],
      };
    }

    state.setCollected('servico', service);
    return { goto: service === 'fibra' ? S.COMMERCIAL_CEP : S.COMMERCIAL_PLAN_PRESENTATION };
  };

  private cep: StateHandler = async (state, agent) => {
    if (state.hasCollected('cep')) return { goto: S.COMMERCIAL_COVERAGE_CHECK };
    const cep = this.extractor.extractCep(agent.lastUserMessage);
    if (!cep || !this.validation.isValidCep(cep)) {
      return { reply: 'Para verificar a cobertura, me informe seu CEP (formato 00000-000).' };
    }
    state.setCollected('cep', cep);
    return { goto: S.COMMERCIAL_COVERAGE_CHECK };
  };

  private coverageCheck: StateHandler = async (state, agent, shared) => {
    const cep = state.getCollected<string>('cep')!;
    const result = await this.coverage.checkByCep(cep, agent.customer?.companyId ?? undefined);
    shared.ispboxQueries.push(`Verificação de cobertura (CEP ${cep})`);
    state.setCollected('coverage', result);
    if (!result.covered) {
      // Sem fibra → oferece plano móvel como alternativa.
      state.setCollected('servico', 'movel');
      state.setCollected('noCoverage', true);
      if (result.suggestedAlternative) state.setCollected('suggestedAlternative', result.suggestedAlternative);
    }
    return { goto: S.COMMERCIAL_PLAN_PRESENTATION };
  };

  private planPresentation: StateHandler = async (state, agent) => {
    if (!state.hasCollected('planoApresentado')) {
      const companyId = agent.customer?.companyId ?? undefined;
      const noCoverage = !!state.getCollected('noCoverage');
      const service = (state.getCollected<string>('servico') ?? 'fibra') as 'fibra' | 'movel';
      state.setCollected('planoApresentado', true);

      let body: string;
      if (service === 'movel' || noCoverage) {
        const mobile = await this.plans.getMobilePlans(companyId);
        const list = this.plans.formatPlansForCustomer(mobile);
        state.setCollected('plano', mobile[0]?.name ?? 'Plano Móvel');
        const prefix = noCoverage
          ? 'Não encontrei cobertura de fibra no seu endereço 😕 — mas garantimos conexão com nossos planos móveis:'
          : 'Estes são nossos planos móveis:';
        body = `${prefix}\n${list}\n\nPosso seguir com o seu cadastro?`;
      } else {
        const fiber = await this.plans.getFiberPlans(companyId);
        const recommended = await this.plans.getRecommendedFiberPlan(companyId, state.getCollected<string>('cep'));
        const list = this.plans.formatPlansForCustomer(fiber);
        state.setCollected('plano', recommended?.name ?? fiber[0]?.name ?? 'Plano Fibra');
        const rec = recommended
          ? `\n\n💡 Recomendado para você: ${recommended.name} (${formatBRL(recommended.priceBRL)}).`
          : '';
        body = `✅ Boa notícia: há cobertura de fibra no seu endereço! Conheça nossos planos:\n${list}${rec}\n\nPosso seguir com o seu cadastro?`;
      }

      return {
        reply: body,
        outbound: [
          {
            kind: 'buttons',
            body,
            buttons: [
              { id: 'sim', title: 'Sim, contratar' },
              { id: 'humano', title: 'Falar com atendente' },
            ],
          },
        ],
      };
    }

    const yn = this.extractor.extractYesNo(agent.lastUserMessage);
    if (yn === 'yes') return { goto: S.COMMERCIAL_DATA_COLLECTION };
    if (yn === 'no') {
      return { reply: 'Sem problemas! Quando quiser contratar, é só me chamar. 😊', finished: true, goto: S.FINISHED };
    }
    return { reply: 'Deseja seguir com o cadastro? Responda "sim" ou "não", por favor.' };
  };

  private dataCollection: StateHandler = async (state, agent) => {
    const awaiting = state.getCollected<string>('awaitingField');
    if (awaiting) {
      const parsed = this.parseField(awaiting, agent.lastUserMessage);
      if (parsed.error) return { reply: parsed.error };
      state.setCollected(awaiting, parsed.value);
      state.clearMissingField(awaiting);
      state.setCollected('awaitingField', null);
    }

    const missing = FIELDS.filter((f) => !state.hasCollected(f));
    state.setMissingFields([...missing]);
    if (missing.length === 0) return { goto: S.COMMERCIAL_DOCUMENT_UPLOAD };

    const next = missing[0];
    state.setCollected('awaitingField', next);
    return { reply: LABELS[next] };
  };

  private documentUpload: StateHandler = async (state, agent) => {
    const docs: Record<string, string> = state.getCollected('docs') ?? {};

    // Classifica os anexos reais recebidos nesta mensagem.
    let unknownReceived = false;
    for (const att of agent.attachments ?? []) {
      const kind = this.classifyDocument(att.filename, att.caption, att.mimeType);
      if (kind === 'unknown') {
        unknownReceived = true;
        continue;
      }
      docs[kind] = att.id;
    }
    state.setCollected('docs', docs);

    // Primeira passagem (sem anexos ainda) → solicita os documentos.
    if (!state.hasCollected('docsSolicitados')) {
      state.setCollected('docsSolicitados', true);
      if (!(agent.attachments?.length)) {
        return {
          reply:
            'Para finalizar, envie como anexo: RG ou CNH, CPF (se separado) e comprovante de residência. ' +
            'Aceito imagem (JPG/PNG) ou PDF. 📎',
        };
      }
    }

    const hasIdentidade = !!docs.rg || !!docs.cnh;
    const hasCpf = !!docs.cpf || state.hasCollected('cpf'); // CPF já informado no cadastro
    const hasComprovante = !!docs.comprovante;

    if (unknownReceived) {
      return {
        reply: 'Recebi um documento que não consegui identificar. É RG, CNH, CPF ou comprovante de residência?',
      };
    }
    if (hasIdentidade && hasCpf && hasComprovante) {
      state.setCollected('documentos', Object.keys(docs));
      return { goto: S.COMMERCIAL_SUMMARY };
    }

    const faltando: string[] = [];
    if (!hasIdentidade) faltando.push('documento de identidade (RG ou CNH)');
    if (!hasCpf) faltando.push('CPF');
    if (!hasComprovante) faltando.push('comprovante de residência');
    return { reply: `Ainda preciso de: ${faltando.join(', ')}. 📎` };
  };

  /** Classificação simples por legenda/filename/mime. */
  private classifyDocument(
    filename?: string,
    caption?: string,
    _mime?: string,
  ): 'rg' | 'cnh' | 'cpf' | 'comprovante' | 'unknown' {
    const hay = `${filename ?? ''} ${caption ?? ''}`.toLowerCase();
    if (/cnh|habilita/.test(hay)) return 'cnh';
    if (/\brg\b|identidade/.test(hay)) return 'rg';
    if (/comprovante|residenc|conta de (luz|água|energia)|endere/.test(hay)) return 'comprovante';
    if (/\bcpf\b/.test(hay)) return 'cpf';
    return 'unknown';
  }

  private summary: StateHandler = async (state) => {
    const c = state.collectedData;
    const resumo = [
      'Perfeito! Resumo do seu cadastro:',
      `• Serviço: ${c.servico ?? '—'}`,
      c.cep ? `• CEP: ${c.cep}` : '',
      `• Cobertura: ${c.coverage?.covered ? 'fibra disponível' : (c.noCoverage ? 'sem fibra (móvel)' : '—')}`,
      `• Plano: ${c.plano ?? '—'}`,
      `• Nome: ${c.nome ?? '—'} | CPF: ${c.cpf ?? '—'} | RG: ${c.rg ?? '—'}`,
      `• Telefone: ${c.telefone ?? '—'} | E-mail: ${c.email ?? '—'}`,
      `• Endereço: ${c.endereco ?? '—'}`,
      `• Documentos: ${(c.documentos ?? []).join(', ') || '—'}`,
      'Vou te transferir para um consultor finalizar a contratação. 🙌',
    ]
      .filter(Boolean)
      .join('\n');
    state.historySummary = resumo;
    return { reply: resumo, escalateReason: 'NEGOTIATION', goto: S.HUMAN_HANDOFF };
  };

  // ---- helpers ----
  private parseField(
    field: string,
    msg: string,
  ): { value?: string; error?: string } {
    switch (field) {
      case 'nome': {
        const v = this.extractor.extractName(msg);
        return v ? { value: v } : { error: 'Não entendi seu nome. Pode informar o nome completo?' };
      }
      case 'cpf': {
        const v = this.extractor.extractCpf(msg);
        return v && this.validation.isValidCpfFormat(v)
          ? { value: v }
          : { error: 'CPF inválido. Informe no formato 000.000.000-00.' };
      }
      case 'rg': {
        const v = msg.trim();
        return v.length >= 4 ? { value: v } : { error: 'Informe um RG válido, por favor.' };
      }
      case 'telefone': {
        const v = this.extractor.extractPhone(msg);
        return v && this.validation.isValidPhone(v)
          ? { value: v }
          : { error: 'Telefone inválido. Informe com DDD (ex.: 11999998888).' };
      }
      case 'email': {
        const v = this.extractor.extractEmail(msg);
        return v && this.validation.isValidEmail(v)
          ? { value: v }
          : { error: 'E-mail inválido. Pode repetir, por favor?' };
      }
      case 'endereco': {
        const v = msg.trim();
        return v.length >= 8 ? { value: v } : { error: 'Informe o endereço completo (rua, número, bairro).' };
      }
      default:
        return { value: msg.trim() };
    }
  }
}
