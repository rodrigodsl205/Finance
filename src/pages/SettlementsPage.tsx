import { useState, useEffect, useMemo, useCallback } from 'react';
import { Scale, Plus, X, ArrowRight, Check, Clock, HandCoins } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useSpaces } from '@/hooks/useSpaces';
import { useSettlements } from '@/hooks/useFinance';
import { supabase } from '@/lib/supabase';
import { centsToBRL, inputToCents } from '@/lib/money';
import { formatDateBR, todayISO } from '@/lib/dates';
import { SETTLEMENT_STATUS_LABELS } from '@/types';
import type { SettlementStatus } from '@/types';

interface Balance {
  memberId: string;
  memberName: string;
  paid: number;
  owes: number;
  net: number;
}

const STATUS_STYLES: Record<SettlementStatus, string> = {
  pending: 'bg-accent-100 text-accent-700',
  paid: 'bg-success-100 text-success-700',
  cancelled: 'bg-neutral-100 text-neutral-500',
};

export default function SettlementsPage() {
  const { user } = useAuth();
  const { activeSpaceId, activeMembers, activeSpace } = useSpaces();
  const { settlements, loading, refresh } = useSettlements();

  const [balances, setBalances] = useState<Balance[]>([]);
  const [balancesLoading, setBalancesLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [fromMember, setFromMember] = useState('');
  const [toMember, setToMember] = useState('');
  const [amount, setAmount] = useState('');
  const [paidAt, setPaidAt] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const memberName = useCallback((uid: string) => {
    if (uid === user?.id) return 'Eu';
    const m = activeMembers.find(m => m.user_id === uid);
    return m?.profiles?.display_name ?? 'Membro';
  }, [activeMembers, user?.id]);

  // Calculate balances from splits + transfers + settlements
  const computeBalances = useCallback(async () => {
    if (!activeSpaceId || !user) { setBalancesLoading(false); return; }
    setBalancesLoading(true);

    // Fetch all expense transactions with splits for this space
    const { data: txData } = await supabase
      .from('transactions')
      .select(`
        id, type, amount_cents, created_by, split_type,
        splits:transaction_splits(member_id, share_cents),
        destination_member_id
      `)
      .eq('space_id', activeSpaceId)
      .eq('status', 'paid')
      .in('type', ['expense', 'transfer']);

    // Build per-member balance map
    const map: Record<string, { paid: number; owes: number }> = {};

    function ensure(uid: string) {
      if (!map[uid]) map[uid] = { paid: 0, owes: 0 };
    }

    for (const tx of (txData as unknown as { id: string; type: string; amount_cents: number; created_by: string; split_type: string; splits: { member_id: string; share_cents: number }[]; destination_member_id: string | null }[]) ?? []) {
      if (tx.type === 'transfer' && tx.destination_member_id) {
        // Transfer to another person: I paid, they received
        ensure(tx.created_by);
        ensure(tx.destination_member_id);
        map[tx.created_by].paid += tx.amount_cents;
        map[tx.destination_member_id].owes += tx.amount_cents;
        continue;
      }

      if (tx.type !== 'expense') continue;

      ensure(tx.created_by);
      const totalCents = tx.amount_cents;

      if (tx.split_type === 'individual' || !tx.splits || tx.splits.length === 0) {
        // Individual: creator paid the whole thing, owes the whole thing
        map[tx.created_by].paid += totalCents;
        map[tx.created_by].owes += totalCents;
      } else {
        // Split: creator paid total, each member owes their share
        map[tx.created_by].paid += totalCents;
        const totalSplit = tx.splits.reduce((s, sp) => s + sp.share_cents, 0);
        // Creator's share = total - sum of others' shares
        const creatorShare = totalCents - totalSplit;
        map[tx.created_by].owes += creatorShare;
        for (const sp of tx.splits) {
          ensure(sp.member_id);
          map[sp.member_id].owes += sp.share_cents;
        }
      }
    }

    // Subtract settled amounts
    for (const s of settlements) {
      if (s.status === 'paid') {
        ensure(s.from_member_id);
        ensure(s.to_member_id);
        map[s.from_member_id].owes -= s.amount_cents;
        map[s.to_member_id].paid -= s.amount_cents;
      }
    }

    const result: Balance[] = Object.entries(map).map(([uid, v]) => ({
      memberId: uid,
      memberName: memberName(uid),
      paid: v.paid,
      owes: v.owes,
      net: v.paid - v.owes,
    }));

    setBalances(result);
    setBalancesLoading(false);
  }, [activeSpaceId, user, settlements, memberName]);

  useEffect(() => { computeBalances(); }, [computeBalances]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!fromMember || !toMember || !amount || !activeSpaceId || !user) return;
    setSaving(true);
    setError(null);

    const { error: insertError } = await supabase.from('settlements').insert({
      space_id: activeSpaceId,
      from_member_id: fromMember,
      to_member_id: toMember,
      amount_cents: inputToCents(amount),
      status: paidAt ? 'paid' : 'pending',
      paid_at: paidAt || null,
      notes: notes.trim() || null,
      created_by: user.id,
    });

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    setShowModal(false);
    setFromMember(''); setToMember(''); setAmount(''); setPaidAt(todayISO()); setNotes('');
    refresh();
    setSaving(false);
  }

  async function handleMarkPaid(id: string) {
    await supabase.from('settlements').update({ status: 'paid', paid_at: todayISO() }).eq('id', id);
    refresh();
  }

  const pendingSettlements = settlements.filter(s => s.status === 'pending');
  const paidSettlements = settlements.filter(s => s.status === 'paid');

  const summary = useMemo(() => {
    const totalNet = balances.reduce((sum, b) => sum + b.net, 0);
    const largestDebt = balances.filter(b => b.net < 0).sort((a, b) => a.net - b.net)[0];
    const largestCredit = balances.filter(b => b.net > 0).sort((a, b) => b.net - b.net)[0];
    return { totalNet, largestDebt, largestCredit };
  }, [balances]);

  if (loading || balancesLoading) {
    return <div className="flex items-center justify-center py-20"><div className="animate-pulse text-neutral-400">Carregando...</div></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">Acertos</h1>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Novo acerto
        </button>
      </div>

      {activeSpace?.kind === 'personal' && (
        <div className="card p-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-neutral-100 flex items-center justify-center mx-auto mb-3">
            <HandCoins className="w-7 h-7 text-neutral-400" />
          </div>
          <h3 className="text-lg font-semibold text-neutral-900 mb-1">Acertos são para espaços compartilhados</h3>
          <p className="text-sm text-neutral-500 max-w-md mx-auto">
            Convide outra pessoa para este espaço para começar a dividir despesas e fazer acertos.
          </p>
        </div>
      )}

      {/* Balance summary */}
      {activeSpace?.kind === 'shared' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-neutral-500">Saldo consolidado</span>
                <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center">
                  <Scale className="w-5 h-5 text-primary-600" />
                </div>
              </div>
              <p className="text-2xl font-bold text-neutral-900">{centsToBRL(summary.totalNet)}</p>
            </div>
            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-neutral-500">Devedor</span>
                <Clock className="w-5 h-5 text-danger-500" />
              </div>
              {summary.largestDebt ? (
                <>
                  <p className="text-lg font-semibold text-danger-700">{summary.largestDebt.memberName}</p>
                  <p className="text-xl font-bold text-danger-600">{centsToBRL(Math.abs(summary.largestDebt.net))}</p>
                </>
              ) : <p className="text-sm text-neutral-400">Ninguém deve</p>}
            </div>
            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-neutral-500">Credor</span>
                <Check className="w-5 h-5 text-success-500" />
              </div>
              {summary.largestCredit ? (
                <>
                  <p className="text-lg font-semibold text-success-700">{summary.largestCredit.memberName}</p>
                  <p className="text-xl font-bold text-success-600">{centsToBRL(summary.largestCredit.net)}</p>
                </>
              ) : <p className="text-sm text-neutral-400">Sem credor</p>}
            </div>
          </div>

          {/* Per-member balances */}
          <div className="card p-5">
            <h2 className="font-semibold text-neutral-900 mb-4">Saldos por pessoa</h2>
            {balances.length === 0 ? (
              <p className="text-sm text-neutral-500 py-4 text-center">
                Nenhum lançamento pago ainda. Os saldos aparecem após registrar e pagar despesas compartilhadas.
              </p>
            ) : (
              <div className="space-y-2">
                {balances.map(b => (
                  <div key={b.memberId} className="flex items-center justify-between py-3 px-4 rounded-xl hover:bg-neutral-50 transition-colors">
                    <span className="font-medium text-neutral-900">{b.memberName}</span>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${b.net > 0 ? 'text-success-600' : b.net < 0 ? 'text-danger-600' : 'text-neutral-600'}`}>
                        {b.net > 0 ? '+' : b.net < 0 ? '−' : ''}{centsToBRL(Math.abs(b.net))}
                      </p>
                      <p className="text-xs text-neutral-400">
                        Pagou {centsToBRL(b.paid)} · Deve {centsToBRL(b.owes)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Suggested settlement */}
          {summary.largestDebt && summary.largestCredit && summary.largestDebt.net < 0 && summary.largestCredit.net > 0 && (
            <div className="card p-5 bg-primary-50/30 border-primary-100">
              <h2 className="font-semibold text-neutral-900 mb-3">Acerto sugerido</h2>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-neutral-700">
                    <span className="font-medium">{summary.largestDebt.memberName}</span>
                    <ArrowRight className="inline w-4 h-4 mx-1 text-neutral-400" />
                    <span className="font-medium">{summary.largestCredit.memberName}</span>
                  </p>
                  <p className="text-2xl font-bold text-primary-700 mt-1">
                    {centsToBRL(Math.min(Math.abs(summary.largestDebt.net), summary.largestCredit.net))}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setFromMember(summary.largestDebt.memberId);
                    setToMember(summary.largestCredit.memberId);
                    setAmount((Math.min(Math.abs(summary.largestDebt.net), summary.largestCredit.net) / 100).toFixed(2).replace('.', ','));
                    setShowModal(true);
                  }}
                  className="btn-primary"
                >
                  <Check className="w-4 h-4" /> Registrar acerto
                </button>
              </div>
            </div>
          )}

          {/* Pending settlements */}
          {pendingSettlements.length > 0 && (
            <div className="card p-5">
              <h2 className="font-semibold text-neutral-900 mb-4">Acertos pendentes</h2>
              <div className="space-y-2">
                {pendingSettlements.map(s => (
                  <div key={s.id} className="flex items-center gap-3 py-3 px-4 rounded-xl hover:bg-neutral-50 group transition-colors">
                    <div className="w-9 h-9 rounded-lg bg-accent-50 flex items-center justify-center shrink-0">
                      <HandCoins className="w-4 h-4 text-accent-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-900">
                        {s.from_profile?.display_name ?? '—'}
                        <ArrowRight className="inline w-3.5 h-3.5 mx-1 text-neutral-400" />
                        {s.to_profile?.display_name ?? '—'}
                      </p>
                      {s.notes && <p className="text-xs text-neutral-400">{s.notes}</p>}
                    </div>
                    <p className="font-semibold text-neutral-900 shrink-0">{centsToBRL(s.amount_cents)}</p>
                    <button onClick={() => handleMarkPaid(s.id)}
                      className="text-xs text-primary-600 hover:text-primary-800 font-medium opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      Marcar pago
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Paid settlements */}
          {paidSettlements.length > 0 && (
            <div className="card p-5">
              <h2 className="font-semibold text-neutral-900 mb-4">Acertos pagos</h2>
              <div className="space-y-2">
                {paidSettlements.map(s => (
                  <div key={s.id} className="flex items-center gap-3 py-3 px-4 rounded-xl">
                    <div className="w-9 h-9 rounded-lg bg-success-50 flex items-center justify-center shrink-0">
                      <Check className="w-4 h-4 text-success-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-900">
                        {s.from_profile?.display_name ?? '—'}
                        <ArrowRight className="inline w-3.5 h-3.5 mx-1 text-neutral-400" />
                        {s.to_profile?.display_name ?? '—'}
                      </p>
                      <p className="text-xs text-neutral-400">{formatDateBR(s.paid_at ?? s.created_at)}</p>
                    </div>
                    <p className="font-semibold text-neutral-500 shrink-0">{centsToBRL(s.amount_cents)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 animate-fade-in" onClick={() => setShowModal(false)}>
          <div className="card p-6 w-full max-w-md animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-neutral-900">Novo acerto</h2>
              <button onClick={() => setShowModal(false)} className="text-neutral-400 hover:text-neutral-600 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            {error && <div className="mb-4 p-3 rounded-xl bg-danger-50 border border-danger-200 text-danger-700 text-sm">{error}</div>}
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="label">Quem paga</label>
                <select className="input" value={fromMember} onChange={(e) => setFromMember(e.target.value)} required>
                  <option value="">Selecione</option>
                  {activeMembers.map(m => <option key={m.user_id} value={m.user_id}>{m.user_id === user?.id ? 'Eu' : (m.profiles?.display_name ?? 'Membro')}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Para quem</label>
                <select className="input" value={toMember} onChange={(e) => setToMember(e.target.value)} required>
                  <option value="">Selecione</option>
                  {activeMembers.filter(m => m.user_id !== fromMember).map(m => <option key={m.user_id} value={m.user_id}>{m.user_id === user?.id ? 'Eu' : (m.profiles?.display_name ?? 'Membro')}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Valor (R$)</label>
                <input className="input" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} required />
              </div>
              <div>
                <label className="label">Data de pagamento</label>
                <input type="date" className="input" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
              </div>
              <div>
                <label className="label">Observações</label>
                <textarea className="input" rows={2} placeholder="Opcional" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <button type="submit" disabled={saving} className="btn-primary w-full">
                {saving ? 'Salvando...' : 'Registrar acerto'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
