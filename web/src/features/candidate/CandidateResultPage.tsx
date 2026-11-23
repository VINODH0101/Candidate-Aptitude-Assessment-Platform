import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { formatClock, formatDateTime } from '@/lib/format';
import type { CandidateResultWithName } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ErrorState, LoadingState } from '@/components/StateViews';
import { useSessionExpiredRedirect } from './useSessionExpiredRedirect';

interface ResultResponse {
  result: CandidateResultWithName;
}

export function CandidateResultPage() {
  const resultQuery = useQuery({
    queryKey: ['candidate-result'],
    queryFn: () =>
      apiFetch<ResultResponse>('/api/candidate/assessment/result').then(
        (data) => data.result,
      ),
    retry: false,
  });
  useSessionExpiredRedirect(resultQuery.error);

  if (resultQuery.isLoading) return <LoadingState rows={4} />;

  if (resultQuery.isError) {
    const error = resultQuery.error;
    if (error instanceof ApiError && error.code === 'ASSESSMENT_NOT_SUBMITTED') {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Assessment not yet submitted</CardTitle>
            <CardDescription>
              Finish your assessment to see your result.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/assessment">Return to assessment</Link>
            </Button>
          </CardContent>
        </Card>
      );
    }
    if (error instanceof ApiError && error.status === 404) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>No assessment attempt found</CardTitle>
            <CardDescription>
              Start the assessment to generate a result.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/instructions">View instructions</Link>
            </Button>
          </CardContent>
        </Card>
      );
    }
    return (
      <ErrorState error={error} onRetry={() => void resultQuery.refetch()} />
    );
  }

  const result = resultQuery.data;
  if (!result) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Assessment result</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.candidateName} · submitted {formatDateTime(result.submittedAt)}
          </p>
        </div>
        {result.passed ? (
          <Badge variant="success">Passed</Badge>
        ) : (
          <Badge variant="destructive">Not passed</Badge>
        )}
      </div>

      {result.status === 'EXPIRED' ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            The time limit expired. Answers saved before the deadline were graded.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Score</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end gap-2">
              <span className="text-5xl font-bold tracking-tight">
                {result.percentage}%
              </span>
              <span className="pb-2 text-sm text-muted-foreground">
                {result.netScore} / {result.maxScore} marks
              </span>
            </div>
            <Progress value={Math.max(0, result.percentage)} />
            <p className="text-sm text-muted-foreground">
              Pass mark: {result.passPercentage}% · Marks deducted:{' '}
              {result.marksDeducted}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <Row label="Total questions" value={result.totalQuestions} />
              <Row label="Correct answers" value={result.correctCount} />
              <Row label="Incorrect answers" value={result.incorrectCount} />
              <Row label="Unattempted" value={result.unattemptedCount} />
              <Row label="Time taken" value={formatClock(result.timeTakenSeconds)} />
              <Row label="Started" value={formatDateTime(result.startedAt)} />
              <Row label="Submitted" value={formatDateTime(result.submittedAt)} />
            </dl>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild>
          <Link to="/result/review">Detailed answer review</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
