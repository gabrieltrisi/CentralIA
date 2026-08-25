import { ValidationService } from './validation.service';

describe('ValidationService', () => {
  const v = new ValidationService();

  it('isValidCep', () => {
    expect(v.isValidCep('01001-000')).toBe(true);
    expect(v.isValidCep('01001000')).toBe(true);
    expect(v.isValidCep('123')).toBe(false);
  });

  it('isValidCpfFormat (apenas formato)', () => {
    expect(v.isValidCpfFormat('123.456.789-00')).toBe(true);
    expect(v.isValidCpfFormat('12345678900')).toBe(true);
    expect(v.isValidCpfFormat('123')).toBe(false);
  });

  it('isValidEmail', () => {
    expect(v.isValidEmail('a@b.com')).toBe(true);
    expect(v.isValidEmail('invalido')).toBe(false);
  });

  it('isValidPhone (10-13 dígitos)', () => {
    expect(v.isValidPhone('11955554444')).toBe(true);
    expect(v.isValidPhone('1199')).toBe(false);
  });
});
