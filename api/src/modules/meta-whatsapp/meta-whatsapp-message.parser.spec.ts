import { MetaWhatsappMessageParser } from './meta-whatsapp-message.parser';

function envelope(message: any, waId = '5511999998888') {
  return {
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: { contacts: [{ wa_id: waId }], messages: [message] } }] }],
  };
}

describe('MetaWhatsappMessageParser', () => {
  const parser = new MetaWhatsappMessageParser();

  it('parseia texto', () => {
    const [m] = parser.parse(envelope({ id: 'wamid.1', from: '5511999998888', type: 'text', text: { body: 'oi' } }));
    expect(m.type).toBe('text');
    expect(m.text).toBe('oi');
    expect(m.waId).toBe('5511999998888');
    expect(m.providerMessageId).toBe('wamid.1');
  });

  it('parseia imagem com caption e mediaId', () => {
    const [m] = parser.parse(envelope({ id: 'wamid.2', from: 'x', type: 'image', image: { id: 'media-1', mime_type: 'image/jpeg', caption: 'meu rg' } }));
    expect(m.type).toBe('image');
    expect(m.mediaId).toBe('media-1');
    expect(m.mimeType).toBe('image/jpeg');
    expect(m.text).toBe('meu rg');
  });

  it('parseia documento com filename', () => {
    const [m] = parser.parse(envelope({ id: 'wamid.3', from: 'x', type: 'document', document: { id: 'media-2', mime_type: 'application/pdf', filename: 'comprovante.pdf' } }));
    expect(m.type).toBe('document');
    expect(m.filename).toBe('comprovante.pdf');
    expect(m.mediaId).toBe('media-2');
  });

  it('parseia vídeo', () => {
    const [m] = parser.parse(envelope({ id: 'wamid.4', from: 'x', type: 'video', video: { id: 'media-3', mime_type: 'video/mp4' } }));
    expect(m.type).toBe('video');
    expect(m.mimeType).toBe('video/mp4');
  });

  it('parseia interactive button reply', () => {
    const [m] = parser.parse(envelope({ id: 'wamid.5', from: 'x', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'sim', title: 'Sim' } } }));
    expect(m.type).toBe('interactive');
    expect(m.text).toBe('Sim');
  });
});
