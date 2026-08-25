import { EventsService, EVENTS } from './events.service';
import { EventsGateway } from './events.gateway';

describe('EventsService', () => {
  it('emite para a sala da empresa', () => {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    const gateway = { server: { to } } as unknown as EventsGateway;
    const svc = new EventsService(gateway);

    svc.emit('comp-1', EVENTS.MESSAGE_CREATED, { conversationId: 'c1' });

    expect(to).toHaveBeenCalledWith('company:comp-1');
    expect(emit).toHaveBeenCalledWith('message.created', { conversationId: 'c1' });
  });

  it('não emite sem companyId', () => {
    const to = jest.fn();
    const gateway = { server: { to } } as unknown as EventsGateway;
    new EventsService(gateway).emit(null, EVENTS.CONVERSATION_UPDATED, {});
    expect(to).not.toHaveBeenCalled();
  });

  it('degrada quando não há servidor', () => {
    const gateway = { server: undefined } as unknown as EventsGateway;
    expect(() => new EventsService(gateway).emit('c', 'x', {})).not.toThrow();
  });
});
