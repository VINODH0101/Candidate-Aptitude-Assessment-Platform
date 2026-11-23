import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  MinusCircle,
  XCircle,
} from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { formatClock, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AdminResultDetail, AdminResultDetailQuestion } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ErrorState, LoadingState } from '@/components/StateViews';
import { useAdminSessionExpiredRedirect } from './adminSession';

interface ResultDetailResponse {
  result: AdminResultDetail;
}

const GENDER_LABELS: Record<string, string> = {
  MALE: 'Male',
  FEMALE: 'Female',
  OTHER: 'Other',
  PREFER_NOT_TO_SAY: 'Prefer not to say',
};

const QUALIFICATION_LABELS: Record<string, string> = {
  HIGH_SCHOOL: 'High school',
  DIPLOMA: 'Diploma',
  BACHELORS: "Bachelor's degree",
  MASTERS: "Master's degree",
  DOCTORATE: 'Doctorate',
  OTHER: 'Other',
};

export function AdminResultDetailPage() {
  const { attemptId = '' } = useParams();

  const detailQuery = useQuery({
    queryKey: ['admin-result', attemptId],
    queryFn: () =>
      apiFetch<ResultDetailResponse>(`/api/admin/results/${attemptId}`).then(
        (data) => data.result,
      ),
    retry: false,
    refetchOnWindowFocus: true,
  });
  useAdminSessionExpiredRedirect(detailQuery.error);

  if (detailQuery.isLoading) return <LoadingState rows={5} />;

  if (detailQuery.isError) {
    const error = detailQuery.error;
    if (
      error instanceof ApiError &&
      (error.status === 404 || error.code === 'RESULT_NOT_FOUND')
    ) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Result not found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              This result does not exist or the attempt has not been finalized.
            </p>
            <Button asChild>
              <Link to="/admin/results">Back to results</Link>
            </Button>
          </CardContent>
        </Card>
      );
    }
    return (
      <ErrorState
        error={error}
        onRetry={() => void detailQuery.refetch()}
      />
    );
  }

  const result = detailQuery.data;
  if (!result) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link to="/admin/results" aria-label="Back to results">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex-1">
          <h2 className="text-2xl font-semibold">{result.candidate.fullName}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.candidate.email} · submitted {formatDateTime(result.submittedAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {result.passed ? (
            <Badge variant="success">Passed</Badge>
          ) : (
            <Badge variant="destructive">Failed</Badge>
          )}
          {result.status === 'EXPIRED' ? (
            <Badge variant="warning">Time expired</Badge>
          ) : (
            <Badge variant="secondary">Completed</Badge>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Candidate profile</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <Row label="Full name" value={result.candidate.fullName} />
              <Row label="Email" value={result.candidate.email} />
              <Row label="Phone" value={result.candidate.phone} />
              <Row label="Age" value={result.candidate.age} />
              <Row
                label="Gender"
                value={
                  result.candidate.gender
                    ? GENDER_LABELS[result.candidate.gender] ?? result.candidate.gender
                    : 'Not specified'
                }
              />
              <Row
                label="Qualification"
                value={
                  QUALIFICATION_LABELS[result.candidate.highestQualification] ??
                  result.candidate.highestQualification
                }
              />
              <Row label="City" value={result.candidate.city ?? '—'} />
              <Row
                label="Registered"
                value={formatDateTime(result.candidate.createdAt)}
              />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <Row label="Net score" value={`${result.netScore} / ${result.maxScore}`} />
              <Row label="Percentage" value={`${result.percentage}%`} />
              <Row label="Pass mark" value={`${result.passPercentage}%`} />
              <Row label="Correct answers" value={result.correctCount} />
              <Row label="Incorrect answers" value={result.incorrectCount} />
              <Row label="Unattempted" value={result.unattemptedCount} />
              <Row label="Marks deducted" value={result.marksDeducted} />
              <Row label="Time taken" value={formatClock(result.timeTakenSeconds)} />
              <Row label="Started" value={formatDateTime(result.startedAt)} />
              <Row label="Expired at" value={formatDateTime(result.expiresAt)} />
              <Row label="Submitted" value={formatDateTime(result.submittedAt)} />
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Question and answer review</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {result.questions.map((question) => (
            <QuestionReview key={question.position} question={question} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function QuestionReview({ question }: { question: AdminResultDetailQuestion }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-medium">
          {question.number}. {question.questionText}
        </p>
        <div className="flex items-center gap-2">
          {question.markedForReview ? (
            <Badge variant="warning">Marked for review</Badge>
          ) : null}
          <OutcomeBadge outcome={question.outcome} />
        </div>
      </div>
      <div className="space-y-2">
        {question.options.map((option, optionIndex) => {
          const isCorrect = optionIndex === question.correctOptionIndex;
          const isSelected = optionIndex === question.selectedOptionIndex;
          return (
            <div
              key={optionIndex}
              className={cn(
                'flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm',
                isCorrect
                  ? 'border-emerald-300 bg-emerald-50'
                  : isSelected
                    ? 'border-red-300 bg-red-50'
                    : 'border-border',
              )}
            >
              <span className="flex items-center gap-2">
                {isCorrect ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : isSelected ? (
                  <XCircle className="h-4 w-4 text-red-500" />
                ) : (
                  <span className="h-4 w-4" />
                )}
                <span>
                  <span className="font-semibold">
                    {String.fromCharCode(65 + optionIndex)}.
                  </span>{' '}
                  {option}
                </span>
              </span>
              <span className="flex items-center gap-2">
                {isSelected ? <Badge variant="outline">Candidate answer</Badge> : null}
                {isCorrect ? <Badge variant="success">Correct answer</Badge> : null}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Candidate answered:{' '}
        {question.selectedOptionIndex === null
          ? 'Not answered'
          : question.selectedAnswer}
      </p>
    </div>
  );
}

function OutcomeBadge({
  outcome,
}: {
  outcome: 'CORRECT' | 'INCORRECT' | 'UNANSWERED';
}) {
  if (outcome === 'CORRECT') {
    return (
      <Badge variant="success" className="gap-1">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Correct
      </Badge>
    );
  }
  if (outcome === 'INCORRECT') {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3.5 w-3.5" />
        Incorrect
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <MinusCircle className="h-3.5 w-3.5" />
      Unanswered
    </Badge>
  );
}
