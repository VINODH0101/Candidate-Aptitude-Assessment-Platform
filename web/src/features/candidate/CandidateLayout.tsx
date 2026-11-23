import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, ShieldAlert } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import type { CandidateProfile } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ErrorState, FullPageLoading } from '@/components/StateViews';

interface SessionResponse {
  candidate: CandidateProfile;
}

export function CandidateLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const onAssessment = location.pathname.startsWith('/assessment');

  const sessionQuery = useQuery({
    queryKey: ['candidate-session'],
    queryFn: () => apiFetch<SessionResponse>('/api/candidate/session'),
    retry: false,
  });

  const logout = useMutation({
    mutationFn: () =>
      apiFetch<{ loggedOut: boolean }>('/api/candidate/logout', { method: 'POST' }),
    onSettled: () => {
      queryClient.clear();
      navigate('/candidate/login', { replace: true });
    },
  });

  if (sessionQuery.isLoading) return <FullPageLoading />;

  if (sessionQuery.isError) {
    if (sessionQuery.error instanceof ApiError && sessionQuery.error.status === 401) {
      return <SessionExpired />;
    }
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <div className="w-full max-w-md">
          <ErrorState
            error={sessionQuery.error}
            onRetry={() => void sessionQuery.refetch()}
          />
        </div>
      </div>
    );
  }

  const candidate = sessionQuery.data?.candidate;

  const handleLogout = (): void => {
    if (
      onAssessment &&
      !window.confirm(
        'Sign out? Your saved answers are kept, but any unsaved change will be lost.',
      )
    ) {
      return;
    }
    logout.mutate();
  };

  const brand = (
    <span className="flex items-center gap-2 font-semibold">
      <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
        A
      </span>
      <span className="hidden sm:inline">Aptitude Assessment</span>
    </span>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
          {onAssessment ? (
            brand
          ) : (
            <Link to="/instructions" className="flex items-center gap-2 font-semibold">
              <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
                A
              </span>
              <span className="hidden sm:inline">Aptitude Assessment</span>
            </Link>
          )}
          <div className="flex items-center gap-3">
            <span className="hidden max-w-[16rem] truncate text-sm text-muted-foreground md:inline">
              {candidate?.fullName}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              disabled={logout.isPending}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

function SessionExpired() {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-primary" />
            <CardTitle>Session expired</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Your session has expired or is invalid. Please sign in again to
            continue.
          </p>
          <div className="flex items-center gap-2">
            <Button asChild>
              <Link to="/candidate/login">Sign in</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/register">Register</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
