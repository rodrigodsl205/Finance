import { useState, useMemo, useCallback } from 'react';
import { Plus, PiggyBank, Trash2, Edit3, X, TrendingDown, TrendingUp } from 'lucide-react';
import { useBudgets, useCategories, useTransactions, type TransactionFilters } from '@/hooks/useFinance';
import { useAuth } from '@/hooks/useAuth';
import { useSpaces } from '@/hooks/useSpaces';
import { supabase } from '@/lib/supabase';
import { centsToBRL, inputToCents } from '@/lib/money';
import { formatCurrencyInput, parseCurrencyInput } from '@/lib/format';
import { logger } from '@/lib/logger';
import { getCurrentMonthRange, monthLabel } from '@/lib/dates';
import type { Budget } from '@/types';

export default function BudgetsPage() {
  const { budgets, loading, refresh } = useBudgets();
  const { categories } = useCategories();
  const { user } = useAuth();
  const { activeSpaceId } = useSpaces();

  const { start } = getCurrentMonthRange();
  const [selectedMonth, setSelectedMonth] = useState(start.substring(0, 7) + '-01');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Budget | null>(null);
  const [categoryId, setCategoryId] = useState('');
  const [limit, setLimit] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch transactions for the selected month to compute spending
  const filters: TransactionFilters = useMemo(() => ({
    type: 'expense',
    dateCriterion: 'occurred_at',
    startDate: selectedMonth,
    endDate: selectedMonth.substring(0, 8) + new Date(new Date(selectedMonth).getFullYear(), new Date(selectedMonth).getMonth() + 1, 0).getDate().toString().padStart(2, '0'),
  }), [selectedMonth]);

  const { transactions } = useTransactions(filters);

  // Group spending by category
  const spendingByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const tx of transactions) {
      if (tx.category_id) {
        map[tx.category_id] = (map[tx.category_id] ?? 0) + tx.amount_cents;
      }
    }
    return map;
  }, [transactions]);

  const monthBudgets = budgets.filter(b => b.period_month === selectedMonth);

  const totalBudget = monthBudgets.reduce((s, b) => s + b.limit_cents, 0);
  const totalSpent = monthBudgets.reduce((s, b) => s + (spendingByCategory[b.category_id] ?? 0), 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!categoryId || !limit || !activeSpaceId || !user) return;
    setSaving(true);
    setError(null);
    const limitCents = parseCurrencyInput(limit);

    if (editing) {
      const { error } = await supabase
        .from('budgets')
        .update({ category_id: categoryId, limit_cents: limitCents, notes: notes.trim() || null })
        .eq('id', editing.id);
      if (error) setError(error.message);
    } else {
      const { error } = await supabase
        .from('budgets')
        .insert({ space_id: activeSpaceId, category_id: categoryId, period_month: selectedMonth, limit_cents: limitCents, notes: notes.trim() || null, created_by: user.id });
      if (error) setError(error.message);
    }

    if (!error) {
      setShowModal(false);
      setEditing(null);
      setCategoryId(''); setLimit(''); setNotes('');
      refresh();
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir este orçamento?')) return;
    await supabase.from('budgets').delete().eq('id', id);
    refresh();
  }

  function openEdit(b: Budget) {
    setEditing(b);
    setCategoryId(b.category_id);
    setLimit(formatCurrencyInput(String(b.limit_cents)));
    setNotes(b.notes ?? '');
    setShowModal(true);
  }

  function openNew() {
    setEditing(null);
    setCategoryId(''); setLimit(''); setNotes('');
    setShowModal(true);
  }

  // Generate month options (last 12 months + next 3)
  const monthOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = -12; i <= 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      opts.push({
        value: d.toISOString().split('T')[0],
        label: monthLabel(d.getFullYear(), d.getMonth()),
      });
    }
    return opts;
  }, []);

  const expenseCategories = categories.filter(c => c.kind === 'expense');

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="animate-pulse text-neutral-400">Carregando...</div></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">Orçamentos</h1>
        <button onClick={openNew} className="btn-primary"><Plus className="w-4 h-4" /> Novo orçamento</button>
      </div>

      {/* Month selector + summary */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <select className="input py-2 text-sm w-auto" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
            {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-neutral-400 mb-1">Orçamento total</p>
            <p className="text-2xl font-bold text-neutral-900">{centsToBRL(totalBudget)}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-400 mb-1">Gasto</p>
            <p className={`text-2xl font-bold ${totalSpent > totalBudget ? 'text-danger-600' : 'text-neutral-900'}`}>{centsToBRL(totalSpent)}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-400 mb-1">Restante</p>
            <p className={`text-2xl font-bold ${totalSpent > totalBudget ? 'text-danger-600' : 'text-success-600'}`}>{centsToBRL(Math.max(0, totalBudget - totalSpent))}</p>
          </div>
        </div>
        {totalBudget > 0 && (
          <div className="mt-4">
            <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${totalSpent > totalBudget ? 'bg-danger-500' : 'bg-primary-600'}`}
                style={{ width: `${Math.min(100, (totalSpent / totalBudget) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-neutral-400 mt-1.5">{Math.round((totalSpent / totalBudget) * 100)}% utilizado</p>
          </div>
        )}
      </div>

      {/* Budget list */}
      {monthBudgets.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-neutral-100 flex items-center justify-center mx-auto mb-4">
            <PiggyBank className="w-8 h-8 text-neutral-400" />
          </div>
          <h3 className="text-lg font-semibold text-neutral-900 mb-1">Nenhum orçamento neste mês</h3>
          <p className="text-sm text-neutral-500 max-w-md mx-auto mb-4">
            Defina limites de gastos por categoria para acompanhar quanto você está consumindo.
          </p>
          <button onClick={openNew} className="btn-primary mx-auto"><Plus className="w-4 h-4" /> Criar orçamento</button>
        </div>
      ) : (
        <div className="space-y-3">
          {monthBudgets.map((b) => {
            const spent = spendingByCategory[b.category_id] ?? 0;
            const pct = b.limit_cents > 0 ? (spent / b.limit_cents) * 100 : 0;
            const over = spent > b.limit_cents;
            return (
              <div key={b.id} className="card p-5 group">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${over ? 'bg-danger-50' : 'bg-primary-50'}`}>
                      {over ? <TrendingDown className="w-5 h-5 text-danger-600" /> : <TrendingUp className="w-5 h-5 text-primary-600" />}
                    </div>
                    <div>
                      <p className="font-medium text-neutral-900">{b.categories?.name ?? 'Categoria'}</p>
                      {b.notes && <p className="text-xs text-neutral-400">{b.notes}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-semibold text-neutral-900">{centsToBRL(spent)}</p>
                      <p className="text-xs text-neutral-400">de {centsToBRL(b.limit_cents)}</p>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(b)} className="p-1.5 rounded-lg text-neutral-300 hover:text-primary-600 hover:bg-primary-50 transition-colors">
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(b.id)} className="p-1.5 rounded-lg text-neutral-300 hover:text-danger-600 hover:bg-danger-50 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${over ? 'bg-danger-500' : pct > 80 ? 'bg-warning-500' : 'bg-primary-600'}`}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
                <p className={`text-xs mt-1.5 ${over ? 'text-danger-500' : 'text-neutral-400'}`}>
                  {Math.round(pct)}% utilizado {over ? `· ${centsToBRL(spent - b.limit_cents)} acima` : `· ${centsToBRL(b.limit_cents - spent)} restante`}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 animate-fade-in" onClick={() => setShowModal(false)}>
          <div className="card p-6 w-full max-w-md animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-neutral-900">{editing ? 'Editar orçamento' : 'Novo orçamento'}</h2>
              <button onClick={() => setShowModal(false)} className="text-neutral-400 hover:text-neutral-600 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            {error && <div className="mb-4 p-3 rounded-xl bg-danger-50 border border-danger-200 text-danger-700 text-sm">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Mês de referência</label>
                <select className="input" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
                  {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Categoria</label>
                <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
                  <option value="">Selecione</option>
                  {expenseCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Limite (R$)</label>
                <input className="input" placeholder="0,00" value={limit} onChange={(e) => setLimit(formatCurrencyInput(e.target.value))} required />
              </div>
              <div>
                <label className="label">Observações</label>
                <textarea className="input" rows={2} placeholder="Opcional" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <button type="submit" disabled={saving} className="btn-primary w-full">
                {saving ? 'Salvando...' : editing ? 'Salvar' : 'Criar orçamento'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
