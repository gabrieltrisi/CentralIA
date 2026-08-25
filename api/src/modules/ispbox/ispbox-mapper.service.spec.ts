import { IspboxMapperService } from './ispbox-mapper.service';

describe('IspboxMapperService', () => {
  const m = new IspboxMapperService();
  const now = new Date('2026-06-16T12:00:00Z');

  it('normaliza cliente (nome/cpf/telefone)', () => {
    const c = m.customer({ id: 7, nome: 'Fulano', cpf_cnpj: '123', celular: '5511999990000' });
    expect(c).toMatchObject({ ispboxId: '7', nome: 'Fulano', cpfCnpj: '123', telefone: '5511999990000' });
  });

  it('classifica cobrança paga / vencida / aberta', () => {
    expect(m.charge({ id: 1, status: 'paga', valor: 10 }, now).situacao).toBe('paid');
    expect(m.charge({ id: 2, status: 'vencida', valor: 10 }, now).situacao).toBe('overdue');
    expect(m.charge({ id: 3, status: 'aberta', vencimento: '2026-07-01', valor: 10 }, now).situacao).toBe('open');
  });

  it('marca vencida por data de vencimento passada mesmo sem status', () => {
    expect(m.charge({ id: 4, vencimento: '2026-06-01', valor: 10 }, now).situacao).toBe('overdue');
  });

  it('normaliza status de internet (online/offline)', () => {
    expect(m.internetStatus({ online: false, status: 'offline' }).online).toBe(false);
    expect(m.internetStatus({ status: 'ativo/online' }).online).toBe(true);
    expect(m.internetStatus({ status: 'perda de sinal' }).online).toBe(false);
  });
});
