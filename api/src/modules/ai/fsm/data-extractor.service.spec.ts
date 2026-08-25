import { DataExtractorService } from './data-extractor.service';

describe('DataExtractorService', () => {
  const ex = new DataExtractorService();

  it('extractCep normaliza para 00000-000', () => {
    expect(ex.extractCep('meu cep é 01001000')).toBe('01001-000');
    expect(ex.extractCep('01001-000')).toBe('01001-000');
    expect(ex.extractCep('sem cep aqui')).toBeNull();
  });

  it('extractCpf normaliza com máscara', () => {
    expect(ex.extractCpf('cpf 12345678900')).toBe('123.456.789-00');
    expect(ex.extractCpf('123.456.789-00')).toBe('123.456.789-00');
    expect(ex.extractCpf('nada')).toBeNull();
  });

  it('extractEmail', () => {
    expect(ex.extractEmail('contato gabriel@email.com ok')).toBe('gabriel@email.com');
    expect(ex.extractEmail('sem email')).toBeNull();
  });

  it('extractPhone retorna dígitos (10-13)', () => {
    expect(ex.extractPhone('meu telefone é (11) 95555-4444')).toBe('11955554444');
    expect(ex.extractPhone('123')).toBeNull();
  });

  it('extractName remove prefixos e valida', () => {
    expect(ex.extractName('Meu nome é Gabriel de Macedo Trisi')).toBe('Gabriel de Macedo Trisi');
    expect(ex.extractName('Gabriel Trisi')).toBe('Gabriel Trisi');
    expect(ex.extractName('123')).toBeNull();
  });

  it('extractServiceType', () => {
    expect(ex.extractServiceType('quero internet fibra')).toBe('fibra');
    expect(ex.extractServiceType('plano móvel')).toBe('movel');
    expect(ex.extractServiceType('quero algo')).toBeNull();
  });

  it('extractYesNo (não antes de sim)', () => {
    expect(ex.extractYesNo('sim, quero')).toBe('yes');
    expect(ex.extractYesNo('não quero')).toBe('no');
    expect(ex.extractYesNo('talvez')).toBeNull();
  });
});
