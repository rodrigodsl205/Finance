import { useState } from 'react';
import { Plus, Target, Trash2, Edit3, X, TrendingUp, Check, Calendar, HandCoins } from 'lucide-react';
import { useGoals } from '@/hooks/useFinance';
import { useAuth } from '@/hooks/useAuth';
import { useSpaces } from '@/hooks/useSpaces';
import { supabase } from '@/lib/supabase';
import { centsToBRL, inputToCents } from '@/lib/money';
import { formatCurrencyInput, parseCurrencyInput } from '@/lib/format';
import { formatDateBR, todayISO } from '@/lib/dates';
import { GOAL_STATUS_LABELS } from '@/types';
import type { Goal, GoalStatus } from '@/types';

const STATUS_STYLES: Record<GoalStatus, string> = {
  active: 'bg-accent-100 text-accent-700',
  completed: 'bg-success-100 text-success-700',
  cancelled: 'bg-neutral-100 text-neutral-500',
};

export default function GoalsPage() {
  const { goals, loading, refresh } = useGoals();
  const { user } = useAuth();
  const { activeSpaceId } = useSpaces();

  const [showModal, setShowModal] = useState(false);
  const [showContribModal, setShowContribModal] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [contribGoal, setContribGoal] = useState<Goal | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [target, setTarget] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Contribution form
  const [contribAmount, setContribAmount] = useState('');
  const [contribDate, setContribDate] = useState(todayISO());
  const [contribNotes, setContribNotes] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !target || !activeSpaceId || !user) return;
    setSaving(true);
    setError(null);
    const targetCents = parseCurrencyInput(target);

    if (editing) {
      const { error } = await supabase
        .from('goals')
        .update({
          name: name.trim(), description: description.trim() || null,
          target_cents: targetCents, target_date: targetDate || null,
        })
        .eq('id', editing.id);
      if (error) setError(error.message);
    } else {
      const { error } = await supabase
        .from('goals')
        .insert({
          space_id: activeSpaceId, name: name.trim(),
          description: description.trim() || null, target_cents: targetCents,
          target_date: targetDate || null, responsible_id: user.id,
          created_by: user.id,
        });
      if (error) setError(error.message);
    }

    if (!error) {
      setShowModal(false);
      setEditing(null);
      setName(''); setDescription(''); setTarget(''); setTargetDate('');
      refresh();
    }
    setSaving(false);
  }

  async function handleContribute(e: React.FormEvent) {
    e.preventDefault();
    if (!contribGoal || !contribAmount || !user) return;
    setSaving(true);
    setError(null);
    const amountCents = parseCurrencyInput(contribAmount);

    const { error } = await supabase.from('goal_contributions').insert({
      goal_id: contribGoal.id, amount_cents: amountCents,
      contributed_by: user.id, contributed_at: contribDate,
      notes: contribNotes.trim() || null,
    });

    if (error) { setError(error.message); setSaving(false); return; }

    // Update goal current_cents
    const newCurrent = contribGoal.current_cents + amountCents;
    const newStatus = newCurrent >= contribGoal.target_cents ? 'completed' : contribGoal.status;
    await supabase.from('goals')
      .update({ current_cents: newCurrent, status: newStatus })
      .eq('id', contribGoal.id);

    setShowContribModal(false);
    setContribGoal(null);
    setContribAmount(''); setContribDate(todayISO()); setContribNotes('');
    refresh();
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir esta meta? Todo o histórico de contribuições será removido.')) return;
    await supabase.from('goals').delete().eq('id', id);
    refresh();
  }

  async function handleStatus(id: string, status: GoalStatus) {
    await supabase.from('goals').update({ status }).eq('id', id);
    refresh();
  }

  function openEdit(g: Goal) {
    setEditing(g);
    setName(g.name);
    setDescription(g.description ?? '');
    setTarget((g.target_cents / 100).toFixed(2).replace('.', ','));
    setTargetDate(g.target_date ?? '');
    setShowModal(true);
  }

  function openNew() {
    setEditing(null);
    setName(''); setDescription(''); setTarget(''); setTargetDate('');
    setShowModal(true);
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="animate-pulse text-neutral-400">Carregando...</div></div>;
  }

  const activeGoals = goals.filter(g => g.status === 'active');
  const completedGoals = goals.filter(g => g.status === 'completed');

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">Metas</h1>
        <button onClick={openNew} className="btn-primary"><Plus className="w-4 h-4" /> Nova meta</button>
      </div>

      {goals.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-neutral-100 flex items-center justify-center mx-auto mb-4">
            <Target className="w-8 h-8 text-neutral-400" />
          </div>
          <h3 className="text-lg font-semibold text-neutral-900 mb-1">Nenhuma meta criada</h3>
          <p className="text-sm text-neutral-500 max-w-md mx-auto mb-4">
            Crie metas como viagens, reserva de emergência ou compras e acompanhe o progresso das contribuições.
          </p>
          <button onClick={openNew} className="btn-primary mx-auto"><Plus className="w-4 h-4" /> Criar meta</button>
        </div>
      ) : (
        <>
          {/* Active goals */}
          {activeGoals.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide">Metas ativas</h2>
              {activeGoals.map((g) => {
                const pct = g.target_cents > 0 ? (g.current_cents / g.target_cents) * 100 : 0;
                const remaining = g.target_cents - g.current_cents;
                const daysLeft = g.target_date ? Math.ceil((new Date(g.target_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;
                return (
                  <div key={g.id} className="card p-5 group">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                          <Target className="w-5 h-5 text-primary-600" />
                        </div>
                        <div>
                          <p className="font-medium text-neutral-900">{g.name}</p>
                          {g.description && <p className="text-xs text-neutral-400 mt-0.5">{g.description}</p>}
                          {g.target_date && (
                            <p className="text-xs text-neutral-400 mt-0.5">
                              <Calendar className="inline w-3 h-3 mr-0.5" />
                              {formatDateBR(g.target_date)}
                              {daysLeft !== null && daysLeft >= 0 && ` · ${daysLeft} dias restantes`}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => { setContribGoal(g); setShowContribModal(true); }} className="text-xs text-primary-600 hover:text-primary-800 font-medium px-2.5 py-1.5 rounded-lg hover:bg-primary-50 transition-colors">
                          <HandCoins className="inline w-3.5 h-3.5 mr-0.5" />Contribuir
                        </button>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEdit(g)} className="p-1.5 rounded-lg text-neutral-300 hover:text-primary-600 hover:bg-primary-50 transition-colors">
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(g.id)} className="p-1.5 rounded-lg text-neutral-300 hover:text-danger-600 hover:bg-danger-50 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-neutral-400">{centsToBRL(g.current_cents)}</span>
                        <span className="text-neutral-400">{centsToBRL(g.target_cents)}</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-neutral-100 overflow-hidden">
                        <div className="h-full rounded-full bg-primary-600 transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="font-medium text-primary-600">{Math.round(pct)}% concluído</span>
                        <span className="text-neutral-400">{centsToBRL(remaining)} restante</span>
                      </div>
                    </div>

                    {g.contributions && g.contributions.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-neutral-100 space-y-1">
                        {g.contributions.slice(-3).reverse().map((c) => (
                          <div key={c.id} className="flex items-center justify-between text-xs">
                            <span className="text-neutral-500">
                              {c.profiles?.display_name ?? 'Eu'} · {formatDateBR(c.contributed_at)}
                            </span>
                            <span className="font-medium text-success-600">+{centsToBRL(c.amount_cents)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Completed goals */}
          {completedGoals.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide">Metas concluídas</h2>
              {completedGoals.map((g) => (
                <div key={g.id} className="card p-5 group opacity-75">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-success-50 flex items-center justify-center">
                        <Check className="w-5 h-5 text-success-600" />
                      </div>
                      <div>
                        <p className="font-medium text-neutral-900 line-through">{g.name}</p>
                        <p className="text-xs text-success-600">{centsToBRL(g.current_cents)} · Meta alcançada!</p>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleStatus(g.id, 'active')} className="text-xs text-primary-600 hover:text-primary-800 font-medium px-2 py-1 rounded-lg hover:bg-primary-50">
                        Reativar
                      </button>
                      <button onClick={() => handleDelete(g.id)} className="p-1.5 rounded-lg text-neutral-300 hover:text-danger-600 hover:bg-danger-50 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Goal modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 animate-fade-in" onClick={() => setShowModal(false)}>
          <div className="card p-6 w-full max-w-md animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-neutral-900">{editing ? 'Editar meta' : 'Nova meta'}</h2>
              <button onClick={() => setShowModal(false)} className="text-neutral-400 hover:text-neutral-600 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            {error && <div className="mb-4 p-3 rounded-xl bg-danger-50 border border-danger-200 text-danger-700 text-sm">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Nome da meta</label>
                <input className="input" placeholder="Ex: Viagem para Europa" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
              </div>
              <div>
                <label className="label">Descrição</label>
                <textarea className="input" rows={2} placeholder="Opcional" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div>
                <label className="label">Valor-alvo (R$)</label>
                <input className="input" placeholder="0,00" value={target} onChange={(e) => setTarget(formatCurrencyInput(e.target.value))} required />
              </div>
              <div>
                <label className="label">Prazo (opcional)</label>
                <input type="date" className="input" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
              </div>
              <button type="submit" disabled={saving} className="btn-primary w-full">
                {saving ? 'Salvando...' : editing ? 'Salvar' : 'Criar meta'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Contribution modal */}
      {showContribModal && contribGoal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 animate-fade-in" onClick={() => setShowContribModal(false)}>
          <div className="card p-6 w-full max-w-md animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-neutral-900">Contribuir para {contribGoal.name}</h2>
              <button onClick={() => setShowContribModal(false)} className="text-neutral-400 hover:text-neutral-600 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="mb-4 p-3 rounded-xl bg-primary-50 border border-primary-100">
              <p className="text-sm text-neutral-500">Progresso atual</p>
              <p className="text-lg font-bold text-primary-700">{centsToBRL(contribGoal.current_cents)} / {centsToBRL(contribGoal.target_cents)}</p>
            </div>
            {error && <div className="mb-4 p-3 rounded-xl bg-danger-50 border border-danger-200 text-danger-700 text-sm">{error}</div>}
            <form onSubmit={handleContribute} className="space-y-4">
              <div>
                <label className="label">Valor da contribuição (R$)</label>
                <input className="input" placeholder="0,00" value={contribAmount} onChange={(e) => setContribAmount(formatCurrencyInput(e.target.value))} required autoFocus />
              </div>
              <div>
                <label className="label">Data</label>
                <input type="date" className="input" value={contribDate} onChange={(e) => setContribDate(e.target.value)} required />
              </div>
              <div>
                <label className="label">Observações</label>
                <textarea className="input" rows={2} placeholder="Opcional" value={contribNotes} onChange={(e) => setContribNotes(e.target.value)} />
              </div>
              <button type="submit" disabled={saving} className="btn-primary w-full">
                {saving ? 'Salvando...' : 'Contribuir'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
