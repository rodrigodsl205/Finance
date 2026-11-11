import { useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { lastDayOfMonth, todayISO } from '@/lib/dates';
import type { Card, Invoice } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  spaceId: string | null;
  card: Card | null;
  onCreated: (invoice: Invoice) => void;
}

function safeSetDate(d: Date, day: number): Date {
  const last = lastDayOfMonth(d.getFullYear(), d.getMonth());
  d.setDate(Math.min(day, last));
  return d;
}

function getPeriodStart(closingDay: number, ref: Date = new Date()): string {
  const d = new Date(ref.getFullYear(), ref.getMonth(), 1);
  if (ref.getDate() >= closingDay) {
    d.setMonth(d.getMonth() + 1);
  }
  safeSetDate(d, closingDay);
  return d.toISOString().split('T')[0];
}

function getPeriodEnd(start: string, closingDay: number): string {
  const d = new Date(start + 'T00:00:00');
  d.setMonth(d.getMonth() + 1);
  safeSetDate(d, closingDay);
  return d.toISOString().split('T')[0];
}

function getDueDate(end: string, dueDay: number): string {
  const d = new Date(end + 'T00:00:00');
  safeSetDate(d, dueDay);
  return d.toISOString().split('T')[0];
}

export default function QuickInvoiceModal({ open, onClose, spaceId, card, onCreated }: Props) {
  const [periodStart, setPeriodStart] = useState(todayISO());
  const [periodEnd, setPeriodEnd] = useState(todayISO());
  const [closingDate, setClosingDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function autoFillDates(c: Card) {
    const start = getPeriodStart(c.closing_day);
    const end = getPeriodEnd(start, c.closing_day);
    setPeriodStart(start);
    setPeriodEnd(end);
    setClosingDate(end);
    setDueDate(getDueDate(end, c.due_day));
  }

  function sanitizeDateInput(value: string): string {
    const parts = value.split('-');
    if (parts.length === 3) {
      const year = parts[0].slice(0, 4);
      return `${year}-${parts[1]}-${parts[2]}`;
    }
    return value;
  }

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!card || !spaceId) return;
    setSaving(true);
    setError(null);

    try {
      const { data, error: insertError } = await supabase
        .from('invoices')
        .insert({
          card_id: card.id,
          space_id: spaceId,
          period_start: periodStart,
          period_end: periodEnd,
          closing_date: closingDate,
          due_date: dueDate,
          payment_method_id: null,
          notes: null,
          status: 'open',
        })
        .select('id, card_id, space_id, period_start, period_end, closing_date, due_date, total_cents, paid_cents, status, payment_method_id, notes, created_at, updated_at')
        .single();

      if (insertError) throw insertError;
      if (!data) throw new Error('Não foi possível criar a fatura.');

      onCreated(data as Invoice);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao criar fatura';
      logger.error('Erro ao criar fatura', msg);
      setError(msg);
    }
    setSaving(false);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Nova fatura para {card?.name ?? 'cartão'}</h2>
            <p className="modal-subtitle">Defina o período e datas de pagamento</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="modal-body">
        {error && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">{error}</div>}

        <form id="invoice-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Início do período</label>
              <input type="date" className="input" value={periodStart} onChange={(e) => setPeriodStart(sanitizeDateInput(e.target.value))} required />
            </div>
            <div>
              <label className="label">Fim do período</label>
              <input type="date" className="input" value={periodEnd} onChange={(e) => setPeriodEnd(sanitizeDateInput(e.target.value))} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Fechamento</label>
              <input type="date" className="input" value={closingDate} onChange={(e) => setClosingDate(sanitizeDateInput(e.target.value))} required />
            </div>
            <div>
              <label className="label">Vencimento</label>
              <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(sanitizeDateInput(e.target.value))} required />
            </div>
          </div>
        </form>
        </div>

        <div className="modal-footer">
          <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
          <button type="submit" form="invoice-form" disabled={saving} className="btn-primary">
            {saving ? 'Criando...' : 'Criar fatura'}
          </button>
        </div>
      </div>
    </div>
  );
}
