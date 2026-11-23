import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, MinusCircle, XCircle } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { CandidateResultReview, ReviewQuestion } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ErrorState, LoadingState } from '@/components/StateViews';
import { useSessionExpiredRedirect } from './useSessionExpiredRedirect';

interface ReviewResponse {
  review: CandidateResultReview;
}

export function CandidateReviewPage() {
  const reviewQuery = useQuery({
    queryKey: ['candidate-review'],
    queryFn: () =>
      apiFetch<ReviewResponse>('/api/candidate/assessment/result/review').then(
        (data) => data.review,
      ),
    retry: false,
  });
  useSessionExpiredRedirect(reviewQuery.error);

  if (reviewQuery.isLoading) return <LoadingState rows={5} />;

  if (reviewQuery.isError) {
    const error = reviewQuery.error;
    if (error instanceof ApiError && error.code === 'ASSESSMENT_NOT_SUBMITTED') {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Review not available yet</CardTitle>
            <CardDescription>
              Submit your assessment to review the answers.
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
      <ErrorState error={error} onRetry={() => void reviewQuery.refetch()} />
    );
  }

  const review = reviewQuery.data;
  if (!review) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Detailed answer review</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {review.candidateName} · {review.correctCount} correct ·{' '}
            {review.incorrectCount} incorrect · {review.unattemptedCount}{' '}
            unattempted
          </p>
        </div>
        {review.passed ? (
          <Badge variant="success">Passed · {review.percentage}%</Badge>
        ) : (
          <Badge variant="destructive">Not passed · {review.percentage}%</Badge>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline">
          <Link to="/result">Back to result</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link to="/">Back to home</Link>
        </Button>
      </div>

      <div className="space-y-3">
        {review.questions.map((question) => (
          <ReviewCard key={question.position} question={question} />
        ))}
      </div>
    </div>
  );
}

function ReviewCard({ question }: { question: ReviewQuestion }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">
            {question.number}. {question.questionText}
          </CardTitle>
          <div className="flex items-center gap-2">
            {question.markedForReview ? (
              <Badge variant="warning">Marked for review</Badge>
            ) : null}
            <OutcomeBadge outcome={question.outcome} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
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
                {isSelected ? <Badge variant="outline">Your answer</Badge> : null}
                {isCorrect ? <Badge variant="success">Correct answer</Badge> : null}
              </span>
            </div>
          );
        })}

        <p className="pt-1 text-sm text-muted-foreground">
          Your answer:{' '}
          {question.selectedOptionIndex === null
            ? 'Not answered'
            : question.selectedAnswer}
        </p>
      </CardContent>
    </Card>
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
