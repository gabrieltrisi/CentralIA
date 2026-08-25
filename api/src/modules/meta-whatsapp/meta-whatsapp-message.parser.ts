import { Injectable } from '@nestjs/common';

export type MetaMessageType =
  | 'text'
  | 'image'
  | 'document'
  | 'video'
  | 'audio'
  | 'interactive'
  | 'unknown';

export interface NormalizedMessage {
  providerMessageId: string;
  waId: string;
  from: string;
  type: MetaMessageType;
  text?: string;
  mediaId?: string;
  mimeType?: string;
  filename?: string;
  timestamp?: string;
  rawPayload: unknown;
}

/**
 * Normaliza o payload do webhook da Meta (WhatsApp Cloud API) em mensagens
 * tratáveis. Suporta text, image, document, video, audio e interactive.
 */
@Injectable()
export class MetaWhatsappMessageParser {
  parse(payload: any): NormalizedMessage[] {
    const out: NormalizedMessage[] = [];
    for (const entry of payload?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value;
        const contactWaId = value?.contacts?.[0]?.wa_id;
        for (const m of value?.messages ?? []) {
          out.push(this.normalize(m, contactWaId));
        }
      }
    }
    return out;
  }

  private normalize(m: any, contactWaId?: string): NormalizedMessage {
    const base = {
      providerMessageId: m?.id ?? '',
      waId: contactWaId ?? m?.from ?? '',
      from: m?.from ?? '',
      timestamp: m?.timestamp,
      rawPayload: m,
    };

    switch (m?.type) {
      case 'text':
        return { ...base, type: 'text', text: m.text?.body ?? '' };
      case 'image':
        return {
          ...base,
          type: 'image',
          mediaId: m.image?.id,
          mimeType: m.image?.mime_type,
          text: m.image?.caption,
        };
      case 'document':
        return {
          ...base,
          type: 'document',
          mediaId: m.document?.id,
          mimeType: m.document?.mime_type,
          filename: m.document?.filename,
          text: m.document?.caption,
        };
      case 'video':
        return {
          ...base,
          type: 'video',
          mediaId: m.video?.id,
          mimeType: m.video?.mime_type,
          text: m.video?.caption,
        };
      case 'audio':
        return {
          ...base,
          type: 'audio',
          mediaId: m.audio?.id,
          mimeType: m.audio?.mime_type,
        };
      case 'interactive': {
        const i = m.interactive;
        const reply = i?.button_reply ?? i?.list_reply;
        return {
          ...base,
          type: 'interactive',
          text: reply?.title ?? reply?.id ?? '',
        };
      }
      default:
        return { ...base, type: 'unknown' };
    }
  }
}
