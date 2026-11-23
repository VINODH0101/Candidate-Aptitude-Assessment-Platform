import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import type {
  Category,
  Difficulty,
  Question,
  QuestionListResponse,
} from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/components/StateViews';
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

type StatusFilter = '' | 'true' | 'false';

export function AdminQuestionsPage() {
  const queryClient = useQueryClient();
  const handleMutationError = useAdminMutationErrorHandler();
  const [banner, setBanner] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category | ''>('');
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<Question | null>(null);

  useEffect(() => {
    const value = searchInput.trim();
    if (value === search) return;
    const timeout = setTimeout(() => {
      setSearch(value);
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchInput, search]);

  const questionsQuery = useQuery({
    queryKey: ['admin-questions', { search, category, difficulty, status, page }],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: '10' });
      if (search) params.set('search', search);
      if (category) params.set('category', category);
      if (difficulty) params.set('difficulty', difficulty);
      if (status) params.set('isActive', status);
      return apiFetch<QuestionListResponse>(`/api/admin/questions?${params.toString()}`);
    },
  });
  useAdminSessionExpiredRedirect(questionsQuery.error);

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['admin-questions'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-analytics'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
  };

  const statusMutation = useMutation<
    unknown,
    Error,
    { id: string; isActive: boolean }
  >({
    mutationFn: ({ id, isActive }) =>
      apiFetch<unknown>(`/api/admin/questions/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: () => {
      setBanner(null);
      refresh();
    },
    onError: (error) => setBanner(handleMutationError(error)),
  });

  const deleteMutation = useMutation<unknown, Error, string>({
    mutationFn: (id) =>
      apiFetch<unknown>(`/api/admin/questions/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setBanner(null);
      setDeleteTarget(null);
      refresh();
    },
    onError: (error) => {
      setBanner(handleMutationError(error));
      setDeleteTarget(null);
    },
  });

  if (questionsQuery.isLoading) return <LoadingState rows={5} />;
  if (questionsQuery.isError) {
    return (
      <ErrorState
        error={questionsQuery.error}
        onRetry={() => void questionsQuery.refetch()}
      />
    );
  }

  const data = questionsQuery.data;
  if (!data) return null;
  const questions = data.items;
  const canActivateMore = data.activeCount < data.maxActiveQuestions;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Question management</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.activeCount} of {data.maxActiveQuestions} questions active. An
            assessment needs exactly {data.maxActiveQuestions} active questions.
          </p>
        </div>
        <Button asChild>
          <Link to="/admin/questions/new">
            <Plus className="h-4 w-4" />
            Add question
          </Link>
        </Button>
      </div>

      {banner ? (
        <Alert variant="destructive">
          <AlertDescription>{banner}</AlertDescription>
        </Alert>
      ) : null}

      {!canActivateMore ? (
        <Alert>
          <AlertDescription>
            The maximum of {data.maxActiveQuestions} active questions is reached.
            Deactivate a question before activating another.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>All questions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <Input
              placeholder="Search question text"
              aria-label="Search questions"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            <Select
              aria-label="Filter by category"
              value={category}
              onChange={(event) => {
                setCategory(event.target.value as Category | '');
                setPage(1);
              }}
            >
              <option value="">All categories</option>
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Filter by difficulty"
              value={difficulty}
              onChange={(event) => {
                setDifficulty(event.target.value as Difficulty | '');
                setPage(1);
              }}
            >
              <option value="">All difficulties</option>
              {DIFFICULTY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Filter by status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as StatusFilter);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
          </div>

          {questions.length === 0 ? (
            <EmptyState
              title="No questions found"
              description="Adjust the filters or add a new question."
              action={
                <Button asChild>
                  <Link to="/admin/questions/new">Add question</Link>
                </Button>
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Question</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Difficulty</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {questions.map((question) => {
                    const activationBlocked =
                      !question.isActive && !canActivateMore;
                    return (
                      <TableRow key={question.id}>
                        <TableCell>
                          <p className="max-w-md text-sm font-medium line-clamp-2">
                            {question.questionText}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {question.options.length} options
                          </p>
                        </TableCell>
                        <TableCell>{question.category}</TableCell>
                        <TableCell>{question.difficulty}</TableCell>
                        <TableCell>
                          {question.isActive ? (
                            <Badge variant="success">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-2">
                            <Button asChild variant="ghost" size="sm">
                              <Link to={`/admin/questions/${question.id}/edit`}>
                                <Pencil className="h-4 w-4" />
                                Edit
                              </Link>
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={statusMutation.isPending || activationBlocked}
                              title={
                                activationBlocked
                                  ? 'Deactivate a question before activating another'
                                  : undefined
                              }
                              onClick={() => {
                                setBanner(null);
                                statusMutation.mutate({
                                  id: question.id,
                                  isActive: !question.isActive,
                                });
                              }}
                            >
                              {question.isActive ? 'Deactivate' : 'Activate'}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                setBanner(null);
                                setDeleteTarget(question);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Page {data.page} of {Math.max(1, data.totalPages)} · {data.total}{' '}
                  question{data.total === 1 ? '' : 's'}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= Math.max(1, data.totalPages)}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete question?</DialogTitle>
            <DialogDescription>
              This permanently deletes the selected question. Questions used by
              attempts cannot be deleted and should be deactivated instead.
            </DialogDescription>
          </DialogHeader>
          {deleteTarget ? (
            <p className="mt-4 rounded-md bg-muted p-3 text-sm">
              {deleteTarget.questionText}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              type="button"
              disabled={deleteMutation.isPending || !deleteTarget}
              onClick={() => {
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
              }}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete question'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
