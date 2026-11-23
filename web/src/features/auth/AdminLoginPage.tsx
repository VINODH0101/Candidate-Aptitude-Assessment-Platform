import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertCircle,
  BarChart3,
  ListChecks,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from './AuthContext';
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
import { errorMessage } from '@/lib/api';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

export function AdminLoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: LoginForm): Promise<void> => {
    setError(null);
    try {
      await login.mutateAsync(values);
      navigate('/admin', { replace: true });
    } catch (submitError) {
      setError(errorMessage(submitError));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-2">
      <section className="hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/15">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <div>
              <p className="text-lg font-semibold">Aptitude Admin</p>
              <p className="text-sm text-primary-foreground/70">
                Assessment console
              </p>
            </div>
          </div>

          <h1 className="mt-14 text-3xl font-bold leading-tight">
            Manage assessments with confidence.
          </h1>
          <p className="mt-3 max-w-md text-primary-foreground/80">
            Publish questions, monitor performance, and review candidate results
            from one secure console.
          </p>

          <ul className="mt-8 space-y-3 text-sm text-primary-foreground/85">
            <li className="flex items-center gap-2">
              <ListChecks className="h-4 w-4" />
              Question bank with active-question limits
            </li>
            <li className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Live analytics, pass rates, and result management
            </li>
            <li className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              HttpOnly session cookies and server-side authorization
            </li>
          </ul>
        </div>
        <p className="text-xs text-primary-foreground/60">
          Corporate aptitude assessment platform
        </p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-4 py-10 lg:min-h-0">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl">Administrator sign in</CardTitle>
            <CardDescription>
              Use your administrator credentials to access the console.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              {error ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  placeholder="admin@example.com"
                  {...register('email')}
                />
                {errors.email ? (
                  <p className="text-xs text-destructive">{errors.email.message}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  {...register('password')}
                />
                {errors.password ? (
                  <p className="text-xs text-destructive">{errors.password.message}</p>
                ) : null}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting || login.isPending}
              >
                {isSubmitting || login.isPending ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>

            <p className="mt-4 text-center text-sm text-muted-foreground">
              <Link to="/" className="font-medium text-primary hover:underline">
                Back to home
              </Link>
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
