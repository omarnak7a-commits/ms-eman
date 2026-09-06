import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

// Layouts
import { TeacherLayout } from '@/layouts/TeacherLayout';
import { ExamLayout } from '@/layouts/ExamLayout';

// Pages
import { LoginPage } from '@/pages/teacher/LoginPage';
import { DashboardPage } from '@/pages/teacher/DashboardPage';
import { ExamsPage } from '@/pages/teacher/ExamsPage';
import { ExamDetailPage } from '@/pages/teacher/ExamDetailPage';
import { ExamPreviewPage } from '@/pages/teacher/ExamPreviewPage';
import { ExamResultsPage } from '@/pages/teacher/ExamResultsPage';
import { AttemptDetailPage } from '@/pages/teacher/AttemptDetailPage';
import { StudentsPage } from '@/pages/teacher/StudentsPage';
import { StudentRankingPage } from '@/pages/teacher/StudentRankingPage';
import { SettingsPage } from '@/pages/teacher/SettingsPage';
import { ExamStartPage } from '@/pages/student/ExamStartPage';
import { ExamActivePage } from '@/pages/student/ExamActivePage';
import { ResultPage } from '@/pages/student/ResultPage';
import { ReviewPage } from '@/pages/student/ReviewPage';
import { RankingPage } from '@/pages/student/RankingPage';

// Components
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { ErrorBoundary } from '@/components/ErrorBoundary';

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      {/* Login - public */}
      <Route path="/login" element={<LoginPage />} />

      {/* Student routes - public */}
      <Route element={<ExamLayout />}>
        <Route path="/exam/:slug" element={<ExamStartPage />} />
        <Route path="/attempt/:id" element={<ExamActivePage />} />
        <Route path="/attempt/:id/result" element={<ResultPage />} />
        <Route path="/attempt/:id/review" element={<ReviewPage />} />
        <Route path="/attempt/:id/ranking" element={<RankingPage />} />
      </Route>

      {/* Teacher routes - protected */}
      <Route element={<ProtectedRoute isAuthenticated={isAuthenticated} />}>
        <Route element={<TeacherLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/exams" element={<ExamsPage />} />
          <Route path="/exams/:id" element={<ExamDetailPage />} />
          <Route path="/exams/:id/preview" element={<ExamPreviewPage />} />
          <Route path="/exams/:id/results" element={<ExamResultsPage />} />
          <Route path="/exams/:id/results/:attemptId" element={<AttemptDetailPage />} />
          <Route path="/students" element={<StudentsPage />} />
          <Route path="/ranking" element={<StudentRankingPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ErrorBoundary>
  );
}