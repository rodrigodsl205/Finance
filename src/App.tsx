import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { SpacesProvider } from '@/hooks/useSpaces';
import AppLayout from '@/components/AppLayout';
import LoginPage from '@/pages/auth/LoginPage';
import SignUpPage from '@/pages/auth/SignUpPage';
import RecoverPasswordPage from '@/pages/auth/RecoverPasswordPage';
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage';
import AcceptInvitePage from '@/pages/AcceptInvitePage';
import DashboardPage from '@/pages/DashboardPage';
import SettingsPage from '@/pages/SettingsPage';

import AccountsPage from '@/pages/AccountsPage';
import CategoriesPage from '@/pages/CategoriesPage';
import TransactionsPage from '@/pages/TransactionsPage';
import SettlementsPage from '@/pages/SettlementsPage';
import CardsPage from '@/pages/CardsPage';
import InvoicesPage from '@/pages/InvoicesPage';
import PaymentMethodsPage from '@/pages/PaymentMethodsPage';
import BudgetsPage from '@/pages/BudgetsPage';
import GoalsPage from '@/pages/GoalsPage';
import ReportsPage from '@/pages/ReportsPage';
import type { ReactNode } from 'react';

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-100">
        <div className="animate-pulse text-neutral-400">Carregando...</div>
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-100">
        <div className="animate-pulse text-neutral-400">Carregando...</div>
      </div>
    );
  }
  if (session) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public auth routes */}
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/cadastro" element={<PublicRoute><SignUpPage /></PublicRoute>} />
      <Route path="/recuperar-senha" element={<RecoverPasswordPage />} />
      <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
      <Route path="/convite" element={<AcceptInvitePage />} />

      {/* Protected app routes */}
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <AppLayout>
              <DashboardPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/lancamentos"
        element={
          <ProtectedRoute>
            <AppLayout>
              <TransactionsPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/contas"
        element={
          <ProtectedRoute>
            <AppLayout>
              <AccountsPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/cartoes"
        element={
          <ProtectedRoute>
            <AppLayout>
              <CardsPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/faturas"
        element={
          <ProtectedRoute>
            <AppLayout>
              <InvoicesPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/acertos"
        element={
          <ProtectedRoute>
            <AppLayout>
              <SettlementsPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/categorias"
        element={
          <ProtectedRoute>
            <AppLayout>
              <CategoriesPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/formas-pagamento"
        element={
          <ProtectedRoute>
            <AppLayout>
              <PaymentMethodsPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/orcamentos"
        element={
          <ProtectedRoute>
            <AppLayout>
              <BudgetsPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/metas"
        element={
          <ProtectedRoute>
            <AppLayout>
              <GoalsPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/relatorios"
        element={
          <ProtectedRoute>
            <AppLayout>
              <ReportsPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/configuracoes"
        element={
          <ProtectedRoute>
            <AppLayout>
              <SettingsPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SpacesProvider>
          <AppRoutes />
        </SpacesProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
