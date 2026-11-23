import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Gauge,
  Trophy,
  Users,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import type { DashboardAnalytics } from '@/types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ErrorState, LoadingState } from '@/components/StateViews';
import { useAdminSessionExpiredRedirect } from './adminSession';

interface AnalyticsResponse {
  analytics: DashboardAnalytics;
}

function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{label}</p>
          <span className="text-muted-foreground">{icon}</span>
        </div>
        <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

const PIE_COLORS = ['#10b981', '#ef4444'];

export function AdminDashboardPage() {
  const analyticsQuery = useQuery({
    queryKey: ['admin-analytics'],
    queryFn: () =>
      apiFetch<AnalyticsResponse>('/api/admin/analytics').then(
        (data) => data.analytics,
      ),
    refetchOnWindowFocus: true,
  });
  useAdminSessionExpiredRedirect(analyticsQuery.error);

  if (analyticsQuery.isLoading) return <LoadingState rows={4} />;
  if (analyticsQuery.isError) {
    return (
      <ErrorState
        error={analyticsQuery.error}
        onRetry={() => void analyticsQuery.refetch()}
      />
    );
  }

  const analytics = analyticsQuery.data;
  if (!analytics) return null;

  const { totals, performance } = analytics;
  const hasFinalized = totals.finalizedAssessments > 0;
  const passFailData = [
    { name: 'Passed', value: performance.passedCount },
    { name: 'Failed', value: performance.failedCount },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Platform overview</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Live metrics computed from finalized assessment attempts.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Registered candidates"
          value={String(totals.candidatesRegistered)}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="Completed tests"
          value={String(totals.finalizedAssessments)}
          hint={`${totals.completedAssessments} completed · ${totals.expiredAssessments} expired`}
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <StatCard
          label="Average score"
          value={`${performance.averagePercentage}%`}
          hint={`Average net score ${performance.averageNetScore} / 20`}
          icon={<Gauge className="h-4 w-4" />}
        />
        <StatCard
          label="Pass rate"
          value={`${performance.passRate}%`}
          hint={`${performance.passedCount} passed · ${performance.failedCount} failed`}
          icon={<BarChart3 className="h-4 w-4" />}
        />
        <StatCard
          label="Highest score"
          value={`${performance.highestPercentage}%`}
          hint={`Highest net score ${performance.highestNetScore} / 20`}
          icon={<Trophy className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Score distribution</CardTitle>
            <CardDescription>
              Finalized attempts grouped by percentage band.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {hasFinalized ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={analytics.scoreDistribution}
                  margin={{ top: 8, right: 8, bottom: 0, left: -20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart message="No finalized results yet." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pass / fail split</CardTitle>
            <CardDescription>
              Based on {totals.finalizedAssessments} finalized attempt
              {totals.finalizedAssessments === 1 ? '' : 's'}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {hasFinalized ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={passFailData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={95}
                    paddingAngle={2}
                  >
                    {passFailData.map((entry, index) => (
                      <Cell
                        key={entry.name}
                        fill={PIE_COLORS[index] ?? '#6366f1'}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart message="No finalized results yet." />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Activity className="h-4 w-4" />
          {totals.inProgressAttempts} attempt
          {totals.inProgressAttempts === 1 ? '' : 's'} in progress
        </span>
        <span>
          {performance.passedCount + performance.failedCount} graded result
          {performance.passedCount + performance.failedCount === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="grid h-[260px] place-items-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
      {message}
    </div>
  );
}
