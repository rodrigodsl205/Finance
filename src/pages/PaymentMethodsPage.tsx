import { useState } from 'react';
import { Plus, Wallet, Trash2, Edit3, X, Star, CreditCard, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { usePaymentMethods } from '@/hooks/useFinance';
import { useSpaces } from '@/hooks/useSpaces';
import { supabase } from '@/lib/supabase';
import type { PaymentMethod, PaymentMethodKind } from '@/types';

export default function PaymentMethodsPage() {
  const { paymentMethods, loading, refresh } = usePaymentMethods();
  const { activeSpaceId } = useSpaces();

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<PaymentMethod | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<PaymentMethodKind>('expense');
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !activeSpaceId) return;
    setSaving(true);
    setError(null);

    if (isDefault) {
      await supabase.from('payment_methods')
        .update({ is_default: false })
        .eq('space_id', activeSpaceId)
        .eq('kind', kind);
    }

    if (editing) {
      const { error } = await supabase
        .from('payment_methods')
        .update({ name: name.trim(), kind, is_default: isDefault })
        .eq('id', editing.id);
      if (error) setError(error.message);
    } else {
      const { error } = await supabase
        .from('payment_methods')
        .insert({ space_id: activeSpaceId, name: name.trim(), kind, is_default: isDefault });
      if (error) setError(error.message);
    }

    if (!error) {
      setShowModal(false);
      setEditing(null);
      setName(''); setIsDefault(false);
      refresh();
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir esta forma de pagamento?')) return;
    await supabase.from('payment_methods').delete().eq('id', id);
    refresh();
  }

  function openEdit(pm: PaymentMethod) {
    setEditing(pm);
    setName(pm.name);
    setKind(pm.kind);
    setIsDefault(pm.is_default);
    setShowModal(true);
  }

  function openNew(k: PaymentMethodKind) {
    setEditing(null);
    setName(''); setIsDefault(false);
    setKind(k);
    setShowModal(true);
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="animate-pulse text-neutral-400">Carregando...</div></div>;
  }

  const expenseMethods = paymentMethods.filter(pm => pm.kind === 'expense');
  const incomeMethods = paymentMethods.filter(pm => pm.kind === 'income');

  function renderList(list: PaymentMethod[], label: string, icon: React.ReactNode, newKind: PaymentMethodKind) {
    return (
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
            {icon} {label}
          </h2>
          <button onClick={() => openNew(newKind)} className="text-primary-600 hover:text-primary-800 text-sm font-medium">
            + Adicionar
          </button>
        </div>
        <div className="space-y-1">
          {list.map(pm => (
            <div key={pm.id} className="flex items-center justify-between py-3 px-4 rounded-xl hover:bg-neutral-50 group transition-colors">
              <div className="flex items-center gap-3">
                {pm.name.startsWith('Cartão ') ? (
                  <CreditCard className="w-4 h-4 text-neutral-500" />
                ) : (
                  <Wallet className="w-4 h-4 text-neutral-500" />
                )}
                {pm.is_default && <Star className="w-4 h-4 text-accent-500 fill-accent-500" />}
                <span className="text-sm font-medium text-neutral-700">{pm.name}</span>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => openEdit(pm)} className="p-1 rounded text-neutral-400 hover:text-primary-600">
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleDelete(pm.id)} className="p-1 rounded text-neutral-400 hover:text-danger-600">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
          {list.length === 0 && <p className="text-xs text-neutral-400 px-3 py-2">Nenhuma forma de {label.toLowerCase()}.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">Formas de pagamento</h1>
      </div>

      {paymentMethods.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-neutral-100 flex items-center justify-center mx-auto mb-4">
            <Wallet className="w-8 h-8 text-neutral-400" />
          </div>
          <h3 className="text-lg font-semibold text-neutral-900 mb-1">Nenhuma forma de pagamento</h3>
          <p className="text-sm text-neutral-500 max-w-md mx-auto mb-4">
            Crie formas de pagamento como PIX, Cartão, Dinheiro, etc. para usar nos lançamentos.
          </p>
          <div className="flex gap-2 justify-center">
            <button onClick={() => openNew('expense')} className="btn-primary"><Plus className="w-4 h-4" /> Nova forma de despesa</button>
            <button onClick={() => openNew('income')} className="btn-secondary"><Plus className="w-4 h-4" /> Nova forma de receita</button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {renderList(expenseMethods, 'Despesas', <ArrowDownCircle className="w-5 h-5 text-danger-500" />, 'expense')}
          {renderList(incomeMethods, 'Receitas', <ArrowUpCircle className="w-5 h-5 text-success-500" />, 'income')}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 animate-fade-in" onClick={() => setShowModal(false)}>
          <div className="card p-6 w-full max-w-md animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-neutral-900">{editing ? 'Editar forma' : 'Nova forma de pagamento'}</h2>
              <button onClick={() => setShowModal(false)} className="text-neutral-400 hover:text-neutral-600 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            {error && <div className="mb-4 p-3 rounded-xl bg-danger-50 border border-danger-200 text-danger-700 text-sm">{error}</div>}
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
              <button type="submit" disabled={saving} className="btn-primary w-full">
                {saving ? 'Salvando...' : editing ? 'Salvar' : 'Criar'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
