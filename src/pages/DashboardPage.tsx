import { useState, useEffect, useMemo } from 'react';
import { Wallet, TrendingUp, TrendingDown, Calendar, CreditCard, ArrowLeftRight } from 'lucide-react';
import { centsToBRL } from '@/lib/money';
import { getCurrentMonthRange, formatDateBR, monthLabel } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useSpaces } from '@/hooks/useSpaces';
import { TRANSACTION_STATUS_LABELS } from '@/types';
import type { Transaction } from '@/types';
import type { DateCriterion } from '@/types';

export default function DashboardPage() {
  const { activeSpace, loading: spaceLoading } = useSpaces();
  const { profile } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accountCount, setAccountCount] = useState(0);
  const [totalBalance, setTotalBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dateCriterion, setDateCriterion] = useState<DateCriterion>('occurred_at');

  const { start, end } = getCurrentMonthRange();
  const monthStr = monthLabel(parseInt(start.split('-')[0]), parseInt(start.split('-')[1]) - 1);

  const activeSpaceId = activeSpace?.id;

  useEffect(() => {
    async function fetchData() {
      if (!activeSpaceId) { setLoading(false); return; }

      // Fetch transactions for current month
      const { data: txData } = await supabase
        .from('transactions')
        .select(`
          *,
          categories:categories!transactions_category_id_fkey(name, kind),
          accounts:accounts!transactions_account_id_fkey(name, type)
        `)
        .eq('space_id', activeSpaceId)
        .gte(dateCriterion, start)
        .lte(dateCriterion, end)
        .order('occurred_at', { ascending: false })
        .limit(10);

      setTransactions((txData as unknown as Transaction[]) ?? []);

      // Fetch accounts
      const { data: accData } = await supabase
        .from('accounts')
        .select('initial_balance_cents')
        .eq('space_id', activeSpaceId)
        .eq('status', 'active');

      setAccountCount(accData?.length ?? 0);
      setTotalBalance(accData?.reduce((sum, a) => sum + (a as { initial_balance_cents: number }).initial_balance_cents, 0) ?? 0);

      setLoading(false);
    }
    fetchData();
  }, [activeSpaceId, dateCriterion, start, end]);

  // Realtime
  useEffect(() => {
    if (!activeSpaceId) return;
    const channel = supabase
      .channel(`dashboard-${activeSpaceId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'transactions', filter: `space_id=eq.${activeSpaceId}` },
        () => { setLoading(true); }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'accounts', filter: `space_id=eq.${activeSpaceId}` },
        () => { setLoading(true); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeSpaceId]);

  const summary = useMemo(() => {
    let income = 0, expenses = 0, pending = 0;
    for (const tx of transactions) {
      if (tx.type === 'income') income += tx.amount_cents;
      else if (tx.type === 'expense') expenses += tx.amount_cents;
      if (tx.status === 'pending') pending += tx.amount_cents;
    }
    return { income, expenses, pending, balance: income - expenses };
  }, [transactions]);

  if (spaceLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-neutral-400">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Olá, {profile?.display_name?.split(' ')[0]}</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Espaço: <span className="font-medium text-neutral-700">{activeSpace?.name ?? '—'}</span>
        </p>
      </div>

      {/* Date criterion selector */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-neutral-500">Visão:</label>
        <select
          className="input py-2 text-sm w-auto"
          value={dateCriterion}
          onChange={(e) => setDateCriterion(e.target.value as DateCriterion)}
        >
          <option value="occurred_at">Realização</option>
          <option value="due_date">Vencimento</option>
          <option value="paid_at">Pagamento efetivo</option>
        </select>
        <span className="text-sm text-neutral-400">· {monthStr}</span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-neutral-500">Saldo das contas</span>
            <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-primary-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-neutral-900">{centsToBRL(totalBalance)}</p>
          <p className="text-xs text-neutral-400 mt-1">
            {accountCount === 0 ? 'Nenhuma conta' : `${accountCount} ${accountCount === 1 ? 'conta' : 'contas'}`}
          </p>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-neutral-500">Receitas (mês)</span>
            <div className="w-9 h-9 rounded-xl bg-success-50 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-success-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-success-700">{centsToBRL(summary.income)}</p>
          <p className="text-xs text-neutral-400 mt-1">
            {transactions.filter(t => t.type === 'income').length} lançamentos
          </p>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-neutral-500">Despesas (mês)</span>
            <div className="w-9 h-9 rounded-xl bg-danger-50 flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-danger-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-danger-700">{centsToBRL(summary.expenses)}</p>
          <p className="text-xs text-neutral-400 mt-1">
            {transactions.filter(t => t.type === 'expense').length} lançamentos
          </p>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-neutral-500">Pendentes</span>
            <div className="w-9 h-9 rounded-xl bg-accent-50 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-accent-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-neutral-900">{centsToBRL(summary.pending)}</p>
          <p className="text-xs text-neutral-400 mt-1">Aguardando pagamento</p>
        </div>
      </div>

      {/* Recent activity */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-neutral-900">Atividade recente</h2>
          <span className="text-xs text-neutral-400">{monthStr}</span>
        </div>

        {transactions.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-14 h-14 rounded-2xl bg-neutral-100 flex items-center justify-center mx-auto mb-3">
              <ArrowLeftRight className="w-7 h-7 text-neutral-400" />
            </div>
            <p className="text-sm text-neutral-500">
              Nenhum lançamento em {monthStr}. Registre sua primeira receita ou despesa.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-neutral-50 transition-colors">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  tx.type === 'income' ? 'bg-success-50' : tx.type === 'transfer' ? 'bg-primary-50' : 'bg-danger-50'
                }`}>
                  {tx.type === 'income' ? <TrendingUp className="w-4 h-4 text-success-600" /> :
                   tx.type === 'transfer' ? <ArrowLeftRight className="w-4 h-4 text-primary-600" /> :
                   <TrendingDown className="w-4 h-4 text-danger-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-900 truncate">{tx.description}</p>
                  <p className="text-xs text-neutral-400">
                    {formatDateBR(tx.occurred_at)} · {tx.categories?.name ?? 'Sem categoria'}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-semibold ${tx.type === 'income' ? 'text-success-600' : tx.type === 'expense' ? 'text-danger-600' : 'text-neutral-600'}`}>
                    {tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : ''}{centsToBRL(tx.amount_cents)}
                  </p>
                  <p className="text-xs text-neutral-400">{TRANSACTION_STATUS_LABELS[tx.status]}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Empty state for new users */}
      {transactions.length === 0 && accountCount === 0 && (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center mx-auto mb-4">
            <CreditCard className="w-8 h-8 text-primary-600" />
          </div>
          <h3 className="text-lg font-semibold text-neutral-900 mb-1">Bem-vindo ao DualCash!</h3>
          <p className="text-sm text-neutral-500 max-w-md mx-auto">
            Comece cadastrando suas contas e categorias, depois registre seus primeiros lançamentos.
            Tudo se sincroniza em tempo real entre os dispositivos.
          </p>
        </div>
      )}
    </div>
  );
}
