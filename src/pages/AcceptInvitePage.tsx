import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Wallet, Mail, Check, X, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { formatDateBR } from '@/lib/dates';
import type { Invitation } from '@/types';

export default function AcceptInvitePage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const { user } = useAuth();
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Token de convite ausente.');
      setLoading(false);
      return;
    }

    (async () => {
      // Look up the invitation by token
      const { data, error } = await supabase
        .from('invitations')
        .select(`
          *,
          financial_spaces!invitations_space_id_fkey(name, kind),
          inviter:profiles!invitations_invited_by_fkey(display_name)
        `)
        .eq('token', token)
        .maybeSingle();

      if (error || !data) {
        setError('Convite não encontrado ou inválido.');
        setLoading(false);
        return;
      }

      const inv = data as unknown as Invitation;
      setInvitation(inv);

      if (inv.status === 'accepted') {
        setError('Este convite já foi aceito.');
      } else if (inv.status === 'revoked') {
        setError('Este convite foi revogado.');
      } else if (inv.status === 'expired' || new Date(inv.expires_at) < new Date()) {
        setError('Este convite expirou.');
      }

      setLoading(false);
    })();
  }, [token]);

  async function handleAccept() {
    if (!invitation || !user) return;
    setAccepting(true);
    setError(null);

    // Check that the user's email matches the invitee_email
    if (user.email !== invitation.invitee_email) {
      setError(
        `Este convite foi enviado para ${invitation.invitee_email}, mas você está logado como ${user.email}. ` +
        'Use a conta correta ou cadastre-se com o e-mail convidado.'
      );
      setAccepting(false);
      return;
    }

    // Insert membership
    const { error: memberError } = await supabase
      .from('space_members')
      .insert({ space_id: invitation.space_id, user_id: user.id, role: 'member' });

    if (memberError) {
      if (memberError.code === '23505') {
        setError('Você já é membro deste espaço.');
      } else {
        setError(memberError.message);
      }
      setAccepting(false);
      return;
    }

    // Mark invitation as accepted
    await supabase
      .from('invitations')
      .update({ status: 'accepted', accepted_at: new Date().toISOString(), accepted_by: user.id })
      .eq('id', invitation.id);

    setSuccess(true);
    setTimeout(() => navigate('/app'), 2000);
    setAccepting(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-100 px-6">
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin mb-4" />
        <p className="text-sm text-neutral-500">Verificando convite...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 py-12 bg-neutral-100">
      <div className="mx-auto w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary-700 flex items-center justify-center shadow-soft">
            <Wallet className="w-7 h-7 text-white" strokeWidth={2} />
          </div>
          <h1 className="text-2xl font-bold text-neutral-900">Convite DualCash</h1>
        </div>

        <div className="card p-6 animate-fade-in">
          {error ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-danger-50 flex items-center justify-center mx-auto mb-4">
                <X className="w-6 h-6 text-danger-500" />
              </div>
              <p className="text-sm text-neutral-600 mb-4">{error}</p>
              <button className="btn-secondary w-full" onClick={() => navigate('/login')}>
                Ir para o login
              </button>
            </div>
          ) : success ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-success-50 flex items-center justify-center mx-auto mb-4">
                <Check className="w-6 h-6 text-success-600" />
              </div>
              <p className="text-sm text-neutral-600 mb-2">
                Você entrou no espaço <strong>{invitation?.financial_spaces?.name ?? 'compartilhado'}</strong>!
              </p>
              <p className="text-xs text-neutral-400">Redirecionando...</p>
            </div>
          ) : !user ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-primary-50 flex items-center justify-center mx-auto mb-4">
                <Mail className="w-6 h-6 text-primary-600" />
              </div>
              <p className="text-sm text-neutral-600 mb-1">
                Você foi convidado para <strong>{invitation?.financial_spaces?.name ?? 'um espaço'}</strong>
              </p>
              <p className="text-xs text-neutral-400 mb-4">
                Convidado por {invitation?.inviter?.display_name ?? 'alguém'} · Expira em {formatDateBR(invitation?.expires_at.split('T')[0] ?? '')}
              </p>
              <p className="text-sm text-neutral-600 mb-4">
                Para aceitar, faça login ou cadastre-se com o e-mail <strong>{invitation?.invitee_email}</strong>.
              </p>
              <div className="flex flex-col gap-2">
                <button className="btn-primary w-full" onClick={() => navigate(`/login?redirect=/convite?token=${token}`)}>
                  Entrar
                </button>
                <button className="btn-secondary w-full" onClick={() => navigate(`/cadastro?redirect=/convite?token=${token}`)}>
                  Criar conta
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-primary-50 flex items-center justify-center mx-auto mb-4">
                <Mail className="w-6 h-6 text-primary-600" />
              </div>
              <p className="text-sm text-neutral-600 mb-1">
                Você foi convidado para <strong>{invitation?.financial_spaces?.name ?? 'um espaço'}</strong>
              </p>
              <p className="text-xs text-neutral-400 mb-4">
                Convidado por {invitation?.inviter?.display_name ?? 'alguém'}
              </p>
              {error && <p className="text-sm text-danger-600 mb-4">{error}</p>}
              <button
                onClick={handleAccept}
                disabled={accepting}
                className="btn-primary w-full"
              >
                {accepting ? 'Aceitando...' : 'Aceitar convite'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
