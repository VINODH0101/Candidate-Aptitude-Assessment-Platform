import {
  createContext,
  useContext,
  type ReactNode,
} from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import { apiFetch, fetchAdminSession } from '@/lib/api';
import type { AdminProfile } from '@/types';

export interface AdminLoginInput {
  email: string;
  password: string;
}

interface AdminAuthResponse {
  admin: AdminProfile;
}

interface AuthContextValue {
  admin: AdminProfile | null;
  isLoading: boolean;
  login: UseMutationResult<AdminAuthResponse, Error, AdminLoginInput>;
  logout: UseMutationResult<{ loggedOut: boolean }, Error, void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: ['admin-session'],
    queryFn: fetchAdminSession,
    retry: false,
    staleTime: 60_000,
  });

  const login = useMutation<AdminAuthResponse, Error, AdminLoginInput>({
    mutationFn: (input) =>
      apiFetch<AdminAuthResponse>('/api/admin/auth/login', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['admin-session'], data.admin);
    },
  });

  const logout = useMutation<{ loggedOut: boolean }, Error, void>({
    mutationFn: () =>
      apiFetch<{ loggedOut: boolean }>('/api/admin/auth/logout', { method: 'POST' }),
    onSettled: () => {
      queryClient.setQueryData(['admin-session'], null);
      queryClient.removeQueries({ queryKey: ['admin-overview'] });
    },
  });

  const value: AuthContextValue = {
    admin: sessionQuery.data ?? null,
    isLoading: sessionQuery.isLoading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
