import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { apiFetch, fieldErrors } from '@/lib/api';
import type { Category, Difficulty, Question } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ErrorState, LoadingState } from '@/components/StateViews';
import {
  useAdminMutationErrorHandler,
  useAdminSessionExpiredRedirect,
} from './adminSession';

const CATEGORY_OPTIONS: Array<{ value: Category; label: string }> = [
  { value: 'QUANTITATIVE', label: 'Quantitative' },
  { value: 'LOGICAL', label: 'Logical' },
  { value: 'VERBAL', label: 'Verbal' },
];

const DIFFICULTY_OPTIONS: Array<{ value: Difficulty; label: string }> = [
  { value: 'EASY', label: 'Easy' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HARD', label: 'Hard' },
];

const questionSchema = z
  .object({
    questionText: z
      .string()
      .trim()
      .min(5, 'Question text must be at least 5 characters')
      .max(2000, 'Question text is too long'),
    option0: z.string().trim().min(1, 'Option is required').max(500),
    option1: z.string().trim().min(1, 'Option is required').max(500),
    option2: z.string().trim().min(1, 'Option is required').max(500),
    option3: z.string().trim().min(1, 'Option is required').max(500),
    correctOptionIndex: z.enum(['0', '1', '2', '3']),
    category: z.enum(['QUANTITATIVE', 'LOGICAL', 'VERBAL']),
    difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  })
  .superRefine((values, context) => {
    const options = [values.option0, values.option1, values.option2, values.option3].map(
      (option) => option.trim().toLowerCase(),
    );
    if (new Set(options).size !== options.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['option0'],
        message: 'Options must be distinct',
      });
    }
  });

type QuestionForm = z.infer<typeof questionSchema>;

const defaultValues: QuestionForm = {
  questionText: '',
  option0: '',
  option1: '',
  option2: '',
  option3: '',
  correctOptionIndex: '0',
  category: 'QUANTITATIVE',
  difficulty: 'EASY',
};

interface QuestionResponse {
  question: Question;
}

interface QuestionPayload {
  questionText: string;
  options: string[];
  correctOptionIndex: number;
  category: Category;
  difficulty: Difficulty;
}

export function AdminQuestionEditorPage() {
  const { questionId } = useParams();
  const isEdit = Boolean(questionId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const handleMutationError = useAdminMutationErrorHandler();
  const [banner, setBanner] = useState<string | null>(null);
  const initializedRef = useRef(false);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<QuestionForm>({
    resolver: zodResolver(questionSchema),
    defaultValues,
  });

  const questionQuery = useQuery({
    queryKey: ['admin-question', questionId],
    queryFn: () =>
      apiFetch<QuestionResponse>(`/api/admin/questions/${questionId}`),
    enabled: isEdit,
  });
  useAdminSessionExpiredRedirect(questionQuery.error);

  useEffect(() => {
    if (!questionQuery.data || initializedRef.current) return;
    initializedRef.current = true;
    const question = questionQuery.data.question;
    reset({
      questionText: question.questionText,
      option0: question.options[0] ?? '',
      option1: question.options[1] ?? '',
      option2: question.options[2] ?? '',
      option3: question.options[3] ?? '',
      correctOptionIndex: String(question.correctOptionIndex) as QuestionForm['correctOptionIndex'],
      category: question.category,
      difficulty: question.difficulty,
    });
  }, [questionQuery.data, reset]);

  const applyServerErrors = (error: unknown): void => {
    const fields = fieldErrors(error);
    let applied = false;
    const directKeys = [
      'questionText',
      'category',
      'difficulty',
      'correctOptionIndex',
    ] as const;
    for (const key of directKeys) {
      const message = fields[key];
      if (message) {
        setError(key, { type: 'server', message });
        applied = true;
      }
    }
    const optionKey = Object.keys(fields).find(
      (key) => key === 'options' || key.startsWith('options.'),
    );
    if (optionKey) {
      const message = fields[optionKey];
      if (message) {
        setError('option0', { type: 'server', message });
        applied = true;
      }
    }
    setBanner(
      applied ? 'Please fix the highlighted fields.' : handleMutationError(error),
    );
  };

  const saveMutation = useMutation<unknown, Error, QuestionPayload>({
    mutationFn: (payload) =>
      isEdit
        ? apiFetch<unknown>(`/api/admin/questions/${questionId}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          })
        : apiFetch<unknown>('/api/admin/questions', {
            method: 'POST',
            body: JSON.stringify(payload),
          }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-questions'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-analytics'] });
      navigate('/admin/questions');
    },
    onError: applyServerErrors,
  });

  const onSubmit = (values: QuestionForm): void => {
    setBanner(null);
    saveMutation.mutate({
      questionText: values.questionText.trim(),
      options: [
        values.option0.trim(),
        values.option1.trim(),
        values.option2.trim(),
        values.option3.trim(),
      ],
      correctOptionIndex: Number(values.correctOptionIndex),
      category: values.category,
      difficulty: values.difficulty,
    });
  };

  if (isEdit && questionQuery.isLoading) return <LoadingState rows={5} />;
  if (isEdit && questionQuery.isError) {
    return (
      <ErrorState
        error={questionQuery.error}
        onRetry={() => void questionQuery.refetch()}
      />
    );
  }

  const existing = questionQuery.data?.question;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link to="/admin/questions" aria-label="Back to questions">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h2 className="text-2xl font-semibold">
            {isEdit ? 'Edit question' : 'Add question'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Exactly four options with exactly one correct answer.
          </p>
        </div>
      </div>

      {banner ? (
        <Alert variant="destructive">
          <AlertDescription>{banner}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Question details</CardTitle>
            {existing ? (
              <Badge variant={existing.isActive ? 'success' : 'secondary'}>
                {existing.isActive ? 'Active' : 'Inactive'}
              </Badge>
            ) : null}
          </div>
          {isEdit ? (
            <CardDescription>
              Activate or deactivate this question from the question list.
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <div className="space-y-2">
              <Label htmlFor="questionText">Question text</Label>
              <Textarea id="questionText" rows={4} {...register('questionText')} />
              {errors.questionText ? (
                <p className="text-xs text-destructive">{errors.questionText.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>Options (select the correct one)</Label>
              <div className="space-y-2">
                {(['option0', 'option1', 'option2', 'option3'] as const).map(
                  (field, index) => (
                    <div key={field} className="flex items-center gap-3">
                      <input
                        type="radio"
                        value={String(index)}
                        aria-label={`Mark option ${index + 1} correct`}
                        className="h-4 w-4"
                        {...register('correctOptionIndex')}
                      />
                      <Input placeholder={`Option ${index + 1}`} {...register(field)} />
                    </div>
                  ),
                )}
              </div>
              {(['option0', 'option1', 'option2', 'option3'] as const).map((field) =>
                errors[field] ? (
                  <p key={field} className="text-xs text-destructive">
                    {errors[field]?.message}
                  </p>
                ) : null,
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select id="category" {...register('category')}>
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                {errors.category ? (
                  <p className="text-xs text-destructive">{errors.category.message}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="difficulty">Difficulty</Label>
                <Select id="difficulty" {...register('difficulty')}>
                  {DIFFICULTY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                {errors.difficulty ? (
                  <p className="text-xs text-destructive">{errors.difficulty.message}</p>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="submit"
                disabled={isSubmitting || saveMutation.isPending}
              >
                {saveMutation.isPending
                  ? 'Saving…'
                  : isEdit
                    ? 'Save changes'
                    : 'Create question'}
              </Button>
              <Button asChild type="button" variant="ghost">
                <Link to="/admin/questions">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
