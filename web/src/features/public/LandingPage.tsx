import { Link } from 'react-router-dom';
import { ClipboardCheck, ShieldCheck } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function LandingPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-4xl space-y-8">
        <div className="text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-primary text-primary-foreground">
            <ClipboardCheck className="h-6 w-6" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Aptitude Assessment Platform</h1>
          <p className="mt-2 text-muted-foreground">
            Register as a candidate, or sign in to the administrator console.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Candidate registration</CardTitle>
              <CardDescription>
                Create your candidate profile to be eligible for assessments.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                <Button asChild className="w-full">
                  <Link to="/register">Register as a candidate</Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link to="/candidate/login">Candidate sign in</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <CardTitle>Administrator</CardTitle>
              </div>
              <CardDescription>
                Secure sign-in for platform administrators.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link to="/admin/login">Admin sign in</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
