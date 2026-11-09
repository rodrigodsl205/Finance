import { useState, useMemo, useEffect } from 'react';
import { BarChart3, TrendingUp, TrendingDown, PieChart, Wallet, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { useTransactions, useCategories, type TransactionFilters } from '@/hooks/useFinance';
import { useSpaces } from '@/hooks/useSpaces';
import { supabase } from '@/lib/supabase';
import { centsToBRL } from '@/lib/money';
import { getCurrentMonthRange, monthLabel } from '@/lib/dates';
import {
  PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, Legend,
} from 'recharts';

const COLORS = ['#0d7d4f', '#2563eb', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'];

export default function ReportsPage() {
  const { activeSpaceId } = useSpaces();
  const [range, setRange] = useState<'month' | 'quarter' | 'year'>('month');
  const [startDate, setStartDate] = useState(getCurrentMonthRange().start);
  const [endDate, setEndDate] = useState(getCurrentMonthRange().end);

  useEffect(() => {
    const now = new Date();
    if (range === 'month') {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setStartDate(s.toISOString().split('T')[0]);
      setEndDate(e.toISOString().split('T')[0]);
    } else if (range === 'quarter') {
      const q = Math.floor(now.getMonth() / 3);
      const s = new Date(now.getFullYear(), q * 3, 1);
      const e = new Date(now.getFullYear(), q * 3 + 3, 0);
      setStartDate(s.toISOString().split('T')[0]);
      setEndDate(e.toISOString().split('T')[0]);
    } else {
      const s = new Date(now.getFullYear(), 0, 1);
      const e = new Date(now.getFullYear(), 11, 31);
      setStartDate(s.toISOString().split('T')[0]);
      setEndDate(e.toISOString().split('T')[0]);
    }
  }, [range]);

  const filters: TransactionFilters = useMemo(() => ({
    dateCriterion: 'occurred_at',
    startDate, endDate,
  }), [startDate, endDate]);

  const { transactions, loading } = useTransactions(filters);
  const { categories } = useCategories();

  // Compute summary
  const summary = useMemo(() => {
    let income = 0, expense = 0;
    for (const t of transactions) {
      if (t.type === 'income') income += t.amount_cents;
      else if (t.type === 'expense') expense += t.amount_cents;
    }
    return { income, expense, balance: income - expense };
  }, [transactions]);

  // Spending by category
  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of transactions) {
      if (t.type !== 'expense') continue;
      const name = t.categories?.name ?? 'Sem categoria';
      map[name] = (map[name] ?? 0) + t.amount_cents;
    }
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [transactions]);

  // Spending by payment method
  const byPaymentMethod = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of transactions) {
      if (t.type !== 'expense') continue;
      const name = t.payment_methods?.name ?? 'Não informado';
      map[name] = (map[name] ?? 0) + t.amount_cents;
    }
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [transactions]);

  // Monthly trend (last 6 months)
  const monthlyTrend = useMemo(() => {
    const months: { label: string; income: number; expense: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStart = d.toISOString().split('T')[0];
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
      const monthTx = transactions.filter(t => {
        if (t.occurred_at < monthStart || t.occurred_at > monthEnd) return false;
        return true;
      });
      months.push({
        label: monthLabel(d.getFullYear(), d.getMonth()).substring(0, 3),
        income: monthTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount_cents, 0) / 100,
        expense: monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount_cents, 0) / 100,
      });
    }
    return months;
  }, [transactions]);

  // Biggest expenses
  const biggestExpenses = useMemo(() => {
    return transactions
      .filter(t => t.type === 'expense')
      .sort((a, b) => b.amount_cents - a.amount_cents)
      .slice(0, 5);
  }, [transactions]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="animate-pulse text-neutral-400">Carregando...</div></div>;
  }

  const hasData = transactions.length > 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">Relatórios</h1>
      </div>

      {/* Range selector */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-2">
            {(['month', 'quarter', 'year'] as const).map(r => (
              <button key={r} onClick={() => setRange(r)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  range === r ? 'bg-primary-600 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                }`}>
                {r === 'month' ? 'Mês' : r === 'quarter' ? 'Trimestre' : 'Ano'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input type="date" className="input py-2 text-sm w-auto" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <span className="text-neutral-400 text-sm">até</span>
            <input type="date" className="input py-2 text-sm w-auto" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-neutral-500">Receitas</span>
            <div className="w-9 h-9 rounded-xl bg-success-50 flex items-center justify-center">
              <ArrowDownCircle className="w-5 h-5 text-success-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-success-600">{centsToBRL(summary.income)}</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-neutral-500">Despesas</span>
            <div className="w-9 h-9 rounded-xl bg-danger-50 flex items-center justify-center">
              <ArrowUpCircle className="w-5 h-5 text-danger-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-danger-600">{centsToBRL(summary.expense)}</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-neutral-500">Saldo</span>
            <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-primary-600" />
            </div>
          </div>
          <p className={`text-2xl font-bold ${summary.balance >= 0 ? 'text-primary-600' : 'text-danger-600'}`}>{centsToBRL(summary.balance)}</p>
        </div>
      </div>

      {!hasData ? (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-neutral-100 flex items-center justify-center mx-auto mb-4">
            <BarChart3 className="w-8 h-8 text-neutral-400" />
          </div>
          <h3 className="text-lg font-semibold text-neutral-900 mb-1">Sem dados no período</h3>
          <p className="text-sm text-neutral-500 max-w-md mx-auto">
            Não há lançamentos no período selecionado. Registre receitas e despesas para ver os relatórios.
          </p>
        </div>
      ) : (
        <>
          {/* Monthly trend chart */}
          <div className="card p-5">
            <h2 className="font-semibold text-neutral-900 mb-4">Tendência mensal</h2>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#999' }} />
                <YAxis tick={{ fontSize: 12, fill: '#999' }} tickFormatter={(v) => `R$${v}`} />
                <Tooltip formatter={(v: number) => centsToBRL(v * 100)} contentStyle={{ borderRadius: 12, border: '1px solid #eee', fontSize: 13 }} />
                <Legend wrapperStyle={{ fontSize: 13 }} />
                <Line type="monotone" dataKey="income" stroke="#16a34a" name="Receitas" strokeWidth={2.5} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="expense" stroke="#dc2626" name="Despesas" strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Two-column: Pie + Bar */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Pie chart: spending by category */}
            <div className="card p-5">
              <h2 className="font-semibold text-neutral-900 mb-4 flex items-center gap-2">
                <PieChart className="w-5 h-5 text-primary-600" /> Gastos por categoria
              </h2>
              {byCategory.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <RechartsPieChart>
                      <Pie data={byCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40}>
                        {byCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => centsToBRL(v)} contentStyle={{ borderRadius: 12, border: '1px solid #eee', fontSize: 13 }} />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 mt-2">
                    {byCategory.slice(0, 5).map((c, i) => (
                      <div key={c.name} className="flex items-center gap-2 text-sm">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-neutral-600 flex-1 truncate">{c.name}</span>
                        <span className="font-medium text-neutral-900">{centsToBRL(c.value)}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : <p className="text-sm text-neutral-400 py-8 text-center">Sem despesas no período</p>}
            </div>

            {/* Bar chart: spending by payment method */}
            <div className="card p-5">
              <h2 className="font-semibold text-neutral-900 mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary-600" /> Por forma de pagamento
              </h2>
              {byPaymentMethod.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={byPaymentMethod} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#999' }} tickFormatter={(v) => `R$${(v / 100).toFixed(0)}`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#666' }} width={120} />
                    <Tooltip formatter={(v: number) => centsToBRL(v)} contentStyle={{ borderRadius: 12, border: '1px solid #eee', fontSize: 13 }} cursor={{ fill: '#f9fafb' }} />
                    <Bar dataKey="value" fill="#0d7d4f" radius={[0, 6, 6, 0]} barSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-neutral-400 py-8 text-center">Sem dados de pagamento</p>}
            </div>
          </div>

          {/* Biggest expenses */}
          <div className="card p-5">
            <h2 className="font-semibold text-neutral-900 mb-4">Maiores despesas</h2>
            <div className="space-y-2">
              {biggestExpenses.map((t, i) => (
                <div key={t.id} className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-neutral-50 transition-colors">
                  <div className="w-7 h-7 rounded-lg bg-neutral-100 flex items-center justify-center shrink-0 text-sm font-medium text-neutral-500">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-900 truncate">{t.description}</p>
                    <p className="text-xs text-neutral-400">
                      {t.categories?.name ?? 'Sem categoria'}
                      {t.establishment ? ` · ${t.establishment}` : ''}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-danger-600 shrink-0">{centsToBRL(t.amount_cents)}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
