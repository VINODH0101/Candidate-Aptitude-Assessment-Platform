import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { apiFetch, errorMessage, fieldErrors } from '@/lib/api';
import type { CandidateProfile, Gender, Qualification } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

const GENDER_OPTIONS: Array<{ value: Gender | ''; label: string }> = [
  { value: '', label: 'Not specified' },
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
  { value: 'PREFER_NOT_TO_SAY', label: 'Prefer not to say' },
];

const QUALIFICATION_OPTIONS: Array<{ value: Qualification; label: string }> = [
  { value: 'HIGH_SCHOOL', label: 'High school' },
  { value: 'DIPLOMA', label: 'Diploma' },
  { value: 'BACHELORS', label: "Bachelor's degree" },
  { value: 'MASTERS', label: "Master's degree" },
  { value: 'DOCTORATE', label: 'Doctorate' },
  { value: 'OTHER', label: 'Other' },
];

const registrationSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(50, 'Name must be at most 50 characters')
    .regex(/^[A-Za-z]+(?: [A-Za-z]+)*$/, 'Name may contain letters and spaces only'),
  email: z.string().trim().email('Enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
  age: z
    .string()
    .regex(/^\d+$/, 'Age must be a whole number')
    .refine((value) => {
      const age = Number(value);
      return age >= 18 && age <= 60;
    }, 'Age must be between 18 and 60'),
  phone: z.string().trim().regex(/^\d{10}$/, 'Phone must be exactly 10 digits'),
  gender: z.string().optional(),
  highestQualification: z.string().min(1, 'Select your highest qualification'),
  city: z
    .string()
    .trim()
    .max(100, 'City must be at most 100 characters')
    .optional(),
});

type RegistrationForm = z.infer<typeof registrationSchema>;

const defaultValues: RegistrationForm = {
  fullName: '',
  email: '',
  password: '',
  age: '',
  phone: '',
  gender: '',
  highestQualification: '',
  city: '',
};

export function CandidateRegistrationPage() {
  const queryClient = useQueryClient();
  const [registered, setRegistered] = useState<CandidateProfile | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegistrationForm>({
    resolver: zodResolver(registrationSchema),
    defaultValues,
  });

  const onSubmit = async (values: RegistrationForm): Promise<void> => {
    setBanner(null);
    try {
      const result = await apiFetch<{ candidate: CandidateProfile }>(
        '/api/candidate/register',
        {
          method: 'POST',
          body: JSON.stringify({
            fullName: values.fullName.trim(),
            email: values.email.trim(),
            password: values.password,
            age: Number(values.age),
            phone: values.phone.trim(),
            gender: values.gender ? (values.gender as Gender) : undefined,
            highestQualification: values.highestQualification as Qualification,
            city: values.city && values.city.trim().length > 0 ? values.city.trim() : undefined,
          }),
        },
      );
      setRegistered(result.candidate);
      queryClient.setQueryData(['candidate-session'], {
        candidate: result.candidate,
      });
      reset(defaultValues);
    } catch (error) {
      const serverFields = fieldErrors(error);
      let appliedFieldError = false;
      for (const key of Object.keys(serverFields)) {
        const message = serverFields[key];
        if (!message) continue;
        if (key in defaultValues) {
          setError(key as keyof RegistrationForm, { type: 'server', message });
          appliedFieldError = true;
        }
      }
      setBanner(
        appliedFieldError
          ? 'Please fix the highlighted fields.'
          : errorMessage(error),
      );
    }
  };

  if (registered) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <div className="mb-2 flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-6 w-6" />
              <CardTitle>Registration complete</CardTitle>
            </div>
            <CardDescription>
              Your candidate profile has been created successfully.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <dl className="grid grid-cols-3 gap-2 text-sm">
              <dt className="text-muted-foreground">Name</dt>
              <dd className="col-span-2 font-medium">{registered.fullName}</dd>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="col-span-2 font-medium">{registered.email}</dd>
              <dt className="text-muted-foreground">Age</dt>
              <dd className="col-span-2 font-medium">{registered.age}</dd>
              <dt className="text-muted-foreground">Phone</dt>
              <dd className="col-span-2 font-medium">{registered.phone}</dd>
              <dt className="text-muted-foreground">Qualification</dt>
              <dd className="col-span-2 font-medium">
                {registered.highestQualification}
              </dd>
              <dt className="text-muted-foreground">City</dt>
              <dd className="col-span-2 font-medium">{registered.city ?? '—'}</dd>
            </dl>
            <div className="flex items-center gap-2 pt-2">
              <Button asChild>
                <Link to="/instructions">Continue to instructions</Link>
              </Button>
              <Button variant="outline" onClick={() => setRegistered(null)}>
                Register another
              </Button>
              <Button asChild variant="ghost">
                <Link to="/">Back to home</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-2xl">Candidate registration</CardTitle>
          <CardDescription>
            Provide your details to create a candidate profile.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {banner ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{banner}</AlertDescription>
              </Alert>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="fullName">Full name</Label>
                <Input id="fullName" placeholder="Jane Doe" {...register('fullName')} />
                {errors.fullName ? (
                  <p className="text-xs text-destructive">{errors.fullName.message}</p>
                ) : null}
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  {...register('email')}
                />
                {errors.email ? (
                  <p className="text-xs text-destructive">{errors.email.message}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="age">Age</Label>
                <Input id="age" type="number" min={18} max={60} {...register('age')} />
                {errors.age ? (
                  <p className="text-xs text-destructive">{errors.age.message}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone (10 digits)</Label>
                <Input id="phone" inputMode="numeric" maxLength={10} {...register('phone')} />
                {errors.phone ? (
                  <p className="text-xs text-destructive">{errors.phone.message}</p>
                ) : null}
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  {...register('password')}
                />
                {errors.password ? (
                  <p className="text-xs text-destructive">{errors.password.message}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="gender">Gender (optional)</Label>
                <Select id="gender" {...register('gender')}>
                  {GENDER_OPTIONS.map((option) => (
                    <option key={option.value || 'none'} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="highestQualification">Highest qualification</Label>
                <Select
                  id="highestQualification"
                  {...register('highestQualification')}
                >
                  <option value="">Select…</option>
                  {QUALIFICATION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                {errors.highestQualification ? (
                  <p className="text-xs text-destructive">
                    {errors.highestQualification.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="city">City (optional)</Label>
                <Input id="city" placeholder="Bengaluru" {...register('city')} />
                {errors.city ? (
                  <p className="text-xs text-destructive">{errors.city.message}</p>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Submitting…' : 'Create candidate profile'}
              </Button>
              <Button asChild variant="ghost" type="button">
                <Link to="/">Cancel</Link>
              </Button>
            </div>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already registered?{' '}
            <Link to="/candidate/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
