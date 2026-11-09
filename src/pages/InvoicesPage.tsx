import { useState } from 'react';
import { Plus, CreditCard, Trash2, Edit3, X, Receipt, Check } from 'lucide-react';
import { useInvoices, useCards } from '@/hooks/useFinance';
import { useAuth } from '@/hooks/useAuth';
import { useSpaces } from '@/hooks/useSpaces';
import { supabase } from '@/lib/supabase';
import { centsToBRL } from '@/lib/money';
import { formatCurrencyInput, parseCurrencyInput } from '@/lib/format';
import { logger } from '@/lib/logger';
import { formatDateBR, todayISO, lastDayOfMonth, cardDisplayLabel } from '@/lib/dates';
import { INVOICE_STATUS_LABELS } from '@/types';
import type { InvoiceStatus, Invoice } from '@/types';

const STATUS_STYLES: Record<InvoiceStatus, string> = {
  open: 'bg-accent-100 text-accent-700',
  closed: 'bg-blue-100 text-blue-700',
  paid: 'bg-success-100 text-success-700',
  partial: 'bg-warning-100 text-warning-700',
  overdue: 'bg-danger-100 text-danger-700',
};

function safeSetDate(d: Date, day: number): Date {
  const last = lastDayOfMonth(d.getFullYear(), d.getMonth());
  d.setDate(Math.min(day, last));
  return d;
}

