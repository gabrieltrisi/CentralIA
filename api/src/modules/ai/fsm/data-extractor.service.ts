import { Injectable } from '@nestjs/common';

export type ServiceType = 'fibra' | 'movel';
export type YesNo = 'yes' | 'no';

/**
 * Extrações determinísticas a partir do texto do cliente (sem IA).
 * Retornam `null` quando não conseguem extrair com confiança.
 */
@Injectable()
export class DataExtractorService {
  extractCep(text: string): string | null {
    const m = (text ?? '').match(/\b(\d{5})-?(\d{3})\b/);
    return m ? `${m[1]}-${m[2]}` : null;
  }

  extractCpf(text: string): string | null {
    const m = (text ?? '').match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/);
    if (!m) return null;
    const d = m[0].replace(/\D/g, '');
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }

  extractEmail(text: string): string | null {
    const m = (text ?? '').match(/[^\s@]+@[^\s@]+\.[^\s@]{2,}/);
    return m ? m[0] : null;
  }

  extractPhone(text: string): string | null {
    // Procura uma sequência com 10–13 dígitos (ignorando máscara).
    const candidates = (text ?? '').match(/[\d().\-\s]{10,}/g) ?? [];
    for (const c of candidates) {
      const d = c.replace(/\D/g, '');
      if (d.length >= 10 && d.length <= 13) return d;
    }
    return null;
  }

  extractName(text: string): string | null {
    let t = (text ?? '').trim();
    // Remove prefixos comuns.
    t = t.replace(/^(meu\s+nome\s+é|sou\s+o|sou\s+a|me\s+chamo|nome:?)\s+/i, '');
    t = t.replace(/[.,;]+$/, '').trim();
    // Nome: ao menos dois tokens, apenas letras/espaços/acentos.
    if (!/^[A-Za-zÀ-ÿ'’.\s]{3,}$/.test(t)) return null;
    if (t.split(/\s+/).filter(Boolean).length < 2) return null;
    return t;
  }

  extractServiceType(text: string): ServiceType | null {
    const t = (text ?? '').toLowerCase();
    if (/\bfibra\b|fibr[ao]|banda\s*larga|internet\s+fixa/.test(t)) return 'fibra';
    if (/m[óo]vel|movel|celular|chip|plano\s+m[óo]vel/.test(t)) return 'movel';
    return null;
  }

  extractYesNo(text: string): YesNo | null {
    const t = (text ?? '').toLowerCase();
    if (/\b(n[ãa]o|nao|negativo|depois|agora\s+n[ãa]o)\b/.test(t)) return 'no';
    if (/\b(sim|claro|quero|pode|isso|positivo|com\s+certeza|aceito|bora|vamos)\b/.test(t)) return 'yes';
    return null;
  }
}
