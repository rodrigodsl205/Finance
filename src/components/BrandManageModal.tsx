import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Edit3, X, Check, CreditCard } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

interface Props {
  open: boolean;
  onClose: () => void;
  spaceId: string | null;
  selectedBrand?: string;
  onSelect?: (brand: string) => void;
}

const DEFAULT_BRANDS = ['Visa', 'Mastercard', 'Elo', 'American Express', 'Hipercard'];

export default function BrandManageModal({ open, onClose, spaceId, selectedBrand, onSelect }: Props) {
  const [customBrands, setCustomBrands] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingBrand, setEditingBrand] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectMode = !!onSelect;

  const fetchBrands = useCallback(async () => {
    if (!spaceId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('cards')
      .select('brand')
      .eq('space_id', spaceId)
      .not('brand', 'is', null);
    if (!error && data) {
      const brands = new Set<string>();
      for (const row of data as { brand: string | null }[]) {
        if (row.brand && !DEFAULT_BRANDS.includes(row.brand)) {
          brands.add(row.brand);
        }
      }
      setCustomBrands(Array.from(brands).sort());
    }
    if (error) logger.error('Erro ao carregar bandeiras', error.message);
    setLoading(false);
  }, [spaceId]);

  useEffect(() => {
    if (open) fetchBrands();
  }, [open, fetchBrands]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);

    if (editingBrand) {
      // Update all cards with this brand
      const { error } = await supabase
        .from('cards')
        .update({ brand: name.trim() })
        .eq('brand', editingBrand);
      if (error) { logger.error('Erro ao atualizar bandeira', error.message); setError(error.message); }
    }

    if (!error) {
      setShowForm(false);
      setEditingBrand(null);
      setName('');
      fetchBrands();
      if (onSelect) {
        onSelect(name.trim());
        onClose();
      }
    }
    setSaving(false);
  }

  async function handleDelete(brand: string) {
    if (!confirm(`Remover a bandeira "${brand}"? Os cartões associados ficarão sem bandeira.`)) return;
    const { error } = await supabase
      .from('cards')
      .update({ brand: null })
      .eq('brand', brand);
    if (error) { setError(error.message); return; }
    fetchBrands();
  }

  function handleSelect(brand: string) {
    if (onSelect) {
      onSelect(brand);
      onClose();
    }
  }

  if (!open) return null;

  const allBrands = [...DEFAULT_BRANDS, ...customBrands];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/30 animate-fade-in" onClick={onClose}>
      <div className="card p-6 w-full max-w-lg animate-scale-in max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4 sticky top-0 bg-white pb-2 z-10">
          <h2 className="text-lg font-semibold text-neutral-900">
            {selectMode ? 'Selecionar bandeira' : 'Gerenciar bandeiras'}
          </h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 transition-colors"><X className="w-5 h-5" /></button>
        </div>

        {error && <div className="mb-4 p-3 rounded-xl bg-danger-50 border border-danger-200 text-danger-700 text-sm">{error}</div>}

        {loading ? (
          <div className="py-8 text-center text-neutral-400">Carregando...</div>
        ) : showForm ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Nome da bandeira</label>
              <input className="input" placeholder="Ex: Visa Nano" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="btn-primary flex-1">
                {saving ? 'Salvando...' : editingBrand ? 'Salvar' : 'Criar'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setEditingBrand(null); setName(''); }} className="btn-ghost">
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-neutral-700 mb-2">Bandeiras padrão</h3>
              <div className="space-y-1">
                {DEFAULT_BRANDS.map(brand => (
                  <div
                    key={brand}
                    className={`flex items-center justify-between py-2 px-3 rounded-xl group transition-colors ${
                      selectMode ? 'hover:bg-primary-50 cursor-pointer' : 'hover:bg-neutral-50'
                    } ${selectedBrand === brand ? 'bg-primary-50 ring-1 ring-primary-200' : ''}`}
                    onClick={() => selectMode && handleSelect(brand)}
                  >
                    <div className="flex items-center gap-2 flex-1">
                      {selectMode && selectedBrand === brand && <Check className="w-4 h-4 text-primary-600 shrink-0" />}
                      <CreditCard className="w-4 h-4 text-neutral-500 shrink-0" />
                      <span className="text-sm text-neutral-700">{brand}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {customBrands.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-neutral-700 mb-2">Bandeiras personalizadas</h3>
                <div className="space-y-1">
                  {customBrands.map(brand => (
                    <div
                      key={brand}
                      className={`flex items-center justify-between py-2 px-3 rounded-xl group transition-colors ${
                        selectMode ? 'hover:bg-primary-50 cursor-pointer' : 'hover:bg-neutral-50'
                      } ${selectedBrand === brand ? 'bg-primary-50 ring-1 ring-primary-200' : ''}`}
                      onClick={() => selectMode && handleSelect(brand)}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        {selectMode && selectedBrand === brand && <Check className="w-4 h-4 text-primary-600 shrink-0" />}
                        <CreditCard className="w-4 h-4 text-neutral-500 shrink-0" />
                        <span className="text-sm text-neutral-700">{brand}</span>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => { e.stopPropagation(); setEditingBrand(brand); setName(brand); setShowForm(true); }} className="p-1 rounded text-neutral-400 hover:text-primary-600">
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(brand); }} className="p-1 rounded text-neutral-400 hover:text-danger-600">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button onClick={() => { setEditingBrand(null); setName(''); setShowForm(true); }} className="btn-secondary w-full text-sm">
              <Plus className="w-4 h-4" /> Nova bandeira
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
