import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, Eye, Search } from 'lucide-react';
import { apiDownload, apiFetch } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { PaginatedResults } from '@/types';
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
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/components/StateViews';
import {
  useAdminMutationErrorHandler,
  useAdminSessionExpiredRedirect,
} from './adminSession';

type ResultFilter = '' | 'PASS' | 'FAIL';
type SortValue =
  | 'attemptDate:desc'
  | 'attemptDate:asc'
  | 'score:desc'
  | 'score:asc';

interface ResultsResponse {
  results: PaginatedResults;
}

export function AdminResultsPage() {
  const handleMutationError = useAdminMutationErrorHandler();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [resultFilter, setResultFilter] = useState<ResultFilter>('');
  const [sort, setSort] = useState<SortValue>('attemptDate:desc');
  const [page, setPage] = useState(1);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    const value = searchInput.trim();
    if (value === search) return;
    const timeout = setTimeout(() => {
      setSearch(value);
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchInput, search]);

  const resultsQuery = useQuery({
    queryKey: ['admin-results', { search, resultFilter, sort, page }],
    queryFn: () => {
      const [sortBy, sortOrder] = sort.split(':') as [
        'score' | 'attemptDate',
        'asc' | 'desc',
      ];
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '10',
        sortBy,
        sortOrder,
      });
      if (search) params.set('search', search);
      if (resultFilter) params.set('result', resultFilter);
      return apiFetch<ResultsResponse>(
        `/api/admin/results?${params.toString()}`,
      ).then((data) => data.results);
    },
    refetchOnWindowFocus: true,
  });
  useAdminSessionExpiredRedirect(resultsQuery.error);

  const exportMutation = useMutation<
    { blob: Blob; filename: string },
    Error,
    { filtered: boolean }
  >({
    mutationFn: ({ filtered }) => {
      const [sortBy, sortOrder] = sort.split(':') as [
        'score' | 'attemptDate',
        'asc' | 'desc',
      ];
      const params = new URLSearchParams({ sortBy, sortOrder });
      if (filtered) {
        if (search) params.set('search', search);
        if (resultFilter) params.set('result', resultFilter);
      }
      return apiDownload(`/api/admin/results/export?${params.toString()}`);
    },
    onSuccess: (data) => {
      const url = URL.createObjectURL(data.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = data.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    },
    onError: (error) => setExportError(handleMutationError(error)),
  });

  if (resultsQuery.isLoading) return <LoadingState rows={5} />;
  if (resultsQuery.isError) {
    return (
      <ErrorState
        error={resultsQuery.error}
        onRetry={() => void resultsQuery.refetch()}
      />
    );
  }

  const data = resultsQuery.data;
  if (!data) return null;

  const rangeStart = data.filteredCount === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const rangeEnd = Math.min(data.page * data.pageSize, data.filteredCount);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Candidate results</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Finalized attempts only. Completed and time-expired attempts are
            included.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setExportError(null);
              exportMutation.mutate({ filtered: false });
            }}
            disabled={exportMutation.isPending}
          >
            <Download className="h-4 w-4" />
            Export all
          </Button>
          <Button
            onClick={() => {
              setExportError(null);
              exportMutation.mutate({ filtered: true });
            }}
            disabled={exportMutation.isPending}
          >
            <Download className="h-4 w-4" />
            {exportMutation.isPending ? 'Exporting…' : 'Export filtered'}
          </Button>
        </div>
      </div>

      {exportError ? (
        <Alert variant="destructive">
          <AlertDescription>{exportError}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>All results</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search by name or email"
                aria-label="Search results by name or email"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
            </div>
            <Select
              aria-label="Filter by result"
              value={resultFilter}
              onChange={(event) => {
                setResultFilter(event.target.value as ResultFilter);
                setPage(1);
              }}
            >
              <option value="">All results</option>
              <option value="PASS">Passed</option>
              <option value="FAIL">Failed</option>
            </Select>
            <Select
              aria-label="Sort results"
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as SortValue);
                setPage(1);
              }}
            >
              <option value="attemptDate:desc">Newest first</option>
              <option value="attemptDate:asc">Oldest first</option>
              <option value="score:desc">Highest score</option>
              <option value="score:asc">Lowest score</option>
            </Select>
          </div>

          {data.items.length === 0 ? (
            <EmptyState
              title="No results found"
              description={
                data.totalCount === 0
                  ? 'No candidate has completed an assessment yet.'
                  : 'No results match the current filters.'
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead className="hidden md:table-cell">Phone</TableHead>
                    <TableHead className="hidden md:table-cell">Age</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Percentage</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Attempt date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((item) => (
                    <TableRow key={item.attemptId}>
                      <TableCell>
                        <p className="font-medium">{item.candidate.fullName}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.candidate.email}
                        </p>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {item.candidate.phone}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {item.candidate.age}
                      </TableCell>
                      <TableCell>
                        {item.netScore} / {item.maxScore}
                      </TableCell>
                      <TableCell>{item.percentage}%</TableCell>
                      <TableCell>
                        {item.passed ? (
                          <Badge variant="success">Passed</Badge>
                        ) : (
                          <Badge variant="destructive">Failed</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {item.status === 'EXPIRED' ? (
                          <Badge variant="warning">Time expired</Badge>
                        ) : (
                          <Badge variant="secondary">Completed</Badge>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDateTime(item.startedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="ghost" size="sm">
                          <Link to={`/admin/results/${item.attemptId}`}>
                            <Eye className="h-4 w-4" />
                            View
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Showing {rangeStart}–{rangeEnd} of {data.filteredCount} matching ·{' '}
                  {data.totalCount} total finalized
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
                  <span className="text-sm text-muted-foreground">
                    Page {data.page} of {Math.max(1, data.totalPages)}
                  </span>
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
    </div>
  );
}
