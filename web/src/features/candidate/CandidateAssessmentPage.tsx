import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Clock, Flag, Send } from 'lucide-react';
import { apiFetch, ApiError, errorMessage } from '@/lib/api';
import { formatClock } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AnswerSaveResult, AttemptState, QuestionView } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ErrorState, LoadingState } from '@/components/StateViews';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useSessionExpiredRedirect } from './useSessionExpiredRedirect';

interface AttemptResponse {
  attempt: AttemptState;
}
interface QuestionResponse {
  question: QuestionView;
}
interface AnswerResponse {
  answer: AnswerSaveResult;
}
interface SaveVars {
  index: number;
  selectedOptionIndex?: number | null;
  markedForReview?: boolean;
}

export function CandidateAssessmentPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [now, setNow] = useState(() => Date.now());
  const [offset, setOffset] = useState(0);
  const [banner, setBanner] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lastFailedSave, setLastFailedSave] = useState<SaveVars | null>(null);
  const autoSubmittedRef = useRef(false);

  const attemptQuery = useQuery({
    queryKey: ['candidate-attempt'],
    queryFn: () =>
      apiFetch<AttemptResponse>('/api/candidate/assessment/attempt').then(
        (data) => data.attempt,
      ),
    retry: false,
  });
  useSessionExpiredRedirect(attemptQuery.error);

  const attempt = attemptQuery.data ?? null;
  const totalQuestions = attempt?.totalQuestions ?? 0;
  const storedIndex = attempt
    ? Number(
        sessionStorage.getItem(`candidate-assessment-index:${attempt.id}`) ?? '0',
      )
    : 0;
  const requestedIndex = searchParams.has('q')
    ? Number(searchParams.get('q'))
    : storedIndex;
  const index =
    Number.isInteger(requestedIndex) &&
    requestedIndex >= 0 &&
    totalQuestions > 0 &&
    requestedIndex < totalQuestions
      ? requestedIndex
      : 0;

  const questionQuery = useQuery({
    queryKey: ['candidate-question', index],
    queryFn: () =>
      apiFetch<QuestionResponse>(
        `/api/candidate/assessment/attempt/questions/${index}`,
      ).then((data) => data.question),
    enabled: attempt?.status === 'IN_PROGRESS' && attempt.canAnswer === true,
    retry: false,
  });
  useSessionExpiredRedirect(questionQuery.error);

  const saveMutation = useMutation<AnswerResponse, Error, SaveVars>({
    mutationFn: (vars) =>
      apiFetch<AnswerResponse>(
        `/api/candidate/assessment/attempt/answers/${vars.index}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            ...(vars.selectedOptionIndex !== undefined
              ? { selectedOptionIndex: vars.selectedOptionIndex }
              : {}),
            ...(vars.markedForReview !== undefined
              ? { markedForReview: vars.markedForReview }
              : {}),
          }),
        },
      ),
    retry: 1,
    onSuccess: (data, vars) => {
      setLastFailedSave(null);
      setBanner(null);
      queryClient.setQueryData<QuestionView>(
        ['candidate-question', vars.index],
        (previous) =>
          previous
            ? {
                ...previous,
                selectedOptionIndex: data.answer.selectedOptionIndex,
                markedForReview: data.answer.markedForReview,
                answered: data.answer.selectedOptionIndex !== null,
              }
            : previous,
      );
      void queryClient.invalidateQueries({ queryKey: ['candidate-attempt'] });
    },
    onError: (error, vars) => {
      if (
        error instanceof ApiError &&
        (error.status === 409 || error.status === 410)
      ) {
        setBanner(error.message);
        void queryClient.invalidateQueries({ queryKey: ['candidate-attempt'] });
        return;
      }
      setLastFailedSave(vars);
      setBanner(
        'Your answer could not be saved. Check your connection and retry before navigating.',
      );
    },
  });

  const submitMutation = useMutation<unknown, Error, void>({
    mutationFn: () =>
      apiFetch<unknown>('/api/candidate/assessment/submit', { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['candidate-attempt'] });
      void queryClient.invalidateQueries({ queryKey: ['candidate-result'] });
      void queryClient.invalidateQueries({ queryKey: ['candidate-review'] });
      void queryClient.invalidateQueries({ queryKey: ['candidate-instructions'] });
      navigate('/result', { replace: true });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        queryClient.setQueryData(['candidate-session'], null);
        navigate('/candidate/login', { replace: true });
        return;
      }
      setConfirmOpen(false);
      setBanner(errorMessage(error));
      void queryClient.invalidateQueries({ queryKey: ['candidate-attempt'] });
    },
  });

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!attempt) return;
    setOffset(new Date(attempt.serverNow).getTime() - Date.now());
  }, [attempt?.serverNow]);

  useEffect(() => {
    autoSubmittedRef.current = false;
  }, [attempt?.id]);

  useEffect(() => {
    if (!attempt || totalQuestions === 0) return;
    if (index >= 0 && index < totalQuestions) {
      sessionStorage.setItem(
        `candidate-assessment-index:${attempt.id}`,
        String(index),
      );
    }
  }, [attempt?.id, index, totalQuestions]);

  useEffect(() => {
    if (attempt && attempt.status !== 'IN_PROGRESS') {
      navigate('/result', { replace: true });
    }
  }, [attempt?.status, navigate]);

  useEffect(() => {
    if (
      attemptQuery.error instanceof ApiError &&
      attemptQuery.error.status === 404
    ) {
      navigate('/instructions', { replace: true });
    }
  }, [attemptQuery.error, navigate]);

  useEffect(() => {
    if (
      questionQuery.error instanceof ApiError &&
      (questionQuery.error.status === 409 || questionQuery.error.status === 410)
    ) {
      void queryClient.invalidateQueries({ queryKey: ['candidate-attempt'] });
    }
  }, [questionQuery.error, queryClient]);

  const remaining =
    attempt && attempt.status === 'IN_PROGRESS'
      ? Math.max(
          0,
          Math.ceil(
            (new Date(attempt.expiresAt).getTime() - (now + offset)) / 1000,
          ),
        )
      : 0;

  useEffect(() => {
    if (
      attempt?.status === 'IN_PROGRESS' &&
      remaining <= 0 &&
      !autoSubmittedRef.current
    ) {
      autoSubmittedRef.current = true;
      setConfirmOpen(false);
      setBanner('Time has expired. Submitting your assessment…');
      submitMutation.mutate();
    }
  }, [attempt?.status, remaining, submitMutation]);

  const hasUnsavedWork = saveMutation.isPending || lastFailedSave !== null;
  useEffect(() => {
    if (attempt?.status !== 'IN_PROGRESS' || !hasUnsavedWork) return;
    const handler = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [attempt?.status, hasUnsavedWork]);

  if (attemptQuery.isLoading) return <LoadingState rows={4} />;

  if (attemptQuery.isError) {
    if (
      attemptQuery.error instanceof ApiError &&
      attemptQuery.error.status === 404
    ) {
      return <LoadingState rows={2} />;
    }
    return (
      <ErrorState
        error={attemptQuery.error}
        onRetry={() => void attemptQuery.refetch()}
      />
    );
  }

  if (!attempt || attempt.status !== 'IN_PROGRESS') {
    return <LoadingState rows={2} />;
  }

  const question = questionQuery.data;
  const navigation = attempt.navigation;
  const unansweredCount = navigation.filter((entry) => !entry.answered).length;
  const timerTone =
    remaining <= 60
      ? 'bg-red-100 text-red-700'
      : remaining <= 300
        ? 'bg-amber-100 text-amber-700'
        : 'bg-slate-100 text-slate-700';

  const goTo = (next: number): void => {
    if (saveMutation.isPending || lastFailedSave) return;
    const clamped = Math.min(Math.max(0, next), attempt.totalQuestions - 1);
    setSearchParams({ q: String(clamped) }, { replace: true });
  };

  const updateQuestionCache = (vars: SaveVars): void => {
    queryClient.setQueryData<QuestionView>(
      ['candidate-question', vars.index],
      (previous) => {
        if (!previous) return previous;
        return {
          ...previous,
          ...(vars.selectedOptionIndex !== undefined
            ? {
                selectedOptionIndex: vars.selectedOptionIndex,
                answered: vars.selectedOptionIndex !== null,
              }
            : {}),
          ...(vars.markedForReview !== undefined
            ? { markedForReview: vars.markedForReview }
            : {}),
        };
      },
    );
  };

  const retrySave = (): void => {
    if (lastFailedSave) saveMutation.mutate(lastFailedSave);
  };

  const discardFailedSave = (): void => {
    if (!lastFailedSave) return;
    const failedIndex = lastFailedSave.index;
    setLastFailedSave(null);
    setBanner(null);
    void queryClient.invalidateQueries({
      queryKey: ['candidate-question', failedIndex],
    });
    void queryClient.invalidateQueries({ queryKey: ['candidate-attempt'] });
  };

  const saveBlocked = saveMutation.isPending || lastFailedSave !== null;

  const confirmSubmit = (): void => {
    if (submitMutation.isPending) return;
    if (lastFailedSave) {
      setBanner('Retry or discard the unsaved answer before submitting.');
      return;
    }
    if (saveMutation.isPending) {
      setBanner('Saving your last answer. Please wait a moment.');
      return;
    }
    setConfirmOpen(false);
    setBanner(null);
    submitMutation.mutate();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Assessment in progress</h1>
          <p className="text-sm text-muted-foreground">
            Answered {attempt.answeredCount} of {attempt.totalQuestions} · Marked{' '}
            {attempt.markedCount}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            role="timer"
            aria-label="Time remaining"
            className={cn(
              'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold tabular-nums',
              timerTone,
            )}
          >
            <Clock className="h-4 w-4" />
            {formatClock(remaining)}
          </span>
          <Button
            onClick={() => {
              setBanner(null);
              setConfirmOpen(true);
            }}
            disabled={submitMutation.isPending || saveBlocked}
          >
            <Send className="h-4 w-4" />
            {submitMutation.isPending ? 'Submitting…' : 'Submit'}
          </Button>
        </div>
      </div>

      {banner ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{banner}</AlertDescription>
        </Alert>
      ) : null}

      {!attempt.canAnswer ? (
        <Alert>
          <AlertDescription>
            The time limit has been reached. Finalizing your assessment…
          </AlertDescription>
        </Alert>
      ) : null}

      {questionQuery.isLoading ? <LoadingState rows={4} /> : null}
      {questionQuery.isError ? (
        <ErrorState
          error={questionQuery.error}
          onRetry={() => void questionQuery.refetch()}
        />
      ) : null}

      {question ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
          <section
            className="rounded-lg border border-border bg-white p-6"
            aria-labelledby="question-heading"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Question {question.number} of {question.total}
                </span>
                {question.answered ? (
                  <Badge variant="success">Answered</Badge>
                ) : (
                  <Badge variant="secondary">Unanswered</Badge>
                )}
                {question.markedForReview ? (
                  <Badge variant="warning">Marked</Badge>
                ) : null}
              </div>
              <Button
                type="button"
                size="sm"
                variant={question.markedForReview ? 'secondary' : 'outline'}
                aria-pressed={question.markedForReview}
                onClick={() => {
                  const vars = {
                    index,
                    markedForReview: !question.markedForReview,
                  };
                  updateQuestionCache(vars);
                  saveMutation.mutate(vars);
                }}
                disabled={saveBlocked}
              >
                <Flag className="h-4 w-4" />
                {question.markedForReview ? 'Unmark review' : 'Mark for review'}
              </Button>
            </div>

            <h2
              id="question-heading"
              className="mb-6 text-base font-medium leading-relaxed"
            >
              {question.questionText}
            </h2>

            <div className="space-y-3" role="group" aria-label="Answer options">
              {question.options.map((option, optionIndex) => {
                const selected = question.selectedOptionIndex === optionIndex;
                return (
                  <button
                    key={optionIndex}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      if (saveMutation.isPending || lastFailedSave) return;
                      setBanner(null);
                      const vars = { index, selectedOptionIndex: optionIndex };
                      updateQuestionCache(vars);
                      saveMutation.mutate(vars);
                    }}
                    disabled={saveBlocked}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                      selected
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted',
                    )}
                  >
                    <span
                      className={cn(
                        'grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs font-semibold',
                        selected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input text-muted-foreground',
                      )}
                    >
                      {String.fromCharCode(65 + optionIndex)}
                    </span>
                    <span className="text-sm">{option}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <Button
                variant="outline"
                onClick={() => goTo(index - 1)}
                disabled={!question.hasPrevious || saveBlocked}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <div
                className="flex items-center gap-2 text-xs text-muted-foreground"
                aria-live="polite"
              >
                <span>
                  {saveMutation.isPending
                    ? 'Saving…'
                    : lastFailedSave
                      ? 'Save failed'
                      : 'All answers saved'}
                </span>
                {lastFailedSave ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={retrySave}
                      disabled={saveMutation.isPending}
                    >
                      Retry save
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={discardFailedSave}
                      disabled={saveMutation.isPending}
                    >
                      Discard
                    </Button>
                  </>
                ) : null}
              </div>
              <Button
                variant="outline"
                onClick={() => goTo(index + 1)}
                disabled={!question.hasNext || saveBlocked}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </section>

          <aside
            className="rounded-lg border border-border bg-white p-4"
            aria-label="Question palette"
          >
            <h2 className="mb-3 text-sm font-semibold">Questions</h2>
            <div className="grid grid-cols-5 gap-2">
              {navigation.map((entry) => (
                <button
                  key={entry.position}
                  type="button"
                  onClick={() => goTo(entry.position)}
                  disabled={saveBlocked}
                  aria-current={entry.position === index ? 'true' : undefined}
                  aria-label={`Question ${entry.number}, ${
                    entry.answered ? 'answered' : 'unanswered'
                  }${entry.markedForReview ? ', marked for review' : ''}`}
                  className={cn(
                    'relative grid h-9 w-9 place-items-center rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    entry.answered
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input text-muted-foreground hover:bg-muted',
                    entry.position === index && 'ring-2 ring-ring ring-offset-1',
                  )}
                >
                  {entry.number}
                  {entry.markedForReview ? (
                    <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-500" />
                  ) : null}
                </button>
              ))}
            </div>
            <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
              <li>Filled square: answered</li>
              <li>Outline square: unanswered</li>
              <li>Amber dot: marked for review</li>
            </ul>
          </aside>
        </div>
      ) : null}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit your assessment?</DialogTitle>
            <DialogDescription>
              You cannot change your answers after submitting. Your result will be
              calculated by the server.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-2 text-sm">
            <p>
              Answered: <strong>{attempt.answeredCount}</strong> of{' '}
              {attempt.totalQuestions}
            </p>
            <p>
              Unanswered: <strong>{unansweredCount}</strong>
            </p>
            <p>
              Marked for review: <strong>{attempt.markedCount}</strong>
            </p>
            {lastFailedSave ? (
              <Alert variant="destructive">
                <AlertDescription>
                  One of your answers has not been saved. Retry saving before
                  submitting to avoid losing it.
                </AlertDescription>
              </Alert>
            ) : null}
            {saveMutation.isPending ? (
              <p className="text-muted-foreground">Saving your last answer…</p>
            ) : null}
          </div>

          {lastFailedSave ? (
            <div className="mt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={retrySave}
                disabled={saveMutation.isPending}
              >
                Retry save
              </Button>
            </div>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={confirmSubmit}
              disabled={submitMutation.isPending || saveBlocked}
            >
              {submitMutation.isPending ? 'Submitting…' : 'Confirm submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
