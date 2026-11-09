import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ArrowLeftRight,
  CreditCard,
  FileText,
  Users,
  Settings,
  LogOut,
  Wallet,
  Tags,
  Target,
  PiggyBank,
  Receipt,
  BarChart3,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useSpaces } from '@/hooks/useSpaces';

const navItems = [
  { to: '/app', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/app/lancamentos', icon: ArrowLeftRight, label: 'Lançamentos' },
  { to: '/app/contas', icon: Wallet, label: 'Contas' },
  { to: '/app/cartoes', icon: CreditCard, label: 'Cartões' },
  { to: '/app/faturas', icon: FileText, label: 'Faturas' },
  { to: '/app/acertos', icon: Users, label: 'Acertos' },
  { to: '/app/categorias', icon: Tags, label: 'Categorias' },
  { to: '/app/formas-pagamento', icon: Receipt, label: 'Formas de pagamento' },
  { to: '/app/orcamentos', icon: PiggyBank, label: 'Orçamentos' },
  { to: '/app/metas', icon: Target, label: 'Metas' },
  { to: '/app/relatorios', icon: BarChart3, label: 'Relatórios' },
  { to: '/app/configuracoes', icon: Settings, label: 'Configurações' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth();
  const { spaces, activeSpace, activeSpaceId, changeActiveSpace } = useSpaces();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-neutral-100">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col bg-white border-r border-neutral-200 z-30">
        <div className="flex items-center gap-3 px-6 h-16 border-b border-neutral-200">
          <div className="w-9 h-9 rounded-xl bg-primary-700 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-white" strokeWidth={2} />
          </div>
          <span className="text-lg font-bold text-neutral-900">DualCash</span>
        </div>

        {/* Space selector */}
        <div className="px-4 py-3 border-b border-neutral-200">
          <label className="text-xs text-neutral-500 font-medium mb-1.5 block">Espaço ativo</label>
          <select
            className="input py-2 text-sm"
            value={activeSpaceId ?? ''}
            onChange={(e) => changeActiveSpace(e.target.value)}
          >
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} {s.kind === 'shared' ? '(Compartilhado)' : ''}
              </option>
            ))}
          </select>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                }`
              }
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-neutral-200 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-semibold text-sm">
              {profile?.display_name?.charAt(0).toUpperCase() ?? '?'}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-neutral-900 truncate">{profile?.display_name ?? 'Usuário'}</p>
            </div>
          </div>
          <button onClick={handleSignOut} className="btn-ghost w-full text-danger-600 hover:bg-danger-50">
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="lg:hidden sticky top-0 z-30 bg-white border-b border-neutral-200 px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary-700 flex items-center justify-center">
            <Wallet className="w-4 h-4 text-white" strokeWidth={2} />
          </div>
          <span className="font-bold text-neutral-900">DualCash</span>
        </div>
        <select
          className="text-sm rounded-lg border border-neutral-300 px-2 py-1.5 bg-white max-w-[160px]"
          value={activeSpaceId ?? ''}
          onChange={(e) => changeActiveSpace(e.target.value)}
        >
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </header>

      {/* Main content */}
      <main className="lg:ml-64 pb-20 lg:pb-0 min-h-screen">
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">{children}</div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-neutral-200 z-30 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around px-2 py-1">
          {navItems.slice(0, 5).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-2 py-2 rounded-lg text-[10px] font-medium transition-colors ${
                  isActive ? 'text-primary-700' : 'text-neutral-400'
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
