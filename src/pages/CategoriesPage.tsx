import { useState } from 'react';
import { Plus, Tags, Trash2, Edit3, X, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { useCategories } from '@/hooks/useFinance';
import { useSpaces } from '@/hooks/useSpaces';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type { Category, CategoryKind } from '@/types';

const DEFAULT_EXPENSE_CATEGORIES = [
  'Moradia', 'Supermercado', 'Alimentação fora de casa', 'Transporte', 'Combustível',
  'Saúde', 'Academia', 'Lazer', 'Assinaturas', 'Educação', 'Compras pessoais',
  'Viagens', 'Pets', 'Presentes', 'Contas de consumo', 'Impostos e taxas',
  'Investimentos e poupança', 'Outros',
];

const DEFAULT_INCOME_CATEGORIES = [
  'Salário', 'Renda extra', 'Freelance', 'Reembolsos recebidos', 'Rendimentos', 'Outras receitas',
];

export default function CategoriesPage() {
  const { categories, loading, refresh } = useCategories();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { activeSpaceId } = useSpaces();

  async function handleSeedDefaults() {
    if (!activeSpaceId) return;
    const inserts = [
      ...DEFAULT_EXPENSE_CATEGORIES.map(n => ({ space_id: activeSpaceId, name: n, kind: 'expense' as const })),
      ...DEFAULT_INCOME_CATEGORIES.map(n => ({ space_id: activeSpaceId, name: n, kind: 'income' as const })),
    ];
    await supabase.from('categories').insert(inserts);
    refresh();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !activeSpaceId) return;
    setSaving(true);
    setError(null);

    if (editing) {
      const { error } = await supabase.from('categories').update({ name: name.trim() }).eq('id', editing.id);
      if (error) { logger.error('Erro ao atualizar categoria', error.message); setError(error.message); }
    } else {
      const { error } = await supabase.from('categories').insert({ space_id: activeSpaceId, name: name.trim(), kind });
      if (error) { logger.error('Erro ao criar categoria', error.message); setError(error.message); }
    }

    if (!error) {
      setShowModal(false);
      setEditing(null);
      setName('');
      refresh();
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir esta categoria? Transações existentes manterão o registro.')) return;
    await supabase.from('categories').delete().eq('id', id);
    refresh();
  }

  function openEdit(cat: Category) {
    setEditing(cat);
    setName(cat.name);
    setKind(cat.kind);
    setShowModal(true);
  }

  function openNew(k: CategoryKind) {
    setEditing(null);
    setName('');
    setKind(k);
    setShowModal(true);
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="animate-pulse text-neutral-400">Carregando...</div></div>;
  }

  const expenseCats = categories.filter(c => c.kind === 'expense');
  const incomeCats = categories.filter(c => c.kind === 'income');

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">Categorias</h1>
        {categories.length === 0 && (
          <button onClick={handleSeedDefaults} className="btn-secondary text-sm">
            <Plus className="w-4 h-4" /> Categorias padrão
          </button>
        )}
      </div>

      {categories.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-neutral-100 flex items-center justify-center mx-auto mb-4">
            <Tags className="w-8 h-8 text-neutral-400" />
          </div>
          <h3 className="text-lg font-semibold text-neutral-900 mb-1">Nenhuma categoria</h3>
          <p className="text-sm text-neutral-500 max-w-md mx-auto mb-4">
            Crie categorias manualmente ou carregue as categorias padrão para começar rapidamente.
          </p>
          <div className="flex gap-2 justify-center">
            <button onClick={handleSeedDefaults} className="btn-primary">
              <Plus className="w-4 h-4" /> Carregar padrão
            </button>
            <button onClick={() => openNew('expense')} className="btn-secondary">
              Criar manualmente
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Expense categories */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
                <ArrowDownCircle className="w-5 h-5 text-danger-500" />
                Despesas
              </h2>
              <button onClick={() => openNew('expense')} className="text-primary-600 hover:text-primary-800 text-sm font-medium">
                + Adicionar
              </button>
            </div>
            <div className="space-y-1">
              {expenseCats.map(cat => (
                <div key={cat.id} className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-neutral-50 group transition-colors">
                  <span className="text-sm text-neutral-700">{cat.name}</span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(cat)} className="p-1 rounded text-neutral-400 hover:text-primary-600">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(cat.id)} className="p-1 rounded text-neutral-400 hover:text-danger-600">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {expenseCats.length === 0 && <p className="text-xs text-neutral-400 px-3 py-2">Nenhuma categoria de despesa.</p>}
            </div>
          </div>

          {/* Income categories */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
                <ArrowUpCircle className="w-5 h-5 text-success-500" />
                Receitas
              </h2>
              <button onClick={() => openNew('income')} className="text-primary-600 hover:text-primary-800 text-sm font-medium">
                + Adicionar
              </button>
            </div>
            <div className="space-y-1">
              {incomeCats.map(cat => (
                <div key={cat.id} className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-neutral-50 group transition-colors">
                  <span className="text-sm text-neutral-700">{cat.name}</span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(cat)} className="p-1 rounded text-neutral-400 hover:text-primary-600">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(cat.id)} className="p-1 rounded text-neutral-400 hover:text-danger-600">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {incomeCats.length === 0 && <p className="text-xs text-neutral-400 px-3 py-2">Nenhuma categoria de receita.</p>}
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 animate-fade-in" onClick={() => setShowModal(false)}>
          <div className="card p-6 w-full max-w-md animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-neutral-900">{editing ? 'Editar categoria' : 'Nova categoria'}</h2>
              <button onClick={() => setShowModal(false)} className="text-neutral-400 hover:text-neutral-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            {error && <div className="mb-4 p-3 rounded-xl bg-danger-50 border border-danger-200 text-danger-700 text-sm">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Nome</label>
                <input className="input" placeholder="Ex: Moradia" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
              </div>
              {!editing && (
                <div>
                  <label className="label">Tipo</label>
                  <select className="input" value={kind} onChange={(e) => setKind(e.target.value as CategoryKind)}>
                    <option value="expense">Despesa</option>
                    <option value="income">Receita</option>
                  </select>
                </div>
              )}
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
