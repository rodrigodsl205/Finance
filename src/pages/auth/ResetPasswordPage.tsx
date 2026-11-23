import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Wallet, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    // Supabase may deliver the token as a URL hash, query param (PKCE), or
    // already-consumed session, so the only reliable check is the session itself.
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const hashError = hashParams.get('error_description') ?? params.get('error_description');
    if (hashError) {
      setLinkError(hashError);
      setCheckingSession(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(Boolean(session));
      setCheckingSession(false);
    });
  }, [params]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres');
      return;
    }
    setSubmitting(true);
    setError(null);

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
      setTimeout(async () => {
        await supabase.auth.signOut();
        navigate('/login');
      }, 2000);
    }
    setSubmitting(false);
  }

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 py-12 bg-neutral-100">
      <div className="mx-auto w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary-700 flex items-center justify-center shadow-soft">
            <Wallet className="w-7 h-7 text-white" strokeWidth={2} />
          </div>
          <h1 className="text-2xl font-bold text-neutral-900">Redefinir senha</h1>
        </div>

        <div className="card p-6 animate-fade-in">
          {success ? (
            <div className="text-center py-4">
              <p className="text-sm text-neutral-600">
                Senha atualizada com sucesso! Redirecionando para o login...
              </p>
            </div>
          ) : checkingSession ? (
            <div className="text-center py-4">
              <p className="text-sm text-neutral-400 animate-pulse">Verificando link...</p>
            </div>
          ) : !hasSession ? (
            <div className="text-center py-4">
              <p className="text-sm text-neutral-600 mb-4">
                {linkError
                  ? `Não foi possível validar o link: ${linkError}`
                  : 'Este link expirou ou é inválido. Solicite uma nova recuperação de senha.'}
              </p>
              <button className="btn-secondary w-full" onClick={() => navigate('/recuperar-senha')}>
                Solicitar recuperação
              </button>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 p-3 rounded-xl bg-danger-50 border border-danger-200 text-danger-700 text-sm">
                  {error}
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label">Nova senha</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="input pr-11"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={submitting} className="btn-primary w-full">
                  {submitting ? 'Atualizando...' : 'Atualizar senha'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
