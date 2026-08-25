import { Injectable } from '@nestjs/common';
import { CoverageProvider, CoverageResult } from './coverage.provider';
import { KnowledgeProviderService } from '../../knowledge/knowledge-provider.service';

interface CepRange {
  start: number;
  end: number;
  raw: string;
}

/**
 * Cobertura realista lida da base de conhecimento (categoria
 * `COMERCIAL_COBERTURA`). Suporta faixas de CEP ("01000-000 a 01999-999") e
 * lista de bairros/cidades em texto. Sem regras cadastradas, recai para uma
 * heurística determinística (último dígito par = coberto), preservando os
 * fluxos de demo/sandbox quando a base está vazia.
 */
@Injectable()
export class MockCoverageProvider implements CoverageProvider {
  constructor(private readonly knowledge: KnowledgeProviderService) {}

  async checkByCep(cep: string, companyId?: string): Promise<CoverageResult> {
    const digits = cep.replace(/\D/g, '');
    if (digits.length < 8) {
      return { covered: false, technology: 'NONE', message: 'CEP inválido.', reason: 'CEP inválido (precisa de 8 dígitos).' };
    }
    const cepNum = parseInt(digits.slice(0, 8), 10);

    const articles = await this.knowledge.findByCategory('COMERCIAL_COBERTURA', companyId);
    const ranges = articles.flatMap((a) => this.parseRanges(a.content));
    const neighborhoods = articles.flatMap((a) => this.parseNeighborhoods(a.content));

    // Sem regras → heurística determinística.
    if (ranges.length === 0) {
      const covered = parseInt(digits[digits.length - 1], 10) % 2 === 0;
      return covered
        ? { covered: true, technology: 'FIBER', message: 'Há cobertura de fibra.', reason: 'Heurística padrão (sem faixas cadastradas).' }
        : { covered: false, technology: 'NONE', message: 'Sem cobertura no momento.', reason: 'Heurística padrão (sem faixas cadastradas).', suggestedAlternative: 'Plano Móvel' };
    }

    const match = ranges.find((r) => cepNum >= r.start && cepNum <= r.end);
    if (match) {
      return {
        covered: true,
        technology: 'FIBER',
        message: 'Há cobertura de fibra no seu endereço.',
        reason: 'CEP dentro de uma área de cobertura de fibra.',
        matchedRule: match.raw,
      };
    }

    return {
      covered: false,
      technology: 'NONE',
      message: 'Sem cobertura de fibra no seu endereço.',
      reason: 'CEP fora das faixas de cobertura de fibra.',
      matchedRule: neighborhoods.length ? `Bairros atendidos: ${neighborhoods.join(', ')}` : undefined,
      suggestedAlternative: 'Plano Móvel',
    };
  }

  /** Faixas "01000-000 a 01999-999" (separador: a | até | — | -). */
  private parseRanges(content: string): CepRange[] {
    const re = /(\d{5}-?\d{3})\s*(?:a|até|—|–|-{1,2}|->)\s*(\d{5}-?\d{3})/gi;
    const out: CepRange[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const start = parseInt(m[1].replace(/\D/g, ''), 10);
      const end = parseInt(m[2].replace(/\D/g, ''), 10);
      if (!Number.isNaN(start) && !Number.isNaN(end) && start <= end) {
        out.push({ start, end, raw: `${m[1]} a ${m[2]}` });
      }
    }
    return out;
  }

  /** Lista de bairros após "Bairros atendidos:". */
  private parseNeighborhoods(content: string): string[] {
    const m = content.match(/bairros?\s+atendidos?\s*:\s*([^\n.]+)/i);
    if (!m) return [];
    return m[1]
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
}
