import { bullBoardPolicy, basicAuth } from './bull-board.setup';

describe('Bull Board — proteção', () => {
  it('produção sem credenciais → não monta', () => {
    expect(bullBoardPolicy(false, '', '')).toEqual({ mount: false, auth: false });
  });

  it('sandbox → sempre acessível sem auth (piloto), com ou sem credenciais', () => {
    expect(bullBoardPolicy(true, '', '')).toEqual({ mount: true, auth: false });
    expect(bullBoardPolicy(true, 'admin', 'secret')).toEqual({ mount: true, auth: false });
  });

  it('produção com credenciais → monta com basic-auth', () => {
    expect(bullBoardPolicy(false, 'admin', 'secret')).toEqual({ mount: true, auth: true });
  });

  it('basicAuth aceita credenciais corretas e rejeita incorretas', () => {
    const mw = basicAuth('admin', 'secret');
    const next = jest.fn();
    const okHeader = 'Basic ' + Buffer.from('admin:secret').toString('base64');
    mw({ headers: { authorization: okHeader } } as any, { set: jest.fn(), status: jest.fn(), send: jest.fn() } as any, next);
    expect(next).toHaveBeenCalled();

    const res = { set: jest.fn(), status: jest.fn().mockReturnThis(), send: jest.fn() } as any;
    const next2 = jest.fn();
    const badHeader = 'Basic ' + Buffer.from('admin:wrong').toString('base64');
    mw({ headers: { authorization: badHeader } } as any, res, next2);
    expect(next2).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
