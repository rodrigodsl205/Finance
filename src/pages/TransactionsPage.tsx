import { useState, useMemo } from 'react';
import { Plus, ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, Search, Filter, X, Edit3, AlertTriangle, RefreshCw, Users } from 'lucide-react';
import { useTransactions, useCategories, useAccounts, usePaymentMethods, useCards, useInvoices, type TransactionFilters } from '@/hooks/useFinance';
import { useAuth } from '@/hooks/useAuth';
import { useSpaces } from '@/hooks/useSpaces';
import { supabase } from '@/lib/supabase';
import { centsToBRL, inputToCents } from '@/lib/money';
import { formatCurrencyInput, parseCurrencyInput, formatCpfCnpj } from '@/lib/format';
import { isValidCpfCnpj } from '@/lib/cpfCnpj';
import { logger } from '@/lib/logger';
import CategoryManageModal from '@/components/CategoryManageModal';
import PaymentMethodManageModal from '@/components/PaymentMethodManageModal';
import { formatDateBR, todayISO, getCurrentMonthRange, monthLabel, cardDisplayLabel } from '@/lib/dates';
import {
  TRANSACTION_TYPE_LABELS, TRANSACTION_STATUS_LABELS,
  DATE_CRITERION_LABELS,
} from '@/types';
import type { TransactionType, TransactionStatus, DateCriterion, Transaction, SplitType, Category } from '@/types';
import { accountDisplayLabel } from '@/types';

function categoryPath(cats: Category[], id: string): string {
  const cat = cats.find(c => c.id === id);
  if (!cat) return '';
  if (cat.parent_id) {
    const parentPath = categoryPath(cats, cat.parent_id);
    return parentPath ? `${parentPath} > ${cat.name}` : cat.name;
  }
  return cat.name;
}

const STATUS_STYLES: Record<TransactionStatus, string> = {
  pending: 'bg-accent-100 text-accent-700',
  paid: 'bg-success-100 text-success-700',
  partial: 'bg-warning-100 text-warning-700',
  cancelled: 'bg-neutral-100 text-neutral-500',
};

const SPLIT_LABELS: Record<SplitType, string> = {
  individual: 'Individual',
  equal: 'Dividir igual',
  percent: 'Por percentual',
  custom: 'Valores personalizados',
};

