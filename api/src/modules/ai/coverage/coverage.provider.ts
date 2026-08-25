export interface CoverageResult {
  covered: boolean;
  technology?: 'FIBER' | 'NONE';
  message?: string;
  /** Explicação legível do resultado. */
  reason?: string;
  /** Regra (faixa de CEP / bairro) que casou. */
  matchedRule?: string;
  /** Alternativa sugerida quando não há cobertura (ex.: plano móvel). */
  suggestedAlternative?: string;
}

/**
 * Contrato de verificação de cobertura. Implementações reais consultam o
 * sistema de viabilidade do provedor; a Sprint 1 usa um mock.
 */
export interface CoverageProvider {
  checkByCep(cep: string, companyId?: string): Promise<CoverageResult>;
}

export const COVERAGE_PROVIDER = Symbol('COVERAGE_PROVIDER');
