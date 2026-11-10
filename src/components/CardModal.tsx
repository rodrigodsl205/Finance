import { useState, useEffect, useCallback } from 'react';
import { X, CreditCard, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { formatCurrencyInput, parseCurrencyInput } from '@/lib/format';
import BrandManageModal from '@/components/BrandManageModal';
import type { Card } from '@/types';

const DEFAULT_BRANDS = ['Visa', 'Mastercard', 'Elo', 'American Express', 'Hipercard'];

interface Props {
  open: boolean;
  onClose: () => void;
  spaceId: string | null;
  userId: string | null;
  editingCard?: Card | null;
  onSaved: () => void;
  selectMode?: boolean;
  onSelect?: (card: Card) => void;
  cards?: Card[];
}

function clampDay(value: string, fallback: number): number {
  return Math.min(31, Math.max(1, parseInt(value, 10) || fallback));
}

export default function CardModal({ open, onClose, spaceId, userId, editingCard, onSaved, selectMode, onSelect, cards = [] }: Props) {
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [editing, setEditing] = useState<Card | null>(null);
  const [institution, setInstitution] = useState('');
  const [holderName, setHolderName] = useState('');
  const [brand, setBrand] = useState('');
  const [lastDigits, setLastDigits] = useState('');
  const [limit, setLimit] = useState('');
  const [closingDayInput, setClosingDayInput] = useState('1');
  const [dueDayInput, setDueDayInput] = useState('10');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const customBrands = cards
    .map(c => c.brand)
    .filter((b): b is string => !!b && !DEFAULT_BRANDS.includes(b));
  const allBrands = [...DEFAULT_BRANDS, ...new Set(customBrands)];

  const resetForm = useCallback(() => {
    setInstitution(''); setHolderName(''); setBrand(''); setLastDigits('');
    setLimit(''); setClosingDayInput('1'); setDueDayInput('10');
    setError(null); setSuccessMsg(null);
  }, []);

  useEffect(() => {
    if (open) {
      setError(null);
      setSuccessMsg(null);
      if (editingCard) {
        setEditing(editingCard);
        setInstitution(editingCard.name.replace(/\s*\d{4}$/, ''));
        setHolderName(editingCard.holder_name ?? '');
        setBrand(editingCard.brand ?? '');
        setLastDigits(editingCard.last_digits ?? '');
        setLimit(formatCurrencyInput(String(editingCard.limit_cents)));
        setClosingDayInput(String(editingCard.closing_day));
        setDueDayInput(String(editingCard.due_day));
      } else {
        setEditing(null);
        resetForm();
      }
    }
  }, [open, editingCard, resetForm]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!institution.trim() || !spaceId) return;
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    const closingDay = clampDay(closingDayInput, 1);
    const dueDay = clampDay(dueDayInput, 10);
    const limitCents = parseCurrencyInput(limit || '0');
    const cardName = `${institution.trim()}${lastDigits.trim() ? ` ${lastDigits.trim()}` : ''}`;
    logger.info('Salvando cartão', { editing: !!editing, institution: institution.trim(), brand, closingDay, dueDay });

    try {
      if (editing) {
        const { error: updateError } = await supabase
          .from('cards')
          .update({
            name: cardName,
            holder_name: holderName.trim() || null,
            brand: brand || null,
            last_digits: lastDigits.trim() || null,
            limit_cents: limitCents,
            closing_day: closingDay,
            due_day: dueDay,
          })
          .eq('id', editing.id);

        if (updateError) throw updateError;
      } else {
        if (!userId) {
          setError('Usuário não autenticado.');
          setSaving(false);
          return;
        }
        const { error: insertError } = await supabase
          .from('cards')
          .insert({
            space_id: spaceId,
            name: cardName,
            holder_name: holderName.trim() || null,
            brand: brand || null,
            last_digits: lastDigits.trim() || null,
            limit_cents: limitCents,
            closing_day: closingDay,
            due_day: dueDay,
            owner_id: userId,
          });

        if (insertError) throw insertError;
      }

      setSuccessMsg(editing ? 'Cartão atualizado com sucesso!' : 'Cartão criado com sucesso!');
      onSaved();
      if (!selectMode) {
        onClose();
      } else {
        setEditing(null);
        resetForm();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar cartão';
      logger.error('Erro ao salvar cartão', msg);
      setError(msg);
    }
    setSaving(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/30 animate-fade-in" onClick={onClose}>
      <div className="card p-6 w-full max-w-md animate-scale-in max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-neutral-900">
            {selectMode ? 'Selecionar cartão' : editing ? 'Editar cartão' : 'Novo cartão'}
          </h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 transition-colors"><X className="w-5 h-5" /></button>
        </div>

        {selectMode && cards.length > 0 && (
          <div className="space-y-1 mb-4">
            {cards.map(c => (
              <div
                key={c.id}
                className={`flex items-center gap-3 py-2.5 px-3 rounded-xl cursor-pointer transition-colors hover:bg-primary-50 ${editingCard?.id === c.id ? 'bg-primary-50 ring-1 ring-primary-200' : ''}`}
                onClick={() => { if (onSelect) { onSelect(c); onClose(); } }}
              >
                <div className="w-9 h-9 rounded-lg bg-neutral-100 flex items-center justify-center shrink-0">
                  <CreditCard className="w-5 h-5 text-neutral-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-700 truncate">{c.name}</p>
                  {c.brand && <p className="text-xs text-neutral-400">{c.brand}</p>}
                </div>
                {editingCard?.id === c.id && <Check className="w-4 h-4 text-primary-600 shrink-0" />}
              </div>
            ))}
            <div className="pt-2 border-t border-neutral-100 mt-2">
              <p className="text-xs text-neutral-500 mb-2 px-3">Ou cadastre um novo cartão:</p>
            </div>
          </div>
        )}

        {error && <div className="mb-4 p-3 rounded-xl bg-danger-50 border border-danger-200 text-danger-700 text-sm">{error}</div>}
        {successMsg && <div className="mb-4 p-3 rounded-xl bg-success-50 border border-success-200 text-success-700 text-sm">{successMsg}</div>}

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
              <label className="label">Dia de fechamento (1-31)</label>
              <input
                type="number"
                min={1}
                max={31}
                className="input"
                placeholder="Ex: 1"
                value={closingDayInput}
                onChange={(e) => setClosingDayInput(e.target.value.replace(/[^0-9]/g, ''))}
                required
              />
            </div>
            <div>
              <label className="label">Dia de vencimento (1-31)</label>
              <input
                type="number"
                min={1}
                max={31}
                className="input"
                placeholder="Ex: 10"
                value={dueDayInput}
                onChange={(e) => setDueDayInput(e.target.value.replace(/[^0-9]/g, ''))}
                required
              />
            </div>
          </div>
          <button type="submit" disabled={saving} className="btn-primary w-full">
            {saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Criar cartão'}
          </button>
        </form>
      </div>

      <BrandManageModal
        open={showBrandModal}
        onClose={() => setShowBrandModal(false)}
        spaceId={spaceId}
        selectedBrand={brand}
        onSelect={(b) => setBrand(b)}
      />
    </div>
  );
}