export default function TransactionsPage() {
  const { user } = useAuth();
  const { activeSpaceId, activeMembers } = useSpaces();

  const [showModal, setShowModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState('');
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [conflict, setConflict] = useState<{ message: string } | null>(null);

  const [dateCriterion, setDateCriterion] = useState<DateCriterion>('occurred_at');
  const { start, end } = getCurrentMonthRange();
  const [startDate, setStartDate] = useState(start);
  const [endDate, setEndDate] = useState(end);
  const [filterType, setFilterType] = useState<TransactionType | undefined>(undefined);
  const [filterStatus, setFilterStatus] = useState<TransactionStatus | undefined>(undefined);
  const [filterCategory, setFilterCategory] = useState<string | undefined>(undefined);
  const [filterAccount, setFilterAccount] = useState<string | undefined>(undefined);

  const filters: TransactionFilters = useMemo(() => ({
    type: filterType, status: filterStatus, categoryId: filterCategory,
    accountId: filterAccount, dateCriterion, startDate, endDate,
  }), [filterType, filterStatus, filterCategory, filterAccount, dateCriterion, startDate, endDate]);

  const { transactions, loading, refresh } = useTransactions(filters);
  const { categories, refresh: refreshCategories } = useCategories();
  const { accounts } = useAccounts();
  const { paymentMethods, refresh: refreshPaymentMethods } = usePaymentMethods();
  const { cards } = useCards();
  const { invoices } = useInvoices();

  // Form state
  const [formType, setFormType] = useState<TransactionType>('expense');
  const [formDescription, setFormDescription] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formAccount, setFormAccount] = useState('');
  const [formOccurredAt, setFormOccurredAt] = useState(todayISO());
  const [formDueDate, setFormDueDate] = useState(todayISO());
  const [formPaid, setFormPaid] = useState(false);
  const [formPaidAt, setFormPaidAt] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // New fields: establishment, CPF/CNPJ, payment method, card
  const [formEstablishment, setFormEstablishment] = useState('');
  const [establishmentNotInformed, setEstablishmentNotInformed] = useState(false);
  const [formCpfCnpj, setFormCpfCnpj] = useState('');
  const [formPaymentMethod, setFormPaymentMethod] = useState('');
  const [formCard, setFormCard] = useState('');
  const [formInvoice, setFormInvoice] = useState('');

  // Transfer fields
  const [transferMode, setTransferMode] = useState<'account' | 'person'>('account');
  const [formDestAccount, setFormDestAccount] = useState('');
  const [formDestMember, setFormDestMember] = useState('');

  // Split fields
  const [splitType, setSplitType] = useState<SplitType>('individual');
  const [splitMembers, setSplitMembers] = useState<Record<string, string>>({});

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showPaymentMethodModal, setShowPaymentMethodModal] = useState(false);

  // Detect if the selected payment method is a card-based method
  const selectedPaymentMethod = paymentMethods.find(pm => pm.id === formPaymentMethod);
  const isCardPayment = selectedPaymentMethod?.name.startsWith('Cartão ') ?? false;
  const cardInvoices = formCard ? invoices.filter(inv => inv.card_id === formCard && inv.status !== 'paid') : [];

  const members = activeMembers.filter(m => m.user_id !== user?.id);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formDescription.trim() || !formAmount || !activeSpaceId || !user) return;
    if (formType !== 'transfer' && !formCategory) return;
    if (formType !== 'transfer' && !formPaymentMethod) return;
    if (formType !== 'transfer' && !establishmentNotInformed && !formEstablishment.trim()) return;
    setSaving(true);
    setError(null);
    setConflict(null);

    // CPF/CNPJ validation
    if (formType !== 'transfer' && !establishmentNotInformed && formCpfCnpj.trim()) {
      const validation = isValidCpfCnpj(formCpfCnpj);
      if (!validation.valid) {
        setError(validation.message);
        setSaving(false);
        return;
      }
    }

    const amountCents = parseCurrencyInput(formAmount);
    const status: TransactionStatus = formPaid ? 'paid' : 'pending';

    const payload: Record<string, unknown> = {
      type: formType,
      description: formDescription.trim(),
      amount_cents: amountCents,
      category_id: formType === 'transfer' ? null : (formCategory || null),
      account_id: formAccount || null,
      occurred_at: formOccurredAt,
      due_date: formDueDate || null,
      paid_at: formPaid ? (formPaidAt || todayISO()) : null,
      status,
      notes: formNotes.trim() || null,
      split_type: splitType,
      establishment: formType === 'transfer' ? null : (establishmentNotInformed ? null : (formEstablishment.trim() || null)),
      cpf_cnpj: formType === 'transfer' || establishmentNotInformed ? null : (formCpfCnpj.trim() || null),
      payment_method_id: formType === 'transfer' ? null : (formPaymentMethod || null),
      card_id: formType === 'transfer' ? null : (formCard || null),
    };

    // Transfer destination
    if (formType === 'transfer') {
      if (transferMode === 'account') {
        payload.destination_account_id = formDestAccount || null;
        payload.destination_member_id = null;
      } else {
        payload.destination_member_id = formDestMember || null;
        payload.destination_account_id = null;
      }
    } else {
      payload.destination_account_id = null;
      payload.destination_member_id = null;
    }

    if (editingTx) {
      const { data, error: updateError } = await supabase
        .from('transactions')
        .update(payload)
        .eq('id', editingTx.id)
        .eq('version', editingTx.version)
        .select('version');

      if (updateError) { setError(updateError.message); setSaving(false); return; }
      if (!data || data.length === 0) {
        setConflict({
          message: 'Este lançamento foi modificado por outra pessoa enquanto você editava. Recarregue para ver a versão atual.',
        });
        setSaving(false);
        return;
      }

      // Update splits if applicable
      if (formType !== 'transfer' && splitType !== 'individual') {
        await saveSplits(editingTx.id, amountCents);
      } else {
        await supabase.from('transaction_splits').delete().eq('transaction_id', editingTx.id);
      }

      setShowModal(false); setEditingTx(null); resetForm(); refresh();
    } else {
      const { data: txData, error: insertError } = await supabase
        .from('transactions')
        .insert({ ...payload, space_id: activeSpaceId, created_by: user.id })
        .select('id')
        .single();

      if (insertError) { setError(insertError.message); setSaving(false); return; }

      if (formType !== 'transfer' && splitType !== 'individual') {
        await saveSplits(txData.id, amountCents);
      }

      setShowModal(false); resetForm(); refresh();
    }
    setSaving(false);
  }

  async function saveSplits(txId: string, totalCents: number) {
    await supabase.from('transaction_splits').delete().eq('transaction_id', txId);

    if (splitType === 'equal') {
      const memberIds = Object.keys(splitMembers);
      if (memberIds.length === 0) return;
      const perPerson = Math.floor(totalCents / (memberIds.length + 1)); // +1 for current user
      const remainder = totalCents - perPerson * (memberIds.length + 1);
      const inserts = memberIds.map((mid, i) => ({
        transaction_id: txId,
        member_id: mid,
        share_cents: perPerson + (i === 0 ? remainder : 0),
        share_percent: Number(((perPerson / totalCents) * 100).toFixed(2)),
      }));
      await supabase.from('transaction_splits').insert(inserts);
    } else if (splitType === 'custom' || splitType === 'percent') {
      const inserts = Object.entries(splitMembers)
        .filter(([, v]) => v && v !== '0' && v !== '0,00')
        .map(([mid, v]) => {
          const cents = splitType === 'percent'
            ? Math.round(totalCents * (parseFloat(v.replace(',', '.')) / 100))
            : inputToCents(v);
          return {
            transaction_id: txId,
            member_id: mid,
            share_cents: cents,
            share_percent: splitType === 'percent' ? parseFloat(v.replace(',', '.')) : null,
          };
        });
      if (inserts.length > 0) await supabase.from('transaction_splits').insert(inserts);
    }
  }

  function resetForm() {
    setFormType('expense'); setFormDescription(''); setFormAmount('');
    setFormCategory(''); setFormAccount(''); setFormOccurredAt(todayISO());
    setFormDueDate(todayISO()); setFormPaid(false); setFormPaidAt(''); setFormNotes('');
    setFormEstablishment(''); setEstablishmentNotInformed(false); setFormCpfCnpj('');
    setFormPaymentMethod(''); setFormCard(''); setFormInvoice('');
    setTransferMode('account'); setFormDestAccount(''); setFormDestMember('');
    setSplitType('individual'); setSplitMembers({});
    setError(null); setConflict(null);
  }

  function openNew() { setEditingTx(null); resetForm(); setShowModal(true); }

  function openEdit(tx: Transaction) {
    setEditingTx(tx); setConflict(null); setError(null);
    setFormType(tx.type); setFormDescription(tx.description);
    setFormAmount(formatCurrencyInput(String(tx.amount_cents)));
    setFormCategory(tx.category_id ?? ''); setFormAccount(tx.account_id ?? '');
    setFormOccurredAt(tx.occurred_at); setFormDueDate(tx.due_date ?? todayISO());
    setFormPaid(tx.status === 'paid'); setFormPaidAt(tx.paid_at ?? '');
    setFormNotes(tx.notes ?? '');
    const hasNoEstablishment = !tx.establishment && tx.type !== 'transfer';
    setEstablishmentNotInformed(hasNoEstablishment);
    setFormEstablishment(tx.establishment ?? '');
    setFormCpfCnpj(tx.cpf_cnpj ?? '');
    setFormPaymentMethod(tx.payment_method_id ?? '');
    setFormCard(tx.card_id ?? '');
    setFormInvoice(tx.invoice_item_id ?? '');

    if (tx.destination_account_id) { setTransferMode('account'); setFormDestAccount(tx.destination_account_id); }
    else if (tx.destination_member_id) { setTransferMode('person'); setFormDestMember(tx.destination_member_id); }
    else { setTransferMode('account'); setFormDestAccount(''); setFormDestMember(''); }

    setSplitType(tx.split_type);
    const existingSplits: Record<string, string> = {};
    tx.splits?.forEach(s => {
      existingSplits[s.member_id] = tx.split_type === 'percent'
        ? (s.share_percent?.toString() ?? '')
        : (s.share_cents / 100).toFixed(2).replace('.', ',');
    });
    setSplitMembers(existingSplits);
    setShowModal(true);
  }

  async function handleMarkPaid(txId: string, currentVersion: number) {
    const { data } = await supabase
      .from('transactions').update({ status: 'paid', paid_at: todayISO() })
      .eq('id', txId).eq('version', currentVersion).select('id');
    if (!data || data.length === 0) {
      alert('O lançamento foi modificado por outra pessoa. A lista foi atualizada.');
    }
    refresh();
  }

  async function handleDelete(txId: string) {
    if (!confirm('Excluir este lançamento?')) return;
    await supabase.from('transactions').delete().eq('id', txId);
    refresh();
  }

  function handleConflictReload() {
    setShowModal(false); setEditingTx(null); setConflict(null); resetForm(); refresh();
  }

  const filtered = transactions.filter(t =>
    !search || t.description.toLowerCase().includes(search.toLowerCase())
  );

  const monthLabelStr = monthLabel(parseInt(startDate.split('-')[0]), parseInt(startDate.split('-')[1]) - 1);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="animate-pulse text-neutral-400">Carregando...</div></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">Lançamentos</h1>
        <button onClick={openNew} className="btn-primary"><Plus className="w-4 h-4" /> Novo lançamento</button>
      </div>

      {/* Date criterion selector */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-neutral-500">Filtrar por:</label>
            <select className="input py-2 text-sm w-auto" value={dateCriterion} onChange={(e) => setDateCriterion(e.target.value as DateCriterion)}>
              {Object.entries(DATE_CRITERION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input type="date" className="input py-2 text-sm w-auto" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <span className="text-neutral-400 text-sm">até</span>
            <input type="date" className="input py-2 text-sm w-auto" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <button className={`btn-ghost text-sm ${showFilters ? 'text-primary-700' : ''}`} onClick={() => setShowFilters(!showFilters)}>
            <Filter className="w-4 h-4" /> Filtros
          </button>
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input className="input py-2 text-sm pl-10" placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-neutral-100 flex flex-wrap gap-3">
            <div>
              <label className="text-xs text-neutral-400 block mb-1">Tipo</label>
              <select className="input py-2 text-sm w-auto" value={filterType ?? ''} onChange={(e) => setFilterType(e.target.value as TransactionType || undefined)}>
                <option value="">Todos</option>
                {Object.entries(TRANSACTION_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-400 block mb-1">Status</label>
              <select className="input py-2 text-sm w-auto" value={filterStatus ?? ''} onChange={(e) => setFilterStatus(e.target.value as TransactionStatus || undefined)}>
                <option value="">Todos</option>
                {Object.entries(TRANSACTION_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-400 block mb-1">Categoria</label>
              <select className="input py-2 text-sm w-auto" value={filterCategory ?? ''} onChange={(e) => setFilterCategory(e.target.value || undefined)}>
                <option value="">Todas</option>
                {categories.map(c => <option key={c.id} value={c.id}>{categoryPath(categories, c.id)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-400 block mb-1">Conta</label>
              <select className="input py-2 text-sm w-auto" value={filterAccount ?? ''} onChange={(e) => setFilterAccount(e.target.value || undefined)}>
                <option value="">Todas</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{accountDisplayLabel(a)}</option>)}
              </select>
            </div>
            <button className="btn-ghost text-sm text-danger-500 self-end"
              onClick={() => { setFilterType(undefined); setFilterStatus(undefined); setFilterCategory(undefined); setFilterAccount(undefined); }}>
              Limpar
            </button>
          </div>
        )}
      </div>

      <p className="text-sm text-neutral-500">
        {DATE_CRITERION_LABELS[dateCriterion]} · {monthLabelStr} · {filtered.length} {filtered.length === 1 ? 'lançamento' : 'lançamentos'}
      </p>

      {/* Transactions list */}
      {filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-neutral-100 flex items-center justify-center mx-auto mb-4">
            <ArrowLeftRight className="w-8 h-8 text-neutral-400" />
          </div>
          <h3 className="text-lg font-semibold text-neutral-900 mb-1">Nenhum lançamento</h3>
          <p className="text-sm text-neutral-500 max-w-md mx-auto mb-4">
            Registre sua primeira receita ou despesa para começar a acompanhar suas finanças.
          </p>
          <button onClick={openNew} className="btn-primary mx-auto"><Plus className="w-4 h-4" /> Novo lançamento</button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((tx) => (
            <div key={tx.id} className="card p-4 flex items-center gap-3 group">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                tx.type === 'income' ? 'bg-success-50' : tx.type === 'transfer' ? 'bg-primary-50' : 'bg-danger-50'
              }`}>
                {tx.type === 'income' ? <ArrowDownCircle className="w-5 h-5 text-success-600" /> :
                 tx.type === 'transfer' ? <ArrowLeftRight className="w-5 h-5 text-primary-600" /> :
                 <ArrowUpCircle className="w-5 h-5 text-danger-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-neutral-900 truncate">{tx.description}</p>
                  <span className={`badge ${STATUS_STYLES[tx.status]} shrink-0`}>{TRANSACTION_STATUS_LABELS[tx.status]}</span>
                  {tx.split_type !== 'individual' && tx.splits && tx.splits.length > 0 && (
                    <span className="badge bg-primary-50 text-primary-600 shrink-0">
                      <Users className="w-3 h-3 mr-0.5" /> {tx.splits.length + 1}
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {formatDateBR(tx.occurred_at)} · {tx.categories?.name ?? 'Sem categoria'}
                  {tx.payment_methods?.name ? ` · ${tx.payment_methods.name}` : ''}
                  {tx.establishment ? ` · ${tx.establishment}` : ''}
                  {tx.type === 'transfer' && tx.destination_accounts?.name ? ` → ${tx.destination_accounts.name}` : ''}
                  {tx.type === 'transfer' && tx.destination_members?.display_name ? ` → ${tx.destination_members.display_name}` : ''}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className={`font-semibold ${tx.type === 'income' ? 'text-success-600' : tx.type === 'transfer' ? 'text-neutral-600' : 'text-danger-600'}`}>
                  {tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : ''}{centsToBRL(tx.amount_cents)}
                </p>
                {tx.status === 'pending' && (
                  <button onClick={() => handleMarkPaid(tx.id, tx.version)}
                    className="text-xs text-primary-600 hover:text-primary-800 font-medium mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    Marcar como pago
                  </button>
                )}
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => openEdit(tx)} className="p-1.5 rounded-lg text-neutral-300 hover:text-primary-600 hover:bg-primary-50 transition-colors">
                  <Edit3 className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(tx.id)} className="p-1.5 rounded-lg text-neutral-300 hover:text-danger-600 hover:bg-danger-50 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New/Edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 animate-fade-in" onClick={() => setShowModal(false)}>
          <div className="card p-6 w-full max-w-md animate-scale-in max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-neutral-900">{editingTx ? 'Editar lançamento' : 'Novo lançamento'}</h2>
              <button onClick={() => setShowModal(false)} className="text-neutral-400 hover:text-neutral-600 transition-colors"><X className="w-5 h-5" /></button>
            </div>

            {conflict && (
              <div className="mb-4 p-4 rounded-xl bg-warning-50 border border-warning-200">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-warning-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-warning-800 mb-1">Conflito de edição</p>
                    <p className="text-xs text-warning-700">{conflict.message}</p>
                  </div>
                </div>
                <button onClick={handleConflictReload} className="mt-3 flex items-center gap-1.5 text-sm font-medium text-warning-700 hover:text-warning-900">
                  <RefreshCw className="w-3.5 h-3.5" /> Recarregar lista
                </button>
              </div>
            )}

            {error && !conflict && <div className="mb-4 p-3 rounded-xl bg-danger-50 border border-danger-200 text-danger-700 text-sm">{error}</div>}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Type selector */}
              <div className="flex gap-2">
                {(['expense', 'income', 'transfer'] as TransactionType[]).map(t => (
                  <button key={t} type="button" onClick={() => setFormType(t)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      formType === t
                        ? t === 'income' ? 'bg-success-100 text-success-700' : t === 'transfer' ? 'bg-primary-100 text-primary-700' : 'bg-danger-100 text-danger-700'
                        : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                    }`}>
                    {TRANSACTION_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>

              <div>
                <label className="label">Descrição</label>
                <input className="input" placeholder="Ex: Aluguel" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} required autoFocus />
              </div>
              <div>
                <label className="label">Valor (R$)</label>
                <input className="input" placeholder="0,00" value={formAmount} onChange={(e) => setFormAmount(formatCurrencyInput(e.target.value))} required />
              </div>

              {/* Transfer-specific fields */}
              {formType === 'transfer' && (
                <div className="space-y-3 p-3 rounded-xl bg-primary-50/50 border border-primary-100">
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setTransferMode('account')}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${transferMode === 'account' ? 'bg-primary-600 text-white' : 'bg-white text-primary-600 border border-primary-200'}`}>
                      Entre contas
                    </button>
                    <button type="button" onClick={() => setTransferMode('person')}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${transferMode === 'person' ? 'bg-primary-600 text-white' : 'bg-white text-primary-600 border border-primary-200'}`}>
                      Para pessoa
                    </button>
                  </div>
                  {transferMode === 'account' ? (
                    <div>
                      <label className="label">Conta de origem</label>
                      <select className="input" value={formAccount} onChange={(e) => setFormAccount(e.target.value)} required>
                        <option value="">Selecione</option>
                        {accounts.map(a => <option key={a.id} value={a.id}>{accountDisplayLabel(a)}</option>)}
                      </select>
                      <label className="label mt-2">Conta de destino</label>
                      <select className="input" value={formDestAccount} onChange={(e) => setFormDestAccount(e.target.value)} required>
                        <option value="">Selecione</option>
                        {accounts.filter(a => a.id !== formAccount).map(a => <option key={a.id} value={a.id}>{accountDisplayLabel(a)}</option>)}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="label">Conta de origem</label>
                      <select className="input" value={formAccount} onChange={(e) => setFormAccount(e.target.value)} required>
                        <option value="">Selecione</option>
                        {accounts.map(a => <option key={a.id} value={a.id}>{accountDisplayLabel(a)}</option>)}
                      </select>
                      <label className="label mt-2">Pessoa de destino</label>
                      <select className="input" value={formDestMember} onChange={(e) => setFormDestMember(e.target.value)} required>
                        <option value="">Selecione</option>
                        {members.map(m => <option key={m.user_id} value={m.user_id}>{m.profiles?.display_name ?? 'Membro'}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* Category + Payment method + Establishment (not for transfers) */}
              {formType !== 'transfer' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Categoria</label>
                      <button
                        type="button"
                        onClick={() => setShowCategoryModal(true)}
                        className="input text-left flex items-center justify-between"
                      >
                        <span className={formCategory ? 'text-neutral-800 truncate' : 'text-neutral-400'}>
                          {formCategory
                            ? categoryPath(categories, formCategory) ?? 'Selecionar'
                            : 'Selecione'}
                        </span>
                        {categories.filter(c => formType === 'income' ? c.kind === 'income' : c.kind === 'expense').length === 0 && (
                          <span className="text-xs text-warning-600">Adicionar</span>
                        )}
                      </button>
                    </div>
                    <div>
                      <label className="label">Forma de pagamento</label>
                      <button
                        type="button"
                        onClick={() => setShowPaymentMethodModal(true)}
                        className="input text-left flex items-center justify-between"
                      >
                        <span className={formPaymentMethod ? 'text-neutral-800' : 'text-neutral-400'}>
                          {formPaymentMethod
                            ? paymentMethods.find(pm => pm.id === formPaymentMethod)?.name ?? 'Selecionar'
                            : 'Selecione'}
                        </span>
                        {paymentMethods.filter(pm => formType === 'income' ? pm.kind === 'income' : pm.kind === 'expense').length === 0 && (
                          <span className="text-xs text-warning-600">Adicionar</span>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Establishment with "Não informado" checkbox */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="label mb-0">Estabelecimento</label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" className="w-4 h-4 rounded border-neutral-300 text-primary-600"
                          checked={establishmentNotInformed}
                          onChange={(e) => {
                            setEstablishmentNotInformed(e.target.checked);
                            if (e.target.checked) { setFormEstablishment(''); setFormCpfCnpj(''); }
                          }}
                        />
                        <span className="text-xs text-neutral-500">Não informado</span>
                      </label>
                    </div>
                    {!establishmentNotInformed && (
                      <input className="input" placeholder="Ex: Supermercado Extra" value={formEstablishment} onChange={(e) => setFormEstablishment(e.target.value)} required />
                    )}
                  </div>

                  {/* CPF/CNPJ - hidden when "Não informado" is checked */}
                  {!establishmentNotInformed && (
                    <div>
                      <label className="label">CPF/CNPJ (opcional)</label>
                      <input className="input" placeholder="000.000.000-00" value={formCpfCnpj} onChange={(e) => setFormCpfCnpj(formatCpfCnpj(e.target.value))} />
                    </div>
                  )}

                  {/* Split section (only for expenses in shared spaces) */}
                  {formType === 'expense' && members.length > 0 && (
                    <div className="space-y-3 p-3 rounded-xl bg-neutral-50 border border-neutral-100">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-neutral-500" />
                        <label className="text-sm font-medium text-neutral-700">Dividir com</label>
                      </div>
                      <select className="input py-2 text-sm" value={splitType} onChange={(e) => { setSplitType(e.target.value as SplitType); setSplitMembers({}); }}>
                        {Object.entries(SPLIT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      {splitType !== 'individual' && (
                        <div className="space-y-2">
                          {members.map(m => (
                            <div key={m.user_id} className="flex items-center gap-2">
                              <label className="flex items-center gap-2 flex-1 cursor-pointer">
                                <input type="checkbox" className="w-4 h-4 rounded border-neutral-300 text-primary-600"
                                  checked={!!splitMembers[m.user_id] || splitMembers[m.user_id] === ''}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSplitMembers(prev => ({ ...prev, [m.user_id]: splitType === 'equal' ? '1' : '' }));
                                    } else {
                                      setSplitMembers(prev => { const n = { ...prev }; delete n[m.user_id]; return n; });
                                    }
                                  }}
                                />
                                <span className="text-sm text-neutral-700">{m.profiles?.display_name ?? 'Membro'}</span>
                              </label>
                              {splitType !== 'equal' && splitMembers[m.user_id] !== undefined && (
                                <input className="input py-1.5 text-sm w-24" placeholder={splitType === 'percent' ? '%' : 'R$'}
                                  value={splitMembers[m.user_id]} onChange={(e) => setSplitMembers(prev => ({ ...prev, [m.user_id]: e.target.value }))} />
                              )}
                            </div>
                          ))}
                          {splitType === 'equal' && Object.keys(splitMembers).length > 0 && formAmount && (
                            <p className="text-xs text-neutral-500">
                              Cada pessoa paga {centsToBRL(Math.floor(inputToCents(formAmount) / (Object.keys(splitMembers).length + 1)))}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {formType !== 'transfer' && isCardPayment && (
                <div className="space-y-3 p-3 rounded-xl bg-blue-50/50 border border-blue-100">
                  <div>
                    <label className="label">Cartão</label>
                    <select className="input" value={formCard} onChange={(e) => { setFormCard(e.target.value); setFormInvoice(''); }} required>
                      <option value="">Selecione o cartão</option>
                      {cards.map(c => <option key={c.id} value={c.id}>{cardDisplayLabel(c)}</option>)}
                    </select>
                  </div>
                  {formCard && (
                    <div>
                      <label className="label">Fatura</label>
                      <select className="input" value={formInvoice} onChange={(e) => setFormInvoice(e.target.value)} required>
                        <option value="">Selecione a fatura</option>
                        {cardInvoices.length > 0 ? (
                          cardInvoices.map(inv => (
                            <option key={inv.id} value={inv.id}>
                              {inv.cards?.name ?? 'Cartão'} · {formatDateBR(inv.period_start)} a {formatDateBR(inv.period_end)} · Venc: {formatDateBR(inv.due_date)}
                            </option>
                          ))
                        ) : (
                          <option value="" disabled>Nenhuma fatura em aberto para este cartão</option>
                        )}
                      </select>
                      {cardInvoices.length === 0 && (
                        <p className="text-xs text-warning-600 mt-1">Crie uma fatura para este cartão na aba Faturas.</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Data de realização</label>
                  <input type="date" className="input" value={formOccurredAt} onChange={(e) => setFormOccurredAt(e.target.value)} required />
                </div>
                {!isCardPayment && !formPaid && (
                  <div>
                    <label className="label">Vencimento previsto</label>
                    <input type="date" className="input" value={formDueDate} onChange={(e) => setFormDueDate(e.target.value)} />
                  </div>
                )}
              </div>
              {formType !== 'transfer' && !isCardPayment && (
                <div className="flex items-center gap-2 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 rounded border-neutral-300 text-primary-600" checked={formPaid} onChange={(e) => setFormPaid(e.target.checked)} />
                    <span className="text-sm text-neutral-700">Já foi pago/recebido</span>
                  </label>
                </div>
              )}
              {formPaid && !isCardPayment && (
                <div>
                  <label className="label">Data efetiva de pagamento</label>
                  <input type="date" className="input" value={formPaidAt || todayISO()} onChange={(e) => setFormPaidAt(e.target.value)} />
                </div>
              )}
              <div>
                <label className="label">Observações</label>
                <textarea className="input" rows={2} placeholder="Opcional" value={formNotes} onChange={(e) => setFormNotes(e.target.value)} />
              </div>
              {editingTx && <p className="text-xs text-neutral-400 text-center">Editando versão #{editingTx.version}</p>}
              <button type="submit" disabled={saving || !!conflict} className="btn-primary w-full">
                {saving ? 'Salvando...' : editingTx ? 'Salvar alterações' : 'Criar lançamento'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Category management modal */}
      <CategoryManageModal
        open={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        spaceId={activeSpaceId}
        onSaved={refreshCategories}
        filterKind={formType === 'income' ? 'income' : 'expense'}
        selectedId={formCategory}
        onSelect={(cat) => setFormCategory(cat.id)}
      />

      {/* Payment method management modal */}
      <PaymentMethodManageModal
        open={showPaymentMethodModal}
        onClose={() => setShowPaymentMethodModal(false)}
        spaceId={activeSpaceId}
        onSaved={refreshPaymentMethods}
        filterKind={formType === 'income' ? 'income' : 'expense'}
        selectedId={formPaymentMethod}
        onSelect={(pm) => { setFormPaymentMethod(pm.id); setFormCard(''); setFormInvoice(''); }}
      />
    </div>
  );
}
