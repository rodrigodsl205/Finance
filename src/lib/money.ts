/**
 * Money is stored as integer cents (bigint in Postgres).
 * R$ 1.000,00 is stored as 100000.
 * This avoids floating-point imprecision in financial calculations.
 */

export function centsToBRL(cents: number): string {
  const value = cents / 100;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function brlToCents(formatted: string): number {
  // Remove everything except digits and comma
  const cleaned = formatted.replace(/[^\d,-]/g, '').replace(',', '.');
  return Math.round(parseFloat(cleaned) * 100);
}

export function inputToCents(value: string): number {
  // Accepts "1234.56", "1234,56", "1234.5", "1.234,56"
  const normalized = value
    .replace(/\./g, '')   // remove thousand separators
    .replace(',', '.');   // decimal comma to dot
  return Math.round(parseFloat(normalized) * 100);
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

export function distributeCents(totalCents: number, parts: number): number[] {
  if (parts <= 0) return [];
  const base = Math.floor(totalCents / parts);
  const remainder = totalCents - base * parts;
  const result = new Array(parts).fill(base);
  for (let i = 0; i < remainder; i++) {
    result[i] += 1; // distribute leftover cents to the first parcels
  }
  return result;
}

export function sumCents(parts: number[]): number {
  return parts.reduce((acc, v) => acc + v, 0);
}
