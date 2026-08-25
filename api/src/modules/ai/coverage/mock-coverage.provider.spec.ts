import { MockCoverageProvider } from './mock-coverage.provider';
import { KnowledgeProviderService } from '../../knowledge/knowledge-provider.service';

const COBERTURA = {
  id: 'cov-1',
  category: 'COMERCIAL_COBERTURA',
  title: 'Áreas de cobertura de fibra',
  content:
    'Faixas de CEP com cobertura de fibra:\n' +
    '01000-000 a 01999-999\n' +
    '04500-000 a 04599-999\n' +
    'Bairros atendidos: Centro, Vila Mariana, Pinheiros.',
} as any;

function makeProvider(articles: any[]) {
  const knowledge = {
    findByCategory: jest.fn().mockResolvedValue(articles),
  } as unknown as KnowledgeProviderService;
  return new MockCoverageProvider(knowledge);
}

describe('MockCoverageProvider (cobertura por base de conhecimento)', () => {
  it('reconhece CEP dentro de uma faixa coberta', async () => {
    const r = await makeProvider([COBERTURA]).checkByCep('01001-000');
    expect(r.covered).toBe(true);
    expect(r.technology).toBe('FIBER');
    expect(r.matchedRule).toMatch(/01000-000 a 01999-999/);
  });

  it('rejeita CEP fora das faixas e sugere alternativa móvel', async () => {
    const r = await makeProvider([COBERTURA]).checkByCep('09000-000');
    expect(r.covered).toBe(false);
    expect(r.technology).toBe('NONE');
    expect(r.suggestedAlternative).toMatch(/móvel/i);
    expect(r.reason).toMatch(/fora/i);
  });

  it('reconhece a segunda faixa cadastrada', async () => {
    const r = await makeProvider([COBERTURA]).checkByCep('04550-123');
    expect(r.covered).toBe(true);
    expect(r.matchedRule).toMatch(/04500-000 a 04599-999/);
  });

  it('CEP inválido (menos de 8 dígitos) é rejeitado', async () => {
    const r = await makeProvider([COBERTURA]).checkByCep('123');
    expect(r.covered).toBe(false);
    expect(r.message).toMatch(/inválido/i);
  });

  it('sem faixas cadastradas, recai para a heurística determinística', async () => {
    const provider = makeProvider([]);
    expect((await provider.checkByCep('01001-000')).covered).toBe(true); // termina em 0 (par)
    expect((await provider.checkByCep('01001-001')).covered).toBe(false); // termina em 1 (ímpar)
  });
});
