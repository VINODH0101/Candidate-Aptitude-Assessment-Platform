import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, errorMessage } from '@/lib/api';

function clearAdminSession(queryClient: ReturnType<typeof useQueryClient>): void {
  queryClient.setQueryData(['admin-session'], null);
}

export function useAdminSessionExpiredRedirect(error: unknown): void {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) {
      clearAdminSession(queryClient);
      navigate('/admin/login', { replace: true });
    }
  }, [error, navigate, queryClient]);
}

export function useAdminMutationErrorHandler(): (error: unknown) => string {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useCallback(
    (error: unknown): string => {
      if (error instanceof ApiError && error.status === 401) {
        clearAdminSession(queryClient);
        navigate('/admin/login', { replace: true });
        return 'Your session has expired. Please sign in again.';
      }
      return errorMessage(error);
    },
    [navigate, queryClient],
  );
}
