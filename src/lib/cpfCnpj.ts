/**
 * CPF and CNPJ validation with check-digit algorithm.
 */

function calcCpfCheckDigits(digits: string): [string, string] {
  let sum1 = 0;
  for (let i = 0; i < 9; i++) sum1 += parseInt(digits[i]) * (10 - i);
  let d1 = (sum1 * 10) % 11;
  if (d1 === 10) d1 = 0;
  const d1Str = String(d1);

  let sum2 = 0;
  for (let i = 0; i < 9; i++) sum2 += parseInt(digits[i]) * (11 - i);
  sum2 += d1 * 2;
  let d2 = (sum2 * 10) % 11;
  if (d2 === 10) d2 = 0;
  const d2Str = String(d2);

  return [d1Str, d2Str];
}

export function isValidCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  const [d1, d2] = calcCpfCheckDigits(digits);
  return digits[9] === d1 && digits[10] === d2;
}

function calcCnpjCheckDigits(digits: string): [string, string] {
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum1 = 0;
  for (let i = 0; i < 12; i++) sum1 += parseInt(digits[i]) * weights1[i];
  let d1 = sum1 % 11;
  d1 = d1 < 2 ? 0 : 11 - d1;
  const d1Str = String(d1);

  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum2 = 0;
  for (let i = 0; i < 12; i++) sum2 += parseInt(digits[i]) * weights2[i];
  sum2 += d1 * weights2[12];
  let d2 = sum2 % 11;
  d2 = d2 < 2 ? 0 : 11 - d2;
  const d2Str = String(d2);

  return [d1Str, d2Str];
}

export function isValidCNPJ(cnpj: string): boolean {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;
  const [d1, d2] = calcCnpjCheckDigits(digits);
  return digits[12] === d1 && digits[13] === d2;
}

export function isValidCpfCnpj(value: string): { valid: boolean; message: string } {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 0) return { valid: true, message: '' };
  if (digits.length === 11) {
    if (!isValidCPF(digits)) return { valid: false, message: 'CPF inválido. Verifique os dígitos.' };
    return { valid: true, message: '' };
  }
  if (digits.length === 14) {
    if (!isValidCNPJ(digits)) return { valid: false, message: 'CNPJ inválido. Verifique os dígitos.' };
    return { valid: true, message: '' };
  }
  if (digits.length < 11) return { valid: false, message: 'CPF deve ter 11 dígitos.' };
  return { valid: false, message: 'CNPJ deve ter 14 dígitos.' };
}
