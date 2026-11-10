import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Edit3, X, ArrowDownCircle, ArrowUpCircle, Check, ChevronRight, ChevronDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type { Category, CategoryKind } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  spaceId: string | null;
  onSaved: () => void;
  filterKind?: CategoryKind;
  selectedId?: string;
  onSelect?: (category: Category) => void;
}

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

function categoryPath(cats: Category[], id: string): string {
  const cat = cats.find(c => c.id === id);
  if (!cat) return '';
  if (cat.parent_id) {
    const parentPath = categoryPath(cats, cat.parent_id);
    return parentPath ? `${parentPath} > ${cat.name}` : cat.name;
  }
  return cat.name;
}

export default function CategoryManageModal({ open, onClose, spaceId, onSaved, filterKind, selectedId, onSelect }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [parentId, setParentId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const selectMode = !!onSelect;

  const fetchCategories = useCallback(async () => {
    if (!spaceId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('space_id', spaceId)
      .order('name');
    if (!error && data) setCategories(data as Category[]);
    if (error) logger.error('Erro ao carregar categorias', error.message);
    setLoading(false);
  }, [spaceId]);

  useEffect(() => {
    if (open) fetchCategories();
  }, [open, fetchCategories]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !spaceId) return;
    setSaving(true);
    setError(null);

    if (editing) {
      const { error } = await supabase.from('categories').update({ name: name.trim() }).eq('id', editing.id);
      if (error) { logger.error('Erro ao atualizar categoria', error.message); setError(error.message); }
    } else {
      const { error } = await supabase.from('categories').insert({ space_id: spaceId, name: name.trim(), kind, parent_id: parentId });
      if (error) { logger.error('Erro ao criar categoria', error.message); setError(error.message); }
    }

    if (!error) {
      setShowForm(false);
      setEditing(null);
      setName('');
      setParentId(null);
      fetchCategories();
      onSaved();
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir esta categoria? Subcategorias também serão removidas.')) return;
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) { setError(error.message); return; }
    fetchCategories();
    onSaved();
  }

  function openEdit(cat: Category) {
    setEditing(cat);
    setName(cat.name);
    setKind(cat.kind);
    setParentId(cat.parent_id);
    setShowForm(true);
  }

  function openNew(k: CategoryKind, parent: Category | null = null) {
    setEditing(null);
    setName('');
    setKind(k);
    setParentId(parent?.id ?? null);
    setShowForm(true);
  }

  function handleSelect(cat: Category) {
    if (onSelect) {
      onSelect(cat);
      onClose();
    }
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!open) return null;

  const tree = buildTree(categories);
  const expenseRoots = tree.filter(c => c.kind === 'expense');
  const incomeRoots = tree.filter(c => c.kind === 'income');
  const showExpense = !filterKind || filterKind === 'expense';
  const showIncome = !filterKind || filterKind === 'income';

  function renderNode(node: CategoryNode, level: number): React.ReactNode {
    const hasChildren = node.children.length > 0;
    const isExpanded = expanded.has(node.id);
    const indent = level * 16;

    return (
      <div key={node.id}>
        <div
          className={`flex items-center justify-between py-2 px-3 rounded-xl group transition-colors ${
            selectMode ? 'hover:bg-primary-50 cursor-pointer' : 'hover:bg-neutral-50'
          } ${selectedId === node.id ? 'bg-primary-50 ring-1 ring-primary-200' : ''}`}
          style={{ paddingLeft: `${12 + indent}px` }}
          onClick={() => selectMode && handleSelect(node)}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {selectMode && selectedId === node.id && <Check className="w-4 h-4 text-primary-600 shrink-0" />}
            {hasChildren ? (
              <button
                onClick={(e) => { e.stopPropagation(); toggleExpand(node.id); }}
                className="p-0.5 rounded text-neutral-400 hover:text-neutral-700 shrink-0"
              >
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            ) : (
              <span className="w-[18px] shrink-0" />
            )}
            <span className="text-sm text-neutral-700 truncate">{node.name}</span>
          </div>
          {!selectMode && (
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {level < 2 && (
                <button onClick={(e) => { e.stopPropagation(); openNew(node.kind, node); }} className="p-1 rounded text-neutral-400 hover:text-primary-600" title="Adicionar subcategoria">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
              <button onClick={(e) => { e.stopPropagation(); openEdit(node); }} className="p-1 rounded text-neutral-400 hover:text-primary-600">
                <Edit3 className="w-3.5 h-3.5" />
              </button>
              <button onClick={(e) => { e.stopPropagation(); handleDelete(node.id); }} className="p-1 rounded text-neutral-400 hover:text-danger-600">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
        {hasChildren && isExpanded && node.children.map(child => renderNode(child, level + 1))}
      </div>
    );
  }

  function renderCatList(roots: CategoryNode[], label: string, icon: React.ReactNode, newKind: CategoryKind) {
    if (roots.length === 0 && !selectMode) return null;
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
        <div className="space-y-0.5">
          {roots.map(cat => renderNode(cat, 0))}
          {roots.length === 0 && <p className="text-xs text-neutral-400 px-3 py-2">Nenhuma categoria de {label.toLowerCase()}.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/30 animate-fade-in" onClick={onClose}>
      <div className="card p-6 w-full max-w-lg animate-scale-in max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4 sticky top-0 bg-white pb-2 z-10">
          <h2 className="text-lg font-semibold text-neutral-900">
            {selectMode ? 'Selecionar categoria' : 'Gerenciar categorias'}
          </h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 transition-colors"><X className="w-5 h-5" /></button>
        </div>

        {error && <div className="mb-4 p-3 rounded-xl bg-danger-50 border border-danger-200 text-danger-700 text-sm">{error}</div>}

        {loading ? (
          <div className="py-8 text-center text-neutral-400">Carregando...</div>
        ) : showForm ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            {parentId && (
              <div>
                <label className="label">Categoria pai</label>
                <div className="input bg-neutral-50 text-neutral-500">
                  {categoryPath(categories, parentId)}
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
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="btn-primary flex-1">
                {saving ? 'Salvando...' : editing ? 'Salvar' : 'Criar'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setEditing(null); setName(''); setParentId(null); }} className="btn-ghost">
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            {categories.length === 0 && (
              <p className="text-sm text-neutral-500 text-center py-4">
                Nenhuma categoria cadastrada. Crie uma para usar nos lançamentos.
              </p>
            )}
            {showExpense && renderCatList(
              expenseRoots, 'Despesas',
              <ArrowDownCircle className="w-4 h-4 text-danger-500" />,
              'expense'
            )}
            {showIncome && renderCatList(
              incomeRoots, 'Receitas',
              <ArrowUpCircle className="w-4 h-4 text-success-500" />,
              'income'
            )}
            {selectMode && (
              <div className="space-y-3">
                <div>
                  <label className="label">Criar subcategoria sob (opcional)</label>
                  <select className="input py-2 text-sm" value={parentId ?? ''} onChange={(e) => setParentId(e.target.value || null)}>
                    <option value="">Categoria raiz</option>
                    {categories
                      .filter(c => !filterKind || c.kind === filterKind)
                      .filter(c => {
                        if (!parentId) return true;
                        return c.id !== parentId;
                      })
                      .map(c => (
                        <option key={c.id} value={c.id}>{categoryPath(categories, c.id)}</option>
                      ))
                    }
                  </select>
                </div>
                <button onClick={() => openNew(filterKind ?? 'expense', parentId ? categories.find(c => c.id === parentId) ?? null : null)} className="btn-secondary w-full text-sm">
                  <Plus className="w-4 h-4" /> {parentId ? 'Nova subcategoria' : 'Nova categoria'}
                </button>
              </div>
            )}
            {!selectMode && (
              <button onClick={() => openNew('expense')} className="btn-secondary w-full text-sm">
                <Plus className="w-4 h-4" /> Nova categoria
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
