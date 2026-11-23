import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, ListChecks, Target, Trophy } from 'lucide-react';
import { apiFetch, errorMessage } from '@/lib/api';
import type { AssessmentInstructions, AttemptState } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ErrorState, LoadingState } from '@/components/StateViews';
import { useSessionExpiredRedirect } from './useSessionExpiredRedirect';

interface InstructionsResponse {
  instructions: AssessmentInstructions;
}
interface AttemptResponse {
  attempt: AttemptState;
}

export function CandidateInstructionsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [banner, setBanner] = useState<string | null>(null);

  const instructionsQuery = useQuery({
    queryKey: ['candidate-instructions'],
    queryFn: () =>
      apiFetch<InstructionsResponse>('/api/candidate/assessment/instructions'),
    retry: false,
  });
  useSessionExpiredRedirect(instructionsQuery.error);

  const startMutation = useMutation<AttemptResponse, Error, void>({
    mutationFn: () =>
      apiFetch<AttemptResponse>('/api/candidate/assessment/start', {
        method: 'POST',
      }),
    onSuccess: (data) => {
      setBanner(null);
      queryClient.setQueryData(['candidate-attempt'], data.attempt);
      void queryClient.invalidateQueries({ queryKey: ['candidate-instructions'] });
      if (data.attempt.status === 'IN_PROGRESS') {
        const key = `candidate-assessment-index:${data.attempt.id}`;
        const stored = Number(sessionStorage.getItem(key) ?? '0');
        const questionIndex =
          Number.isInteger(stored) &&
          stored >= 0 &&
          stored < data.attempt.totalQuestions
            ? stored
            : 0;
        navigate(`/assessment?q=${questionIndex}`, { replace: true });
      } else {
        navigate('/result', { replace: true });
      }
    },
    onError: (error) => setBanner(errorMessage(error)),
  });

  if (instructionsQuery.isLoading) return <LoadingState rows={4} />;
  if (instructionsQuery.isError) {
    return (
      <ErrorState
        error={instructionsQuery.error}
        onRetry={() => void instructionsQuery.refetch()}
      />
    );
  }

  const instructions = instructionsQuery.data?.instructions;
  if (!instructions) return null;

  const completed =
    instructions.attemptStatus === 'COMPLETED' ||
    instructions.attemptStatus === 'EXPIRED';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Assessment instructions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Read the instructions carefully before you begin. Your time starts when
          you start the assessment and cannot be paused.
        </p>
      </div>

      {banner ? (
        <Alert variant="destructive">
          <AlertDescription>{banner}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={<ListChecks className="h-4 w-4" />} label="Questions" value={`${instructions.totalQuestions}`} />
        <Stat icon={<Clock className="h-4 w-4" />} label="Duration" value={`${instructions.durationMinutes} min`} />
        <Stat icon={<Trophy className="h-4 w-4" />} label="Maximum score" value={`${instructions.maxScore}`} />
        <Stat icon={<Target className="h-4 w-4" />} label="Pass mark" value={`${instructions.passPercentage}%`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Marking scheme</CardTitle>
          <CardDescription>
            Net score = (2 × correct answers) − (1 × incorrect answers). Negative
            scores are possible.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 text-sm sm:grid-cols-3">
            <li className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
              Correct: +{instructions.correctMarks}
            </li>
            <li className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-900">
              Incorrect: {instructions.incorrectMarks}
            </li>
            <li className="rounded-md border border-border bg-muted px-3 py-2">
              Unanswered: {instructions.unansweredMarks}
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Before you start</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <ul className="list-disc space-y-1 pl-5">
            <li>You will see one question at a time with four options.</li>
            <li>Use Previous, Next, or the question palette to navigate.</li>
            <li>Answers save automatically as you select them.</li>
            <li>You can mark questions for review and return to them.</li>
            <li>The countdown is controlled by the server; refreshing or closing the browser does not pause it.</li>
            <li>You may submit manually, or the assessment submits automatically when time expires.</li>
            <li>You have one attempt. Resuming after refresh continues the same attempt.</li>
          </ul>

          {!instructions.ready ? (
            <Alert variant="destructive">
              <AlertDescription>
                This assessment is not available yet: {instructions.activeQuestions}{' '}
                of {instructions.requiredQuestions} questions are active.
              </AlertDescription>
            </Alert>
          ) : null}

          {instructions.hasAttempt ? (
            <Alert>
              <AlertDescription>
                {completed
                  ? 'You have already completed this assessment. View your result.'
                  : 'You have an assessment in progress. Resume to continue where you left off.'}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 pt-2">
            {completed ? (
              <Button asChild>
                <Link to="/result">View result</Link>
              </Button>
            ) : (
              <Button
                onClick={() => startMutation.mutate()}
                disabled={
                  (instructions.hasAttempt ? false : !instructions.ready) ||
                  startMutation.isPending
                }
              >
                {startMutation.isPending
                  ? 'Starting…'
                  : instructions.hasAttempt
                    ? 'Resume assessment'
                    : 'Start test'}
              </Button>
            )}
            <Button asChild variant="ghost">
              <Link to="/">Back to home</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-sm">{label}</span>
          {icon}
        </div>
        <p className="mt-1 text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