function getPeriodStart(closingDay: number, ref: Date = new Date()): string {
  const d = new Date(ref.getFullYear(), ref.getMonth(), 1);
  if (ref.getDate() >= closingDay) {
    d.setMonth(d.getMonth() + 1);
  } else {
    d.setMonth(d.getMonth());
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

export default function InvoicesPage() {
  const { invoices, loading, refresh } = useInvoices();
  const { cards } = useCards();
  const { user } = useAuth();
  const { activeSpaceId } = useSpaces();

  const [showModal, setShowModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [cardId, setCardId] = useState('');
  const [periodStart, setPeriodStart] = useState(todayISO());
  const [periodEnd, setPeriodEnd] = useState(todayISO());
  const [closingDate, setClosingDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Item form
  const [itemDescription, setItemDescription] = useState('');
  const [itemEstablishment, setItemEstablishment] = useState('');
  const [itemAmount, setItemAmount] = useState('');
  const [itemOccurredAt, setItemOccurredAt] = useState(todayISO());
  const [itemInstallmentNum, setItemInstallmentNum] = useState('');
  const [itemInstallmentTotal, setItemInstallmentTotal] = useState('');

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!cardId || !activeSpaceId) return;
    setSaving(true);
    setError(null);

    const { error } = await supabase.from('invoices').insert({
      card_id: cardId, space_id: activeSpaceId,
      period_start: periodStart, period_end: periodEnd,
      closing_date: closingDate, due_date: dueDate,
      payment_method_id: null,
      notes: notes.trim() || null, status: 'open',
    });

    if (error) setError(error.message);
    else {
      setShowModal(false);
      setCardId(''); setPeriodStart(todayISO()); setPeriodEnd(todayISO());
      setClosingDate(todayISO()); setDueDate(todayISO());
      setNotes('');
      refresh();
    }
    setSaving(false);
  }

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedInvoice || !itemDescription.trim() || !itemAmount) return;
    setSaving(true);
    setError(null);

    const amountCents = parseCurrencyInput(itemAmount);
    const { error } = await supabase.from('invoice_items').insert({
      invoice_id: selectedInvoice.id,
      description: itemDescription.trim(),
      establishment: itemEstablishment.trim() || null,
      amount_cents: amountCents,
      installment_number: itemInstallmentNum ? parseInt(itemInstallmentNum) : null,
      installment_total: itemInstallmentTotal ? parseInt(itemInstallmentTotal) : null,
      occurred_at: itemOccurredAt,
    });

    if (error) setError(error.message);
    else {
      // Update invoice total
      const newTotal = (selectedInvoice.total_cents || 0) + amountCents;
      const newStatus = newTotal > 0 && selectedInvoice.paid_cents >= newTotal ? 'paid' : selectedInvoice.status;
      await supabase.from('invoices').update({ total_cents: newTotal, status: newStatus }).eq('id', selectedInvoice.id);

      setShowItemModal(false);
      setItemDescription(''); setItemEstablishment(''); setItemAmount('');
      setItemOccurredAt(todayISO()); setItemInstallmentNum(''); setItemInstallmentTotal('');
      refresh();
    }
    setSaving(false);
  }

  async function handlePayInvoice(invoice: Invoice) {
    const amountStr = prompt(`Quanto foi pago? (Total: ${centsToBRL(invoice.total_cents)})`);
    if (!amountStr) return;
    const paidCents = parseCurrencyInput(amountStr);
    const newPaid = (invoice.paid_cents || 0) + paidCents;
    const status: InvoiceStatus = newPaid >= invoice.total_cents ? 'paid' : 'partial';

    await supabase.from('invoices')
      .update({ paid_cents: newPaid, status })
      .eq('id', invoice.id);
    refresh();
  }

  async function handleCloseInvoice(id: string) {
    await supabase.from('invoices').update({ status: 'closed' }).eq('id', id);
    refresh();
  }

  async function handleDeleteInvoice(id: string) {
    if (!confirm('Excluir esta fatura? Todos os itens serão removidos.')) return;
    await supabase.from('invoices').delete().eq('id', id);
    refresh();
  }

  function handleCardSelect(selectedCardId: string) {
    setCardId(selectedCardId);
    const card = cards.find(c => c.id === selectedCardId);
    if (!card) return;
    const start = getPeriodStart(card.closing_day);
    const end = getPeriodEnd(start, card.closing_day);
    setPeriodStart(start);
    setPeriodEnd(end);
    setClosingDate(end);
    setDueDate(getDueDate(end, card.due_day));
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="animate-pulse text-neutral-400">Carregando...</div></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">Faturas</h1>
        <button onClick={() => setShowModal(true)} className="btn-primary"><Plus className="w-4 h-4" /> Nova fatura</button>
      </div>

      {invoices.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-neutral-100 flex items-center justify-center mx-auto mb-4">
            <Receipt className="w-8 h-8 text-neutral-400" />
          </div>
          <h3 className="text-lg font-semibold text-neutral-900 mb-1">Nenhuma fatura</h3>
          <p className="text-sm text-neutral-500 max-w-md mx-auto mb-4">
            Crie faturas para seus cartões e adicione compras à vista ou parceladas.
          </p>
          {cards.length === 0 && <p className="text-sm text-danger-500 mb-2">Cadastre um cartão primeiro.</p>}
          <button onClick={() => setShowModal(true)} disabled={cards.length === 0} className="btn-primary mx-auto disabled:opacity-50">
            <Plus className="w-4 h-4" /> Nova fatura
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {invoices.map((inv) => (
            <div key={inv.id} className="card p-5 group">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-primary-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-neutral-900">{inv.cards?.name ?? 'Cartão'}</p>
                    <p className="text-xs text-neutral-400">
                      {formatDateBR(inv.period_start)} a {formatDateBR(inv.period_end)} · Vence: {formatDateBR(inv.due_date)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`badge ${STATUS_STYLES[inv.status]} shrink-0`}>{INVOICE_STATUS_LABELS[inv.status]}</span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { setSelectedInvoice(inv); setShowItemModal(true); }} className="p-1.5 rounded-lg text-neutral-400 hover:text-primary-600 hover:bg-primary-50 transition-colors">
                      <Plus className="w-4 h-4" />
                    </button>
                    {inv.status === 'open' && (
                      <button onClick={() => handleCloseInvoice(inv.id)} className="text-xs text-primary-600 hover:text-primary-800 font-medium px-2 py-1 rounded-lg hover:bg-primary-50">Fechar</button>
                    )}
                    {(inv.status === 'closed' || inv.status === 'partial' || inv.status === 'overdue') && (
                      <button onClick={() => handlePayInvoice(inv)} className="text-xs text-success-600 hover:text-success-800 font-medium px-2 py-1 rounded-lg hover:bg-success-50">Pagamento</button>
                    )}
                    <button onClick={() => handleDeleteInvoice(inv.id)} className="p-1.5 rounded-lg text-neutral-400 hover:text-danger-600 hover:bg-danger-50 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-3 border-t border-neutral-100">
                <div>
                  <p className="text-xs text-neutral-400 mb-0.5">Total</p>
                  <p className="text-lg font-bold text-neutral-900">{centsToBRL(inv.total_cents)}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-400 mb-0.5">Pago</p>
                  <p className="text-lg font-bold text-success-600">{centsToBRL(inv.paid_cents)}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-400 mb-0.5">Restante</p>
                  <p className="text-lg font-bold text-danger-600">{centsToBRL(inv.total_cents - inv.paid_cents)}</p>
                </div>
              </div>

              {inv.items && inv.items.length > 0 && (
                <div className="mt-4 pt-3 border-t border-neutral-100 space-y-1.5">
                  {inv.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-neutral-50 transition-colors">
                      <div>
                        <p className="text-sm text-neutral-700">{item.description}</p>
                        <p className="text-xs text-neutral-400">
                          {formatDateBR(item.occurred_at)}
                          {item.establishment ? ` · ${item.establishment}` : ''}
                          {item.installment_total ? ` · ${item.installment_number}/${item.installment_total}x` : ''}
                        </p>
                      </div>
                      <p className="text-sm font-medium text-neutral-900">{centsToBRL(item.amount_cents)}</p>
                    </div>
                  ))}
                </div>
              )}

              {inv.notes && <p className="mt-3 text-xs text-neutral-400 italic">{inv.notes}</p>}
            </div>
          ))}
        </div>
      )}

      {/* New invoice modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 animate-fade-in" onClick={() => setShowModal(false)}>
          <div className="card p-6 w-full max-w-md animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-neutral-900">Nova fatura</h2>
              <button onClick={() => setShowModal(false)} className="text-neutral-400 hover:text-neutral-600 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            {error && <div className="mb-4 p-3 rounded-xl bg-danger-50 border border-danger-200 text-danger-700 text-sm">{error}</div>}
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="label">Cartão</label>
                <select className="input" value={cardId} onChange={(e) => handleCardSelect(e.target.value)} required>
                  <option value="">Selecione</option>
                  {cards.map(c => <option key={c.id} value={c.id}>{cardDisplayLabel(c)}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Início do período</label>
                  <input type="date" className="input" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} required />
                </div>
                <div>
                  <label className="label">Fim do período</label>
                  <input type="date" className="input" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Fechamento</label>
                  <input type="date" className="input" value={closingDate} onChange={(e) => setClosingDate(e.target.value)} required />
                </div>
                <div>
                  <label className="label">Vencimento</label>
                  <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
                </div>
              </div>
              <div>
                <label className="label">Observações</label>
                <textarea className="input" rows={2} placeholder="Opcional" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <button type="submit" disabled={saving} className="btn-primary w-full">
                {saving ? 'Salvando...' : 'Criar fatura'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Add item modal */}
      {showItemModal && selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 animate-fade-in" onClick={() => setShowItemModal(false)}>
          <div className="card p-6 w-full max-w-md animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-neutral-900">Adicionar compra</h2>
              <button onClick={() => setShowItemModal(false)} className="text-neutral-400 hover:text-neutral-600 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            {error && <div className="mb-4 p-3 rounded-xl bg-danger-50 border border-danger-200 text-danger-700 text-sm">{error}</div>}
            <form onSubmit={handleAddItem} className="space-y-4">
              <div>
                <label className="label">Descrição</label>
                <input className="input" placeholder="Ex: Geladeira" value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} required autoFocus />
              </div>
              <div>
                <label className="label">Estabelecimento</label>
                <input className="input" placeholder="Ex: Magazine Luiza" value={itemEstablishment} onChange={(e) => setItemEstablishment(e.target.value)} />
              </div>
              <div>
                <label className="label">Valor (R$)</label>
                <input className="input" placeholder="0,00" value={itemAmount} onChange={(e) => setItemAmount(formatCurrencyInput(e.target.value))} required />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">Data</label>
                  <input type="date" className="input" value={itemOccurredAt} onChange={(e) => setItemOccurredAt(e.target.value)} required />
                </div>
                <div>
                  <label className="label">Parcela</label>
                  <input type="number" min={1} className="input" placeholder="1" value={itemInstallmentNum} onChange={(e) => setItemInstallmentNum(e.target.value)} />
                </div>
                <div>
                  <label className="label">de</label>
                  <input type="number" min={1} className="input" placeholder="6" value={itemInstallmentTotal} onChange={(e) => setItemInstallmentTotal(e.target.value)} />
                </div>
              </div>
              <button type="submit" disabled={saving} className="btn-primary w-full">
                {saving ? 'Salvando...' : 'Adicionar compra'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
