import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import type { CurrentUser } from '../api/client';

const mockUser: CurrentUser = {
  id: 1,
  primaryEmail: 'test@example.com',
  displayName: 'Test',
  avatarUrl: null,
  hasPassword: true,
};

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../contexts/AuthContext';

function renderWithAuth(loading: boolean, user: CurrentUser | null) {
  vi.mocked(useAuth).mockReturnValue({
    user,
    loading,
    error: null,
    login: vi.fn(),
    loginWithLinuxDo: vi.fn(),
    logout: vi.fn(),
    updateUser: vi.fn(),
    clearError: vi.fn(),
  });

  return render(
    <MemoryRouter initialEntries={['/protected']}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/protected" element={<div>Protected Content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  it('loading 时显示 LoadingPage', () => {
    renderWithAuth(true, null);
    expect(screen.getByText('登录中...')).toBeInTheDocument();
  });

  it('未登录时重定向到 /login', () => {
    renderWithAuth(false, null);
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('已登录时渲染子路由', () => {
    renderWithAuth(false, mockUser);
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });
});
