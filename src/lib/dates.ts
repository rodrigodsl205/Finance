/**
 * Date utilities. Dates without time use `date` (no timezone) in Postgres.
 * Display format is DD/MM/AAAA (pt-BR). Internal storage uses ISO date strings.
 */

export function formatDateBR(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr + 'T00:00:00');
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function formatDateTimeBR(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function dateToISO(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function todayISO(): string {
  return dateToISO(new Date());
}

export function monthLabel(year: number, month: number): string {
  const names = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ];
  return `${names[month]} ${year}`;
}

export function getCurrentMonthRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: dateToISO(start), end: dateToISO(end) };
}

export function addMonths(dateStr: string, months: number): string {
  const date = new Date(dateStr + 'T00:00:00');
  date.setMonth(date.getMonth() + months);
  return dateToISO(date);
}

export function getDayOfMonth(dateStr: string): number {
  const date = new Date(dateStr + 'T00:00:00');
  return date.getDate();
}

export function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function cardDisplayLabel(card: { name: string; brand: string | null; last_digits: string | null; holder_name: string | null }): string {
  const institution = card.brand || card.name;
  const last4 = card.last_digits ?? '';
  const firstName = card.holder_name?.split(' ')[0] ?? '';
  const parts = [institution, last4, firstName].filter(Boolean);
  return parts.join(' - ');
}
