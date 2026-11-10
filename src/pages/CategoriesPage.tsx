import { useState } from 'react';
import { Plus, Tags, Trash2, Edit3, X, ArrowDownCircle, ArrowUpCircle, ChevronRight, ChevronDown } from 'lucide-react';
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

interface CategoryNode extends Category {
  children: CategoryNode[];
}

function buildTree(cats: Category[]): CategoryNode[] {
  const byId = new Map<string, CategoryNode>();
  for (const c of cats) {
    byId.set(c.id, { ...c, children: [] });
  }
  const roots: CategoryNode[] = [];
  for (const node of byId.values()) {
    if (node.parent_id && byId.has(node.parent_id)) {
      byId.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export default function CategoriesPage() {
  const { categories, loading, refresh } = useCategories();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [parentId, setParentId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { activeSpaceId } = useSpaces();

  async function handleSeedDefaults() {
    if (!activeSpaceId) return;
    const inserts = [
      ...DEFAULT_EXPENSE_CATEGORIES.map(n => ({ space_id: activeSpaceId, name: n, kind: 'expense' as const, parent_id: null })),
      ...DEFAULT_INCOME_CATEGORIES.map(n => ({ space_id: activeSpaceId, name: n, kind: 'income' as const, parent_id: null })),
    ];
    await supabase.from('categories').insert(inserts);
    refresh();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !activeSpaceId) return;

    // Prevent more than 3 levels deep
    if (parentId) {
      const depth = getCategoryDepth(categories, parentId);
      if (depth >= 2) {
        setError('Não é possível criar mais de 3 níveis de subcategoria.');
        return;
      }
    }

    setSaving(true);
    setError(null);

    if (editing) {
      const { error } = await supabase.from('categories').update({ name: name.trim() }).eq('id', editing.id);
      if (error) { logger.error('Erro ao atualizar categoria', error.message); setError(error.message); }
    } else {
      const { error } = await supabase.from('categories').insert({ space_id: activeSpaceId, name: name.trim(), kind, parent_id: parentId });
      if (error) { logger.error('Erro ao criar categoria', error.message); setError(error.message); }
    }

    if (!error) {
      setShowModal(false);
      setEditing(null);
      setName('');
      setParentId(null);
      refresh();
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir esta categoria? Subcategorias também serão removidas. Transações existentes manterão o registro.')) return;
    await supabase.from('categories').delete().eq('id', id);
    refresh();
  }

  function getCategoryDepth(cats: Category[], id: string, depth = 0): number {
    const cat = cats.find(c => c.id === id);
    if (!cat || !cat.parent_id) return depth;
    return getCategoryDepth(cats, cat.parent_id, depth + 1);
  }

  function openEdit(cat: Category) {
    setEditing(cat);
    setName(cat.name);
    setKind(cat.kind);
    setParentId(cat.parent_id);
    setShowModal(true);
  }

  function openNew(k: CategoryKind, parent: Category | null = null) {
    setEditing(null);
    setName('');
    setKind(k);
    setParentId(parent?.id ?? null);
    setShowModal(true);
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="animate-pulse text-neutral-400">Carregando...</div></div>;
  }

  const tree = buildTree(categories);
  const expenseRoots = tree.filter(c => c.kind === 'expense');
  const incomeRoots = tree.filter(c => c.kind === 'income');

  function renderNode(node: CategoryNode, level: number): React.ReactNode {
    const hasChildren = node.children.length > 0;
    const isExpanded = expanded.has(node.id);
    const indent = level * 20;

    return (
      <div key={node.id}>
        <div
          className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-neutral-50 group transition-colors"
          style={{ paddingLeft: `${12 + indent}px` }}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {hasChildren ? (
              <button onClick={() => toggleExpand(node.id)} className="p-0.5 rounded text-neutral-400 hover:text-neutral-700 shrink-0">
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            ) : (
              <span className="w-5 shrink-0" />
            )}
            <span className="text-sm text-neutral-700 truncate">{node.name}</span>
            {level > 0 && (
              <span className="text-[10px] text-neutral-400 shrink-0">
                {level === 1 ? 'Sub' : 'Sub-sub'}
              </span>
            )}
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            {level < 2 && (
              <button
                onClick={() => openNew(node.kind, node)}
                className="p-1 rounded text-neutral-400 hover:text-primary-600"
                title="Adicionar subcategoria"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
            <button onClick={() => openEdit(node)} className="p-1 rounded text-neutral-400 hover:text-primary-600">
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => handleDelete(node.id)} className="p-1 rounded text-neutral-400 hover:text-danger-600">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        {hasChildren && isExpanded && node.children.map(child => renderNode(child, level + 1))}
      </div>
    );
  }

  function renderCategoryColumn(rootCats: CategoryNode[], label: string, icon: React.ReactNode, catKind: CategoryKind) {
    return (
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
            {icon}
            {label}
          </h2>
          <button onClick={() => openNew(catKind)} className="text-primary-600 hover:text-primary-800 text-sm font-medium">
            + Adicionar
          </button>
        </div>
        <div className="space-y-0.5">
          {rootCats.map(cat => renderNode(cat, 0))}
          {rootCats.length === 0 && <p className="text-xs text-neutral-400 px-3 py-2">Nenhuma categoria de {label.toLowerCase()}.</p>}
        </div>
      </div>
    );
  }

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
            Crie categorias manualmente ou carregue as categorias padrão para começar rapidamente. Você pode criar até 3 níveis de subcategorias.
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
          {renderCategoryColumn(
            expenseRoots, 'Despesas',
            <ArrowDownCircle className="w-5 h-5 text-danger-500" />,
            'expense'
          )}
          {renderCategoryColumn(
            incomeRoots, 'Receitas',
            <ArrowUpCircle className="w-5 h-5 text-success-500" />,
            'income'
          )}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 animate-fade-in" onClick={() => setShowModal(false)}>
          <div className="card p-6 w-full max-w-md animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-neutral-900">
                {editing ? 'Editar categoria' : parentId ? 'Nova subcategoria' : 'Nova categoria'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-neutral-400 hover:text-neutral-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            {error && <div className="mb-4 p-3 rounded-xl bg-danger-50 border border-danger-200 text-danger-700 text-sm">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              {parentId && (
                <div>
                  <label className="label">Categoria pai</label>
                  <div className="input bg-neutral-50 text-neutral-500">
                    {categories.find(c => c.id === parentId)?.name ?? '—'}
                  </div>
                </div>
              )}
              <div>
                <label className="label">Nome</label>
                <input className="input" placeholder="Ex: Moradia" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
              </div>
              {!editing && !parentId && (
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
