import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { AppSettings } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

const settingsSchema = z.object({
  assessmentDurationMinutes: z
    .string()
    .regex(/^\d+$/, 'Duration must be a whole number')
    .refine((value) => {
      const minutes = Number(value);
      return minutes >= 5 && minutes <= 180;
    }, 'Duration must be between 5 and 180 minutes'),
  passPercentage: z
    .string()
    .regex(/^\d+$/, 'Pass percentage must be a whole number')
    .refine((value) => {
      const percentage = Number(value);
      return percentage >= 1 && percentage <= 100;
    }, 'Pass percentage must be between 1 and 100'),
});

type SettingsForm = z.infer<typeof settingsSchema>;

interface SettingsResponse {
  settings: AppSettings;
}

const defaults: SettingsForm = {
  assessmentDurationMinutes: '15',
  passPercentage: '60',
};

export function AdminSettingsPage() {
  const queryClient = useQueryClient();
  const [banner, setBanner] = useState<{ tone: 'error' | 'success'; text: string } | null>(
    null,
  );
  const initializedRef = useRef(false);
  const handleMutationError = useAdminMutationErrorHandler();

  const settingsQuery = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => apiFetch<SettingsResponse>('/api/admin/settings'),
  });
  useAdminSessionExpiredRedirect(settingsQuery.error);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: defaults,
  });

  useEffect(() => {
    if (!settingsQuery.data || initializedRef.current) return;
    initializedRef.current = true;
    const settings = settingsQuery.data.settings;
    reset({
      assessmentDurationMinutes: String(settings.assessmentDurationMinutes),
      passPercentage: String(settings.passPercentage),
    });
  }, [settingsQuery.data, reset]);

  const updateMutation = useMutation<SettingsResponse, Error, SettingsForm>({
    mutationFn: (values) =>
      apiFetch<SettingsResponse>('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({
          assessmentDurationMinutes: Number(values.assessmentDurationMinutes),
          passPercentage: Number(values.passPercentage),
        }),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['admin-settings'], data);
      const settings = data.settings;
      reset({
        assessmentDurationMinutes: String(settings.assessmentDurationMinutes),
        passPercentage: String(settings.passPercentage),
      });
      setBanner({ tone: 'success', text: 'Settings saved.' });
    },
    onError: (error) => {
      setBanner({ tone: 'error', text: handleMutationError(error) });
    },
  });

  if (settingsQuery.isLoading) return <LoadingState rows={3} />;
  if (settingsQuery.isError) {
    return (
      <ErrorState
        error={settingsQuery.error}
        onRetry={() => void settingsQuery.refetch()}
      />
    );
  }

  const settings = settingsQuery.data?.settings;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Assessment settings</h1>
        <p className="text-sm text-muted-foreground">
          Defaults applied when an assessment starts. Existing attempts keep the
          duration and pass percentage captured when they began.
        </p>
      </div>

      {banner ? (
        <Alert variant={banner.tone === 'error' ? 'destructive' : 'success'}>
          <AlertDescription>{banner.text}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Defaults</CardTitle>
          <CardDescription>
            Last updated:{' '}
            {settings ? new Date(settings.updatedAt).toLocaleString() : '—'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit((values) => {
              setBanner(null);
              updateMutation.mutate(values);
            })}
            className="max-w-xl space-y-4"
            noValidate
          >
            <div className="space-y-2">
              <Label htmlFor="duration">Assessment duration (minutes)</Label>
              <Input
                id="duration"
                type="number"
                min={5}
                max={180}
                {...register('assessmentDurationMinutes')}
              />
              {errors.assessmentDurationMinutes ? (
                <p className="text-xs text-destructive">
                  {errors.assessmentDurationMinutes.message}
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Allowed range: 5–180 minutes. Default: 15.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="passPercentage">Pass percentage</Label>
              <Input
                id="passPercentage"
                type="number"
                min={1}
                max={100}
                {...register('passPercentage')}
              />
              {errors.passPercentage ? (
                <p className="text-xs text-destructive">
                  {errors.passPercentage.message}
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Allowed range: 1–100. Default: 60.
              </p>
            </div>

            <Button
              type="submit"
              disabled={isSubmitting || updateMutation.isPending}
            >
              {isSubmitting || updateMutation.isPending ? 'Saving…' : 'Save settings'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
