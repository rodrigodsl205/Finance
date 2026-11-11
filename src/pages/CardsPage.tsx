import { useState } from 'react';
import { Plus, CreditCard, Trash2, Edit3 } from 'lucide-react';
import { useCards } from '@/hooks/useFinance';
import { useAuth } from '@/hooks/useAuth';
import { useSpaces } from '@/hooks/useSpaces';
import { supabase } from '@/lib/supabase';
import { centsToBRL } from '@/lib/money';
import { cardDisplayLabel } from '@/lib/dates';
import CardModal from '@/components/CardModal';
import type { Card } from '@/types';

const BRAND_COLORS: Record<string, string> = {
  Visa: 'bg-blue-50 text-blue-600',
  Mastercard: 'bg-orange-50 text-orange-600',
  Elo: 'bg-amber-50 text-amber-600',
  'American Express': 'bg-emerald-50 text-emerald-600',
  Hipercard: 'bg-rose-50 text-rose-600',
};

function dayLabel(value: number): string {
  return `Dia ${value}`;
}

export default function CardsPage() {
  const { cards, loading, refresh } = useCards();
  const { user } = useAuth();
  const { activeSpaceId } = useSpaces();

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Card | null>(null);

  async function handleDelete(id: string) {
    if (!confirm('Excluir este cartão? As faturas associadas serão removidas.')) return;
    await supabase.from('cards').delete().eq('id', id);
    refresh();
  }

  function openEdit(card: Card) {
    setEditing(card);
    setShowModal(true);
  }

  function openNew() {
    setEditing(null);
    setShowModal(true);
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="animate-pulse text-slate-400">Carregando...</div></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Cartões</h1>
        <button onClick={openNew} className="btn-primary"><Plus className="w-4 h-4" /> Novo cartão</button>
      </div>

      {cards.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <CreditCard className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-1">Nenhum cartão cadastrado</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mb-4">
            Cadastre seus cartões de crédito para acompanhar limite, faturas e compras parceladas.
          </p>
          <button onClick={openNew} className="btn-primary mx-auto"><Plus className="w-4 h-4" /> Cadastrar cartão</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((card) => (
            <div key={card.id} className="card p-5 group relative overflow-hidden">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${BRAND_COLORS[card.brand ?? ''] ?? 'bg-slate-100'}`}>
                    <CreditCard className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{card.name}</p>
                    {card.brand && <p className="text-xs text-slate-400">{card.brand}</p>}
                    {card.last_digits && <p className="text-xs text-slate-400">•••• {card.last_digits}</p>}
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(card)} className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(card.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="space-y-2 pt-3 border-t border-slate-100">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Limite</span>
                  <span className="font-medium text-slate-900">{centsToBRL(card.limit_cents)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Fechamento</span>
                  <span className="font-medium text-slate-900">{dayLabel(card.closing_day)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Vencimento</span>
                  <span className="font-medium text-slate-900">{dayLabel(card.due_day)}</span>
                </div>
                {card.holder_name && (
                  <p className="text-xs text-slate-400 pt-1">{card.holder_name}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <CardModal
        open={showModal}
        onClose={() => setShowModal(false)}
        spaceId={activeSpaceId}
        userId={user?.id ?? null}
        editingCard={editing}
        onSaved={refresh}
      />
    </div>
  );
}
