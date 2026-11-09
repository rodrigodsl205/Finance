import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Wallet } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function RecoverPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });

    if (error) {
      setError(error.message);
    } else {
      setSent(true);
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
          <div className="text-center">
            <h1 className="text-2xl font-bold text-neutral-900">DualCash</h1>
            <p className="text-sm text-neutral-500 mt-1">Finanças do casal</p>
          </div>
        </div>

        <div className="card p-6 animate-fade-in">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">Recuperar senha</h2>

          {sent ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-success-100 flex items-center justify-center mx-auto mb-4">
                <Mail className="w-6 h-6 text-success-600" />
              </div>
              <p className="text-sm text-neutral-600">
                Se a conta existir, enviamos um link de recuperação para <strong>{email}</strong>.
                Verifique sua caixa de entrada e o spam.
              </p>
              <Link to="/login" className="btn-secondary mt-6 w-full">
                Voltar ao login
              </Link>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 p-3 rounded-xl bg-danger-50 border border-danger-200 text-danger-700 text-sm">
                  {error}
                </div>
              )}
              <p className="text-sm text-neutral-500 mb-4">
                Informe seu e-mail e enviaremos um link para redefinir sua senha.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label">E-mail</label>
                  <input
                    type="email"
                    className="input"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" disabled={submitting} className="btn-primary w-full">
                  {submitting ? 'Enviando...' : 'Enviar link'}
                </button>
              </form>
              <div className="mt-6 pt-6 border-t border-neutral-200 text-center">
                <Link to="/login" className="text-sm text-primary-700 hover:text-primary-800 transition-colors">
                  Voltar ao login
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
