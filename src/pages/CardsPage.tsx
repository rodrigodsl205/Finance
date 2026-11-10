import { useState } from 'react';
import { Plus, CreditCard, Trash2, Edit3, X } from 'lucide-react';
import { useCards } from '@/hooks/useFinance';
import { useAuth } from '@/hooks/useAuth';
import { useSpaces } from '@/hooks/useSpaces';
import { supabase } from '@/lib/supabase';
import { centsToBRL } from '@/lib/money';
import { formatCurrencyInput, parseCurrencyInput } from '@/lib/format';
import { logger } from '@/lib/logger';
import { cardDisplayLabel } from '@/lib/dates';
import BrandManageModal from '@/components/BrandManageModal';
import type { Card } from '@/types';

const DEFAULT_BRANDS = ['Visa', 'Mastercard', 'Elo', 'American Express', 'Hipercard'];

const BRAND_COLORS: Record<string, string> = {
  Visa: 'bg-blue-50 text-blue-600',
  Mastercard: 'bg-orange-50 text-orange-600',
  Elo: 'bg-yellow-50 text-yellow-600',
  'American Express': 'bg-green-50 text-green-600',
  Hipercard: 'bg-red-50 text-red-600',
};

const DAY_OPTIONS: { value: string; label: string }[] = [
  { value: '1', label: 'Dia 1' },
  { value: '5', label: 'Dia 5' },
  { value: '10', label: 'Dia 10' },
  { value: '15', label: 'Dia 15' },
  { value: '20', label: 'Dia 20' },
  { value: '25', label: 'Dia 25' },
  { value: '28', label: 'Dia 28' },
  { value: '99', label: 'Último dia do mês' },
];

function dayLabel(value: string): string {
  if (value === '99') return 'Último dia do mês';
  return `Dia ${value}`;
}

