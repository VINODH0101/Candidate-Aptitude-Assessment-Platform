import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { PublicOnlyAdmin, RequireAdmin } from '@/components/RequireAuth';
import { LandingPage } from '@/features/public/LandingPage';
import { CandidateRegistrationPage } from '@/features/candidate/CandidateRegistrationPage';
import { CandidateLoginPage } from '@/features/candidate/CandidateLoginPage';
import { CandidateLayout } from '@/features/candidate/CandidateLayout';
import { CandidateInstructionsPage } from '@/features/candidate/CandidateInstructionsPage';
import { CandidateAssessmentPage } from '@/features/candidate/CandidateAssessmentPage';
import { CandidateResultPage } from '@/features/candidate/CandidateResultPage';
import { CandidateReviewPage } from '@/features/candidate/CandidateReviewPage';
import { AdminLoginPage } from '@/features/auth/AdminLoginPage';
import { AdminDashboardPage } from '@/features/admin/AdminDashboardPage';
import { AdminQuestionsPage } from '@/features/admin/AdminQuestionsPage';
import { AdminQuestionEditorPage } from '@/features/admin/AdminQuestionEditorPage';
import { AdminResultsPage } from '@/features/admin/AdminResultsPage';
import { AdminResultDetailPage } from '@/features/admin/AdminResultDetailPage';
import { AdminSettingsPage } from '@/features/admin/AdminSettingsPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/register" element={<CandidateRegistrationPage />} />
      <Route path="/candidate/login" element={<CandidateLoginPage />} />

      <Route element={<CandidateLayout />}>
        <Route path="/instructions" element={<CandidateInstructionsPage />} />
        <Route path="/assessment" element={<CandidateAssessmentPage />} />
        <Route path="/result" element={<CandidateResultPage />} />
        <Route path="/result/review" element={<CandidateReviewPage />} />
      </Route>

      <Route
        path="/admin/login"
        element={
          <PublicOnlyAdmin>
            <AdminLoginPage />
          </PublicOnlyAdmin>
        }
      />
      <Route element={<RequireAdmin />}>
        <Route element={<AppLayout />}>
          <Route path="/admin" element={<AdminDashboardPage />} />
          <Route path="/admin/questions" element={<AdminQuestionsPage />} />
          <Route
            path="/admin/questions/new"
            element={<AdminQuestionEditorPage />}
          />
          <Route
            path="/admin/questions/:questionId/edit"
            element={<AdminQuestionEditorPage />}
          />
          <Route path="/admin/results" element={<AdminResultsPage />} />
          <Route
            path="/admin/results/:attemptId"
            element={<AdminResultDetailPage />}
          />
          <Route path="/admin/settings" element={<AdminSettingsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
