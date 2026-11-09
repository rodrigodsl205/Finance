import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Edit3, X, ArrowDownCircle, ArrowUpCircle, Check, Wallet, CreditCard, Star } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type { PaymentMethod, PaymentMethodKind } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  spaceId: string | null;
  onSaved: () => void;
  filterKind?: PaymentMethodKind;
  selectedId?: string;
  onSelect?: (method: PaymentMethod) => void;
}

export default function PaymentMethodManageModal({ open, onClose, spaceId, onSaved, filterKind, selectedId, onSelect }: Props) {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PaymentMethod | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<PaymentMethodKind>('expense');
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectMode = !!onSelect;

  const fetchMethods = useCallback(async () => {
    if (!spaceId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('payment_methods')
      .select('*')
      .eq('space_id', spaceId)
      .order('is_default', { ascending: false })
      .order('name', { ascending: true });
    if (!error && data) setMethods(data as PaymentMethod[]);
    if (error) logger.error('Erro ao carregar formas de pagamento', error.message);
    setLoading(false);
  }, [spaceId]);

  useEffect(() => {
    if (open) fetchMethods();
  }, [open, fetchMethods]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !spaceId) return;
    setSaving(true);
    setError(null);

    if (isDefault) {
      await supabase.from('payment_methods')
        .update({ is_default: false })
        .eq('space_id', spaceId)
        .eq('kind', kind);
    }

    if (editing) {
      const { error } = await supabase
        .from('payment_methods')
        .update({ name: name.trim(), kind, is_default: isDefault })
        .eq('id', editing.id);
      if (error) { logger.error('Erro ao atualizar forma de pagamento', error.message); setError(error.message); }
    } else {
      const { error } = await supabase
        .from('payment_methods')
        .insert({ space_id: spaceId, name: name.trim(), kind, is_default: isDefault });
      if (error) { logger.error('Erro ao criar forma de pagamento', error.message); setError(error.message); }
    }

    if (!error) {
      setShowForm(false);
      setEditing(null);
      setName('');
      setIsDefault(false);
      fetchMethods();
      onSaved();
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir esta forma de pagamento?')) return;
    const { error } = await supabase.from('payment_methods').delete().eq('id', id);
    if (error) { setError(error.message); return; }
    fetchMethods();
    onSaved();
  }

  function openEdit(pm: PaymentMethod) {
    setEditing(pm);
    setName(pm.name);
    setKind(pm.kind);
    setIsDefault(pm.is_default);
    setShowForm(true);
  }

  function openNew(k: PaymentMethodKind) {
    setEditing(null);
    setName('');
    setKind(k);
    setIsDefault(false);
    setShowForm(true);
  }

  function handleSelect(pm: PaymentMethod) {
    if (onSelect) {
      onSelect(pm);
      onClose();
    }
  }

  if (!open) return null;

  const expenseMethods = methods.filter(m => m.kind === 'expense');
  const incomeMethods = methods.filter(m => m.kind === 'income');
  const showExpense = !filterKind || filterKind === 'expense';
  const showIncome = !filterKind || filterKind === 'income';

  function renderMethodList(list: PaymentMethod[], label: string, icon: React.ReactNode, newKind: PaymentMethodKind) {
    if (list.length === 0 && !selectMode) return null;
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-neutral-700 flex items-center gap-2">
            {icon} {label}
          </h3>
          {!selectMode && (
            <button onClick={() => openNew(newKind)} className="text-primary-600 hover:text-primary-800 text-xs font-medium flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Adicionar
            </button>
          )}
        </div>
        <div className="space-y-1">
          {list.map(pm => (
            <div
              key={pm.id}
              className={`flex items-center justify-between py-2 px-3 rounded-xl group transition-colors ${
                selectMode ? 'hover:bg-primary-50 cursor-pointer' : 'hover:bg-neutral-50'
              } ${selectedId === pm.id ? 'bg-primary-50 ring-1 ring-primary-200' : ''}`}
              onClick={() => selectMode && handleSelect(pm)}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {selectMode && selectedId === pm.id && <Check className="w-4 h-4 text-primary-600 shrink-0" />}
                {pm.name.startsWith('Cartão ') ? (
                  <CreditCard className="w-4 h-4 text-neutral-500 shrink-0" />
                ) : (
                  <Wallet className="w-4 h-4 text-neutral-500 shrink-0" />
                )}
                {pm.is_default && <Star className="w-3.5 h-3.5 text-accent-500 fill-accent-500 shrink-0" />}
                <span className="text-sm font-medium text-neutral-700 truncate">{pm.name}</span>
              </div>
              {!selectMode && (
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={(e) => { e.stopPropagation(); openEdit(pm); }} className="p-1 rounded text-neutral-400 hover:text-primary-600">
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(pm.id); }} className="p-1 rounded text-neutral-400 hover:text-danger-600">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
          {list.length === 0 && <p className="text-xs text-neutral-400 px-3 py-2">Nenhuma forma de {label.toLowerCase()}.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/30 animate-fade-in" onClick={onClose}>
      <div className="card p-6 w-full max-w-lg animate-scale-in max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4 sticky top-0 bg-white pb-2 z-10">
          <h2 className="text-lg font-semibold text-neutral-900">
            {selectMode ? 'Selecionar forma de pagamento' : 'Gerenciar formas de pagamento'}
          </h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 transition-colors"><X className="w-5 h-5" /></button>
        </div>

        {error && <div className="mb-4 p-3 rounded-xl bg-danger-50 border border-danger-200 text-danger-700 text-sm">{error}</div>}

        {loading ? (
          <div className="py-8 text-center text-neutral-400">Carregando...</div>
        ) : showForm ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Nome</label>
              <input className="input" placeholder="Ex: PIX" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
            </div>
            {!editing && (
              <div>
                <label className="label">Tipo</label>
                <select className="input" value={kind} onChange={(e) => setKind(e.target.value as PaymentMethodKind)}>
                  <option value="expense">Despesa</option>
                  <option value="income">Receita</option>
                </select>
              </div>
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 rounded border-neutral-300 text-primary-600" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
              <span className="text-sm text-neutral-700">Definir como padrão</span>
            </label>
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="btn-primary flex-1">
                {saving ? 'Salvando...' : editing ? 'Salvar' : 'Criar'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setEditing(null); setName(''); setIsDefault(false); }} className="btn-ghost">
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            {methods.length === 0 && (
              <p className="text-sm text-neutral-500 text-center py-4">
                Nenhuma forma de pagamento cadastrada. Crie uma para usar nos lançamentos.
              </p>
            )}
            {showExpense && renderMethodList(
              expenseMethods, 'Despesas',
              <ArrowDownCircle className="w-4 h-4 text-danger-500" />,
              'expense'
            )}
            {showIncome && renderMethodList(
              incomeMethods, 'Receitas',
              <ArrowUpCircle className="w-4 h-4 text-success-500" />,
              'income'
            )}
            {selectMode && methods.length > 0 && (
              <button onClick={() => openNew(filterKind ?? 'expense')} className="btn-secondary w-full text-sm">
                <Plus className="w-4 h-4" /> Nova forma de pagamento
              </button>
            )}
            {!selectMode && (
              <button onClick={() => openNew('expense')} className="btn-secondary w-full text-sm">
                <Plus className="w-4 h-4" /> Nova forma de pagamento
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