export default function CardsPage() {
  const { cards, loading, refresh } = useCards();
  const { user } = useAuth();
  const { activeSpaceId } = useSpaces();

  const [showModal, setShowModal] = useState(false);
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [editing, setEditing] = useState<Card | null>(null);
  const [institution, setInstitution] = useState('');
  const [holderName, setHolderName] = useState('');
  const [brand, setBrand] = useState('');
  const [lastDigits, setLastDigits] = useState('');
  const [limit, setLimit] = useState('');
  const [closingDay, setClosingDay] = useState('1');
  const [dueDay, setDueDay] = useState('10');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customBrands = cards
    .map(c => c.brand)
    .filter((b): b is string => !!b && !DEFAULT_BRANDS.includes(b));
  const allBrands = [...DEFAULT_BRANDS, ...new Set(customBrands)];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!institution.trim() || !activeSpaceId || !user) return;
    setSaving(true);
    setError(null);
    const limitCents = parseCurrencyInput(limit || '0');
    const cardName = `${institution.trim()}${lastDigits.trim() ? ` ${lastDigits.trim()}` : ''}`;
    logger.info('Salvando cartão', { editing: !!editing, institution: institution.trim(), brand, limitCents });

    if (editing) {
      const { error } = await supabase
        .from('cards')
        .update({
          name: cardName, holder_name: holderName.trim() || null,
          brand: brand || null, last_digits: lastDigits.trim() || null,
          limit_cents: limitCents, closing_day: parseInt(closingDay), due_day: parseInt(dueDay),
        })
        .eq('id', editing.id);
      if (error) { logger.error('Erro ao atualizar cartão', error.message); setError(error.message); }
    } else {
      const { error } = await supabase
        .from('cards')
        .insert({
          space_id: activeSpaceId, name: cardName,
          holder_name: holderName.trim() || null, brand: brand || null,
          last_digits: lastDigits.trim() || null, limit_cents: limitCents,
          closing_day: parseInt(closingDay), due_day: parseInt(dueDay), owner_id: user.id,
        });
      if (error) { logger.error('Erro ao criar cartão', error.message); setError(error.message); }
    }

    if (!error) {
      logger.info('Cartão salvo com sucesso');
      setShowModal(false);
      setEditing(null);
      resetForm();
      refresh();
    }
    setSaving(false);
  }

  function resetForm() {
    setInstitution(''); setHolderName(''); setBrand(''); setLastDigits('');
    setLimit(''); setClosingDay('1'); setDueDay('10');
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir este cartão? As faturas associadas serão removidas.')) return;
    await supabase.from('cards').delete().eq('id', id);
    refresh();
  }

  function openEdit(card: Card) {
    setEditing(card);
    setInstitution(card.name.replace(/\s*\d{4}$/, ''));
    setHolderName(card.holder_name ?? '');
    setBrand(card.brand ?? '');
    setLastDigits(card.last_digits ?? '');
    setLimit(formatCurrencyInput(String(card.limit_cents)));
    setClosingDay(String(card.closing_day));
    setDueDay(String(card.due_day));
    setShowModal(true);
  }

  function openNew() {
    setEditing(null);
    resetForm();
    setShowModal(true);
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="animate-pulse text-neutral-400">Carregando...</div></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">Cartões</h1>
        <button onClick={openNew} className="btn-primary"><Plus className="w-4 h-4" /> Novo cartão</button>
      </div>

      {cards.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-neutral-100 flex items-center justify-center mx-auto mb-4">
            <CreditCard className="w-8 h-8 text-neutral-400" />
          </div>
          <h3 className="text-lg font-semibold text-neutral-900 mb-1">Nenhum cartão cadastrado</h3>
          <p className="text-sm text-neutral-500 max-w-md mx-auto mb-4">
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
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${BRAND_COLORS[card.brand ?? ''] ?? 'bg-neutral-100'}`}>
                    <CreditCard className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-semibold text-neutral-900">{card.name}</p>
                    {card.brand && <p className="text-xs text-neutral-400">{card.brand}</p>}
                    {card.last_digits && <p className="text-xs text-neutral-400">•••• {card.last_digits}</p>}
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(card)} className="p-1.5 rounded-lg text-neutral-400 hover:text-primary-600 hover:bg-primary-50 transition-colors">
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(card.id)} className="p-1.5 rounded-lg text-neutral-400 hover:text-danger-600 hover:bg-danger-50 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="space-y-2 pt-3 border-t border-neutral-100">
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-400">Limite</span>
                  <span className="font-medium text-neutral-900">{centsToBRL(card.limit_cents)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-400">Fechamento</span>
                  <span className="font-medium text-neutral-900">{dayLabel(String(card.closing_day))}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-400">Vencimento</span>
                  <span className="font-medium text-neutral-900">{dayLabel(String(card.due_day))}</span>
                </div>
                {card.holder_name && (
                  <p className="text-xs text-neutral-400 pt-1">{card.holder_name}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 animate-fade-in" onClick={() => setShowModal(false)}>
          <div className="card p-6 w-full max-w-md animate-scale-in max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-neutral-900">{editing ? 'Editar cartão' : 'Novo cartão'}</h2>
              <button onClick={() => setShowModal(false)} className="text-neutral-400 hover:text-neutral-600 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            {error && <div className="mb-4 p-3 rounded-xl bg-danger-50 border border-danger-200 text-danger-700 text-sm">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Instituição Financeira</label>
                <input className="input" placeholder="Ex: Banco do Brasil" value={institution} onChange={(e) => setInstitution(e.target.value)} required autoFocus />
              </div>
              <div>
                <label className="label">Titular</label>
                <input className="input" placeholder="Nome impresso no cartão" value={holderName} onChange={(e) => setHolderName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Bandeira</label>
                  <button
                    type="button"
                    onClick={() => setShowBrandModal(true)}
                    className="input text-left flex items-center justify-between"
                  >
                    <span className={brand ? 'text-neutral-800' : 'text-neutral-400'}>
                      {brand || 'Selecione'}
                    </span>
                    {allBrands.length === 0 && (
                      <span className="text-xs text-warning-600">Adicionar</span>
                    )}
                  </button>
                </div>
                <div>
                  <label className="label">Últimos 4 dígitos</label>
                  <input className="input" placeholder="1234" maxLength={4} value={lastDigits} onChange={(e) => setLastDigits(e.target.value.replace(/\D/g, ''))} />
                </div>
              </div>
              <div>
                <label className="label">Limite (R$)</label>
                <input className="input" placeholder="0,00" value={limit} onChange={(e) => setLimit(formatCurrencyInput(e.target.value))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Dia de fechamento</label>
                  <select className="input" value={closingDay} onChange={(e) => setClosingDay(e.target.value)}>
                    {DAY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    {!DAY_OPTIONS.some(opt => opt.value === closingDay) && <option value={closingDay}>{dayLabel(closingDay)}</option>}
                  </select>
                </div>
                <div>
                  <label className="label">Dia de vencimento</label>
                  <select className="input" value={dueDay} onChange={(e) => setDueDay(e.target.value)}>
                    {DAY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    {!DAY_OPTIONS.some(opt => opt.value === dueDay) && <option value={dueDay}>{dayLabel(dueDay)}</option>}
                  </select>
                </div>
              </div>
              <button type="submit" disabled={saving} className="btn-primary w-full">
                {saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Criar cartão'}
              </button>
            </form>
          </div>
        </div>
      )}

      <BrandManageModal
        open={showBrandModal}
        onClose={() => setShowBrandModal(false)}
        spaceId={activeSpaceId}
        selectedBrand={brand}
        onSelect={(b) => setBrand(b)}
      />
    </div>
  );
}
