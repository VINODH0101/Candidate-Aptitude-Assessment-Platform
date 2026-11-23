import type { ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { FullPageLoading } from '@/components/StateViews';

export function RequireAdmin() {
  const { admin, isLoading } = useAuth();
  if (isLoading) return <FullPageLoading />;
  if (!admin) return <Navigate to="/admin/login" replace />;
  return <Outlet />;
}

export function PublicOnlyAdmin({ children }: { children: ReactNode }) {
  const { admin, isLoading } = useAuth();
  if (isLoading) return <FullPageLoading />;
  if (admin) return <Navigate to="/admin" replace />;
  return <>{children}</>;
}
