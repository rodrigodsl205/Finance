import { useState } from 'react';
import { Plus, Wallet, Landmark, Smartphone, PiggyBank, Banknote, Building2, Trash2, Edit3, X } from 'lucide-react';
import { useAccounts } from '@/hooks/useFinance';
import { useAuth } from '@/hooks/useAuth';
import { useSpaces } from '@/hooks/useSpaces';
import { supabase } from '@/lib/supabase';
import { centsToBRL, inputToCents } from '@/lib/money';
import { ACCOUNT_TYPE_LABELS, accountDisplayLabel } from '@/types';
import type { Account, AccountType } from '@/types';

const TYPE_ICONS: Record<AccountType, typeof Wallet> = {
  checking: Landmark,
  digital: Smartphone,
  savings: PiggyBank,
  cash: Banknote,
  other: Building2,
};

export default function AccountsPage() {
  const { accounts, loading, refresh } = useAccounts();
  const { user } = useAuth();
  const { activeSpaceId } = useSpaces();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [name, setName] = useState('');
  const [holderName, setHolderName] = useState('');
  const [institution, setInstitution] = useState('');
  const [agency, setAgency] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [type, setType] = useState<AccountType>('checking');
  const [balance, setBalance] = useState('');
  const [referenceDate, setReferenceDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!institution.trim() || !holderName.trim() || !activeSpaceId || !user) return;
    setSaving(true);
    setError(null);
    const balanceCents = inputToCents(balance || '0');
    const displayLabel = `${institution.trim()} - ${holderName.trim()}`;

    if (editing) {
      const { error } = await supabase
        .from('accounts')
        .update({
          name: displayLabel,
          holder_name: holderName.trim(),
          institution: institution.trim(),
          agency: agency.trim() || null,
          account_number: accountNumber.trim() || null,
          type,
          initial_balance_cents: balanceCents,
          reference_date: referenceDate,
        })
        .eq('id', editing.id);
      if (error) setError(error.message);
    } else {
      const { error } = await supabase
        .from('accounts')
        .insert({
          space_id: activeSpaceId,
          name: displayLabel,
          holder_name: holderName.trim(),
          institution: institution.trim(),
          agency: agency.trim() || null,
          account_number: accountNumber.trim() || null,
          type,
          initial_balance_cents: balanceCents,
          reference_date: referenceDate,
          owner_id: user.id,
        });
      if (error) setError(error.message);
    }

    if (!error) {
      setShowModal(false);
      setEditing(null);
      setName(''); setHolderName(''); setInstitution(''); setAgency(''); setAccountNumber('');
      setType('checking'); setBalance(''); setReferenceDate(new Date().toISOString().split('T')[0]);
      refresh();
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir esta conta? As transações associadas serão mantidas.')) return;
    await supabase.from('accounts').delete().eq('id', id);
    refresh();
  }

  function openEdit(account: Account) {
    setEditing(account);
    setName(account.name);
    setHolderName(account.holder_name ?? '');
    setInstitution(account.institution ?? account.name);
    setAgency(account.agency ?? '');
    setAccountNumber(account.account_number ?? '');
    setType(account.type);
    setBalance((account.initial_balance_cents / 100).toFixed(2).replace('.', ','));
    setReferenceDate(account.reference_date);
    setShowModal(true);
  }

  function openNew() {
    setEditing(null);
    setName(''); setHolderName(''); setInstitution(''); setAgency(''); setAccountNumber('');
    setType('checking'); setBalance(''); setReferenceDate(new Date().toISOString().split('T')[0]);
    setShowModal(true);
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="animate-pulse text-neutral-400">Carregando...</div></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Contas</h1>
        <button onClick={openNew} className="btn-primary">
          <Plus className="w-4 h-4" /> Nova conta
        </button>
      </div>

      {accounts.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <Wallet className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-1">Nenhuma conta cadastrada</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mb-4">
            Cadastre suas contas para acompanhar saldos e vincular lançamentos.
          </p>
          <button onClick={openNew} className="btn-primary mx-auto">
            <Plus className="w-4 h-4" /> Cadastrar conta
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((account) => {
            const Icon = TYPE_ICONS[account.type];
            return (
              <div key={account.id} className="card p-5 group">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{accountDisplayLabel(account)}</p>
                      <p className="text-xs text-slate-400">{ACCOUNT_TYPE_LABELS[account.type]}</p>
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(account)} className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(account.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="pt-3 border-t border-slate-100 space-y-1.5">
                  <div>
                    <p className="text-xs text-slate-400 mb-0.5">Saldo inicial</p>
                    <p className="text-xl font-bold tracking-tight text-slate-900">{centsToBRL(account.initial_balance_cents)}</p>
                  </div>
                  {account.agency && (
                    <p className="text-xs text-slate-400">Agência: {account.agency}</p>
                  )}
                  {account.account_number && (
                    <p className="text-xs text-slate-400">Conta: {account.account_number}</p>
                  )}
                  {account.status === 'archived' && (
                    <span className="badge bg-slate-100 text-slate-500 mt-2">Arquivada</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-panel max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">{editing ? 'Editar conta' : 'Nova conta'}</h2>
                <p className="modal-subtitle">Cadastre os dados da conta bancária</p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            {error && <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">{error}</div>}
            <form id="account-form" onSubmit={handleSubmit} className="modal-body">
              <div>
                <label className="label">Instituição</label>
                <input className="input" placeholder="Ex: Banco do Brasil" value={institution} onChange={(e) => setInstitution(e.target.value)} required autoFocus />
              </div>
              <div>
                <label className="label">Titular</label>
                <input className="input" placeholder="Ex: Rodrigo" value={holderName} onChange={(e) => setHolderName(e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Agência</label>
                  <input className="input" placeholder="Ex: 1234" value={agency} onChange={(e) => setAgency(e.target.value)} />
                </div>
                <div>
                  <label className="label">Número da conta</label>
                  <input className="input" placeholder="Ex: 56789-0" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="label">Tipo</label>
                <select className="input" value={type} onChange={(e) => setType(e.target.value as AccountType)}>
                  {Object.entries(ACCOUNT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Saldo inicial (R$)</label>
                <input className="input" placeholder="0,00" value={balance} onChange={(e) => setBalance(e.target.value)} />
              </div>
              <div>
                <label className="label">Data de referência</label>
                <input type="date" className="input" value={referenceDate} onChange={(e) => setReferenceDate(e.target.value)} />
              </div>
            </form>
            <div className="modal-footer">
              <button type="button" onClick={() => setShowModal(false)} className="btn-ghost">Cancelar</button>
              <button type="submit" form="account-form" disabled={saving} className="btn-primary">
                {saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Criar conta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
