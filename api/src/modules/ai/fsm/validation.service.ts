import { Injectable } from '@nestjs/common';

/**
 * Validações de formato (não valida dígito verificador de CPF nesta fase).
 */
@Injectable()
export class ValidationService {
  isValidCep(cep: string): boolean {
    return /^\d{5}-?\d{3}$/.test((cep ?? '').trim());
  }

  isValidCpfFormat(cpf: string): boolean {
    const digits = (cpf ?? '').replace(/\D/g, '');
    return digits.length === 11;
  }

  isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((email ?? '').trim());
  }

  isValidPhone(phone: string): boolean {
    const digits = (phone ?? '').replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 13;
  }
}
