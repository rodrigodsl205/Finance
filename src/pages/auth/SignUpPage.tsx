import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Wallet } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const schema = z
  .object({
    displayName: z.string().min(2, 'Informe seu nome'),
    email: z.string().email('E-mail inválido'),
    password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas não coincidem',
    path: ['confirmPassword'],
  });

type FormData = z.infer<typeof schema>;

export default function SignUpPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverSuccess, setServerSuccess] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    setSubmitting(true);
    setServerError(null);
    setServerSuccess(null);
    const { error } = await signUp(data.email, data.password, data.displayName);
    if (error) {
      setServerError(error);
      setSubmitting(false);
    } else {
      setServerSuccess('Conta criada! Redirecionando...');
      setTimeout(() => navigate('/app'), 1500);
    }
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
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">Criar conta</h2>

          {serverError && (
            <div className="mb-4 p-3 rounded-xl bg-danger-50 border border-danger-200 text-danger-700 text-sm">
              {serverError}
            </div>
          )}
          {serverSuccess && (
            <div className="mb-4 p-3 rounded-xl bg-success-50 border border-success-200 text-success-700 text-sm">
              {serverSuccess}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label">Nome</label>
              <input className="input" placeholder="Seu nome" {...register('displayName')} />
              {errors.displayName && <p className="text-danger-600 text-xs mt-1">{errors.displayName.message}</p>}
            </div>

            <div>
              <label className="label">E-mail</label>
              <input type="email" className="input" placeholder="seu@email.com" {...register('email')} />
              {errors.email && <p className="text-danger-600 text-xs mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className="label">Senha</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input pr-11"
                  placeholder="••••••••"
                  {...register('password')}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {errors.password && <p className="text-danger-600 text-xs mt-1">{errors.password.message}</p>}
            </div>

            <div>
              <label className="label">Confirmar senha</label>
              <input
                type={showPassword ? 'text' : 'password'}
                className="input"
                placeholder="••••••••"
                {...register('confirmPassword')}
              />
              {errors.confirmPassword && <p className="text-danger-600 text-xs mt-1">{errors.confirmPassword.message}</p>}
            </div>

            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? 'Criando...' : 'Criar conta'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-neutral-200 text-center">
            <p className="text-sm text-neutral-500">
              Já tem conta?{' '}
              <Link to="/login" className="text-primary-700 hover:text-primary-800 font-medium transition-colors">
                Entrar
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
