import { useState, useEffect, useCallback, useRef } from 'react';
import { UserPlus, Mail, X, Check, Clock, Trash2, Users, Bug, Copy, Trash, Download, Upload, FileSpreadsheet, LogOut, Crown, Eraser } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useSpaces } from '@/hooks/useSpaces';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { formatDateBR } from '@/lib/dates';
import { exportToExcel, importFromExcel, downloadTemplate, fetchAllData, type ImportSummary } from '@/lib/excel';
import type { Invitation } from '@/types';

export default function SettingsPage() {
  const { profile, refreshProfile } = useAuth();
  const { spaces, activeSpace, activeMembers, startupSpaceId, setStartupSpace, refresh } = useSpaces();

  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  const [inviteEmail, setInviteEmail] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [creatingSpace, setCreatingSpace] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState('');

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSharedSpace = activeSpace?.kind === 'shared';
  const isSpaceOwner = activeSpace?.owner_id === profile?.id;

  const fetchInvitations = useCallback(async () => {
    if (!activeSpace) return;
    const { data } = await supabase
      .from('invitations')
      .select(`
        *,
        financial_spaces!invitations_space_id_fkey(name, kind),
        inviter:profiles!invitations_invited_by_fkey(display_name)
      `)
      .eq('space_id', activeSpace.id)
      .order('created_at', { ascending: false });
    setInvitations((data as unknown as Invitation[]) ?? []);
  }, [activeSpace]);

  useEffect(() => {
    fetchInvitations();
  }, [fetchInvitations]);

  // Realtime for invitations
  useEffect(() => {
    if (!activeSpace) return;
    const channel = supabase
      .channel(`invitations-${activeSpace.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'invitations', filter: `space_id=eq.${activeSpace.id}` },
        () => fetchInvitations()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeSpace, fetchInvitations]);

  async function handleSaveProfile() {
    setSavingProfile(true);
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: displayName })
      .eq('id', profile?.id);
    if (!error) {
      await refreshProfile();
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    }
    setSavingProfile(false);
  }

  async function handleCreateSharedSpace() {
    if (!newSpaceName.trim() || !profile) return;
    setCreatingSpace(true);

    const { data: space, error: spaceError } = await supabase
      .from('financial_spaces')
      .insert({ name: newSpaceName.trim(), kind: 'shared', owner_id: profile.id })
      .select()
      .single();

    if (spaceError) {
      setCreatingSpace(false);
      return;
    }

    const { error: memberError } = await supabase
      .from('space_members')
      .insert({ space_id: (space as { id: string }).id, user_id: profile.id, role: 'owner' });

    if (!memberError) {
      setNewSpaceName('');
      await refresh();
    }
    setCreatingSpace(false);
  }

  async function handleSendInvite() {
    if (!inviteEmail.trim() || !activeSpace || !profile) return;
    setSendingInvite(true);
    setInviteError(null);
    setInviteSuccess(null);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { error } = await supabase.from('invitations').insert({
      space_id: activeSpace.id,
      invited_by: profile.id,
      invitee_email: inviteEmail.trim(),
      expires_at: expiresAt.toISOString(),
    });

    if (error) {
      setInviteError(error.message);
    } else {
      setInviteSuccess(`Convite enviado para ${inviteEmail.trim()}! A pessoa precisará se cadastrar e usar o link enviado.`)
      setInviteEmail('');
      fetchInvitations();
    }
    setSendingInvite(false);
  }

  async function handleRevokeInvite(invitationId: string) {
    await supabase
      .from('invitations')
      .update({ status: 'revoked' })
      .eq('id', invitationId);
    fetchInvitations();
  }

  async function handleRemoveMember(memberId: string, userId: string) {
    if (userId === profile?.id) return; // can't remove self here
    if (!confirm('Remover este membro do espaço?')) return;
    await supabase.from('space_members').delete().eq('id', memberId);
    refresh();
  }

  async function handleLeaveSpace() {
    if (!activeSpace || !profile) return;
    if (!confirm(`Sair do espaço "${activeSpace.name}"? Você perderá o acesso aos dados dele.`)) return;
    const { error } = await supabase
      .from('space_members')
      .delete()
      .eq('space_id', activeSpace.id)
      .eq('user_id', profile.id);
    if (error) {
      alert('Não foi possível sair do espaço. Tente novamente.');
      return;
    }
    await refresh();
  }

  async function handleDeleteSpace() {
    if (!activeSpace) return;
    if (!confirm(`Excluir o espaço "${activeSpace.name}"? TODOS os dados dele (lançamentos, cartões, contas, metas e convites) serão apagados permanentemente.`)) return;
    const { error } = await supabase.rpc('delete_shared_space', { p_space_id: activeSpace.id });
    if (error) {
      alert('Não foi possível excluir o espaço. Tente novamente.');
      return;
    }
    await refresh();
  }

  async function handleClearSpaceData() {
    if (!activeSpace) return;
    const spaceName = activeSpace.name;
    if (!confirm(`Apagar TODOS os dados do espaço "${spaceName}"? Lançamentos, cartões, contas, faturas, metas, orçamentos, categorias, formas de pagamento e acertos serão removidos permanentemente. O espaço e os membros são mantidos.`)) return;
    if (!confirm('Esta ação não pode ser desfeita. Confirmar exclusão total dos dados?')) return;
    const { error } = await supabase.rpc('clear_space_data', { p_space_id: activeSpace.id });
    if (error) {
      alert('Não foi possível limpar os dados do espaço. Tente novamente.');
      return;
    }
    await refresh();
  }

  function getInviteLink(token: string): string {
    return `${window.location.origin}/convite?token=${token}`;
  }

  async function handleExport() {
    if (!activeSpace) return;
    setExporting(true);
    try {
      const data = await fetchAllData(activeSpace.id);
      exportToExcel(data);
    } catch (err) {
      alert('Erro ao exportar: ' + (err instanceof Error ? err.message : 'desconhecido'));
    }
    setExporting(false);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.xlsx')) {
      alert('Selecione um arquivo .xlsx válido');
      return;
    }
    setPendingFile(file);
    setImportSummary(null);
  }

  async function handleImportConfirm() {
    if (!pendingFile || !activeSpace || !profile) return;
    setImporting(true);
    try {
      const existingData = await fetchAllData(activeSpace.id);
      const result = await importFromExcel(pendingFile, activeSpace.id, profile.id, existingData);
      setImportSummary(result);
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      alert('Erro ao importar: ' + (err instanceof Error ? err.message : 'desconhecido'));
    }
    setImporting(false);
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <h1 className="text-2xl font-bold text-neutral-900">Configurações</h1>

      {/* Profile section */}
      <section className="card p-6">
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Meu perfil</h2>
        <div className="flex items-center gap-2">
          <input
            className="input max-w-xs"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Seu nome"
          />
          <button onClick={handleSaveProfile} disabled={savingProfile} className="btn-primary">
            {savingProfile ? 'Salvando...' : profileSaved ? 'Salvo!' : 'Salvar'}
          </button>
        </div>
      </section>

      {/* Shared space management */}
      <section className="card p-6">
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Espaço compartilhado</h2>

        {spaces.filter((s) => s.kind === 'shared').length === 0 ? (
          <div>
            <p className="text-sm text-neutral-500 mb-4">
              Você ainda não tem um espaço compartilhado. Crie um para convidar sua parceira(o) e
              dividir despesas, cartões e acertos.
            </p>
            <div className="flex gap-2">
              <input
                className="input max-w-xs"
                placeholder="Nome do espaço (ex: Nós)"
                value={newSpaceName}
                onChange={(e) => setNewSpaceName(e.target.value)}
              />
              <button onClick={handleCreateSharedSpace} disabled={creatingSpace || !newSpaceName.trim()} className="btn-primary">
                {creatingSpace ? 'Criando...' : 'Criar espaço'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Startup space selector */}
            <div>
              <h3 className="text-sm font-medium text-neutral-700 mb-2 flex items-center gap-2">
                <Check className="w-4 h-4" />
                Espaço ao iniciar o app
              </h3>
              <select
                className="input max-w-xs"
                value={startupSpaceId ?? ''}
                onChange={(e) => setStartupSpace(e.target.value || null)}
              >
                <option value="">Padrão (primeiro espaço)</option>
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.kind === 'shared' ? ' (compartilhado)' : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-neutral-400 mt-1">
                O app abrirá sempre neste espaço. Deixe em "Padrão" para abrir no primeiro da lista.
              </p>
            </div>

            {/* Members list */}
            <div>
              <h3 className="text-sm font-medium text-neutral-700 mb-2 flex items-center gap-2">
                <Users className="w-4 h-4" />
                Membros do espaço ativo
              </h3>
              <div className="space-y-2">
                {activeMembers.map((m) => (
                  <div key={m.id} className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 border border-neutral-200">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 text-sm font-semibold">
                        {(m.profiles?.display_name ?? '?').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-neutral-900 flex items-center gap-1">
                          {m.profiles?.display_name ?? 'Usuário'}
                          {m.user_id === profile?.id && <span className="text-xs text-neutral-400 font-normal">(você)</span>}
                        </p>
                        <p className="text-xs text-neutral-400 flex items-center gap-1">
                          {m.role === 'owner' ? <><Crown className="w-3 h-3" /> Proprietário</> : 'Membro'}
                        </p>
                      </div>
                    </div>
                    {isSpaceOwner && m.user_id !== profile?.id && (
                      <button
                        onClick={() => handleRemoveMember(m.id, m.user_id)}
                        className="text-neutral-400 hover:text-danger-600 transition-colors"
                        title="Remover membro"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Invite form */}
            {isSharedSpace && isSpaceOwner && (
              <div>
                <h3 className="text-sm font-medium text-neutral-700 mb-2 flex items-center gap-2">
                  <UserPlus className="w-4 h-4" />
                  Convidar pessoa
                </h3>
                {inviteError && (
                  <div className="mb-2 p-2.5 rounded-xl bg-danger-50 border border-danger-200 text-danger-700 text-sm">
                    {inviteError}
                  </div>
                )}
                {inviteSuccess && (
                  <div className="mb-2 p-2.5 rounded-xl bg-success-50 border border-success-200 text-success-700 text-sm">
                    {inviteSuccess}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="email"
                    className="input max-w-xs"
                    placeholder="email@exemplo.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                  <button onClick={handleSendInvite} disabled={sendingInvite || !inviteEmail.trim()} className="btn-primary">
                    {sendingInvite ? 'Enviando...' : 'Enviar convite'}
                  </button>
                </div>
                <p className="text-xs text-neutral-400 mt-2">
                  O convite expira em 7 dias. A pessoa precisa se cadastrar com o e-mail informado.
                </p>
              </div>
            )}

            {/* Pending invitations */}
            {invitations.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-neutral-700 mb-2">Convites enviados</h3>
                <div className="space-y-2">
                  {invitations.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 border border-neutral-200">
                      <div className="flex items-center gap-3 min-w-0">
                        {inv.status === 'pending' && <Clock className="w-4 h-4 text-accent-500 shrink-0" />}
                        {inv.status === 'accepted' && <Check className="w-4 h-4 text-success-500 shrink-0" />}
                        {inv.status === 'revoked' && <X className="w-4 h-4 text-neutral-400 shrink-0" />}
                        {inv.status === 'expired' && <X className="w-4 h-4 text-danger-400 shrink-0" />}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-neutral-900 truncate">{inv.invitee_email}</p>
                          <p className="text-xs text-neutral-400">
                            {inv.status === 'pending' && `Expira em ${formatDateBR(inv.expires_at.split('T')[0])}`}
                            {inv.status === 'accepted' && `Aceito em ${formatDateBR(inv.accepted_at?.split('T')[0] ?? '')}`}
                            {inv.status === 'revoked' && 'Revogado'}
                            {inv.status === 'expired' && 'Expirado'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {inv.status === 'pending' && (
                          <>
                            <button
                              className="text-xs text-primary-600 hover:text-primary-800 font-medium"
                              onClick={() => navigator.clipboard?.writeText(getInviteLink(inv.token))}
                            >
                              Copiar link
                            </button>
                            <button
                              onClick={() => handleRevokeInvite(inv.id)}
                              className="text-neutral-400 hover:text-danger-600 transition-colors"
                              title="Revogar convite"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Space actions */}
            {activeSpace && (
              <div className="border-t border-neutral-100 pt-4 flex flex-wrap gap-2">
                <button
                  onClick={handleClearSpaceData}
                  className="btn-ghost text-sm text-danger-600 flex items-center gap-1.5"
                  title="Apaga todos os dados do espaço, mantendo o espaço e os membros"
                >
                  <Eraser className="w-4 h-4" /> Limpar dados deste espaço
                </button>
                {isSharedSpace && !isSpaceOwner && (
                  <button onClick={handleLeaveSpace} className="btn-ghost text-sm text-danger-600 flex items-center gap-1.5">
                    <LogOut className="w-4 h-4" /> Sair deste espaço
                  </button>
                )}
                {isSharedSpace && isSpaceOwner && (
                  <button onClick={handleDeleteSpace} className="btn-ghost text-sm text-danger-600 flex items-center gap-1.5">
                    <Trash2 className="w-4 h-4" /> Excluir este espaço
                  </button>
                )}
              </div>
            )}

            {!isSharedSpace && (
              <p className="text-sm text-neutral-500">
                O espaço ativo é pessoal. Selecione um espaço compartilhado na barra superior para convidar pessoas.
              </p>
            )}
          </div>
        )}
      </section>

      {/* Data import/export section */}
      <section className="card p-6">
        <h2 className="text-lg font-semibold text-neutral-900 mb-4 flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5" /> Importar e exportar dados
        </h2>
        <p className="text-sm text-neutral-500 mb-4">
          Exporte todos os dados do seu espaço para uma planilha Excel (.xlsx), edite externamente e importe novamente. O layout de importação é idêntico ao de exportação.
        </p>
        <div className="flex flex-wrap gap-2 mb-4">
          <button onClick={handleExport} disabled={exporting} className="btn-primary text-sm">
            <Download className="w-4 h-4" /> {exporting ? 'Exportando...' : 'Exportar dados'}
          </button>
          <button onClick={downloadTemplate} className="btn-secondary text-sm">
            <FileSpreadsheet className="w-4 h-4" /> Baixar modelo
          </button>
        </div>

        <div className="border-t border-neutral-100 pt-4">
          <h3 className="text-sm font-medium text-neutral-700 mb-2 flex items-center gap-2">
            <Upload className="w-4 h-4" /> Importar planilha
          </h3>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            onChange={handleFileSelect}
            className="hidden"
          />
          <div className="flex flex-wrap gap-2">
            <button onClick={() => fileInputRef.current?.click()} disabled={importing} className="btn-secondary text-sm">
              {pendingFile ? pendingFile.name : 'Selecionar arquivo .xlsx'}
            </button>
            {pendingFile && !importing && (
              <button onClick={handleImportConfirm} className="btn-primary text-sm">
                <Check className="w-4 h-4" /> Confirmar importação
              </button>
            )}
            {importing && <span className="text-sm text-neutral-500 self-center">Processando...</span>}
          </div>

          {importSummary && (
            <div className={`mt-4 p-4 rounded-xl ${importSummary.errors.length > 0 ? 'bg-warning-50 border border-warning-200' : 'bg-success-50 border border-success-200'}`}>
              <p className="text-sm font-medium text-neutral-900 mb-2">Resumo da importação:</p>
              <ul className="text-sm text-neutral-700 space-y-0.5">
                <li>Contas: {importSummary.accounts} nova(s)</li>
                <li>Categorias: {importSummary.categories} nova(s)</li>
                <li>Formas de pagamento: {importSummary.paymentMethods} nova(s)</li>
                <li>Cartões: {importSummary.cards} novo(s)</li>
                <li>Lançamentos: {importSummary.transactions} novo(s)</li>
              </ul>
              {importSummary.errors.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-medium text-warning-700 mb-1">Avisos e erros:</p>
                  <ul className="text-xs text-warning-700 space-y-0.5 max-h-32 overflow-y-auto">
                    {importSummary.errors.map((err, i) => <li key={i}>• {err}</li>)}
                  </ul>
                </div>
              )}
              <button onClick={() => setImportSummary(null)} className="mt-3 text-xs text-neutral-500 hover:text-neutral-700">
                Fechar resumo
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Debug log section */}
      <section className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-neutral-900 flex items-center gap-2">
            <Bug className="w-5 h-5" /> Log de eventos
          </h2>
          <div className="flex gap-2">
            <button onClick={() => {
              const text = logger.exportText();
              navigator.clipboard?.writeText(text);
              alert('Log copiado para a área de transferência!');
            }} className="btn-secondary text-sm">
              <Copy className="w-4 h-4" /> Copiar
            </button>
            <button onClick={() => logger.clear()} className="btn-ghost text-sm text-danger-500">
              <Trash className="w-4 h-4" /> Limpar
            </button>
          </div>
        </div>
        <div className="bg-neutral-900 rounded-xl p-4 max-h-64 overflow-y-auto font-mono text-xs text-neutral-300 space-y-1">
          {logger.getEntries().length === 0 ? (
            <p className="text-neutral-500">Nenhum evento registrado ainda.</p>
          ) : (
            logger.getEntries().slice(-50).reverse().map((entry, i) => (
              <div key={i} className={entry.level === 'error' ? 'text-danger-400' : entry.level === 'warn' ? 'text-warning-400' : 'text-neutral-300'}>
                <span className="text-neutral-500">[{new Date(entry.timestamp).toLocaleTimeString('pt-BR')}]</span>{' '}
                <span className="font-medium">{entry.level.toUpperCase()}</span>{' '}
                {entry.message}
                {entry.data ? <span className="text-neutral-500"> {typeof entry.data === 'object' ? JSON.stringify(entry.data) : String(entry.data)}</span> : ''}
              </div>
            ))
          )}
        </div>
        <p className="text-xs text-neutral-400 mt-2">
          O log registra ações do app (criar, editar, excluir) e erros do banco de dados. Copie e envie para ajudar no desenvolvimento.
        </p>
      </section>
    </div>
  );
}
