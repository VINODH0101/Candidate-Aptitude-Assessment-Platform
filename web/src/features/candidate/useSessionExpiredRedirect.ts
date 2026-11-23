import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';

export function useSessionExpiredRedirect(error: unknown): void {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) {
      queryClient.setQueryData(['candidate-session'], null);
      navigate('/candidate/login', { replace: true });
    }
  }, [error, navigate, queryClient]);
}
