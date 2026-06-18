import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { ApiClient } from './api/client';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { OAuthCallbackPage } from './pages/OAuthCallbackPage';
import { AccountsPage } from './pages/AccountsPage';
import { MailListPage } from './pages/MailListPage';
import { AggregateMailPage } from './pages/AggregateMailPage';
import { MailDetailPage } from './pages/MailDetailPage';
import { ProfilePage } from './pages/ProfilePage';
import { Header } from './components/Header';

interface AppProps {
  api: ApiClient;
}

export function App({ api }: AppProps) {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider api={api}>
          <Routes>
            {/* 公开路由 */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/auth/callback" element={<OAuthCallbackPage />} />

            {/* 受保护路由 */}
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Navigate to="/accounts" replace />} />
              <Route path="/accounts" element={
                <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
                  <Header />
                  <AccountsPage api={api} />
                </div>
              } />
              <Route path="/messages" element={
                <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
                  <Header />
                  <AggregateMailPage api={api} />
                </div>
              } />
              <Route path="/accounts/:accountId/messages" element={
                <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
                  <Header />
                  <MailListPage api={api} />
                </div>
              } />
              <Route path="/accounts/:accountId/messages/:messageId" element={
                <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
                  <Header />
                  <MailDetailPage api={api} />
                </div>
              } />
              <Route path="/profile" element={
                <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
                  <Header />
                  <ProfilePage api={api} />
                </div>
              } />
            </Route>
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
