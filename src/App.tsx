import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { seedIfEmpty } from '@/lib/db';

// Layouts
import { TeacherLayout } from '@/layouts/TeacherLayout';
import { ExamLayout } from '@/layouts/ExamLayout';

// Pages
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ExamsPage } from '@/pages/ExamsPage';
import { ExamDetailPage } from '@/pages/ExamDetailPage';
import { ExamResultsPage } from '@/pages/ExamResultsPage';
import { AttemptDetailPage } from '@/pages/AttemptDetailPage';
import { StudentsPage } from '@/pages/StudentsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { ExamStartPage } from '@/pages/ExamStartPage';
import { ExamActivePage } from '@/pages/ExamActivePage';
import { ResultPage } from '@/pages/ResultPage';
import { ReviewPage } from '@/pages/ReviewPage';
import { RankingPage } from '@/pages/RankingPage';

// Components
import { ProtectedRoute } from '@/components/ProtectedRoute';

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
          <Route path="/exams/new" element={<ExamDetailPage />} />
          <Route path="/exams/:id" element={<ExamDetailPage />} />
          <Route path="/exams/:id/results" element={<ExamResultsPage />} />
          <Route path="/exams/:id/results/:attemptId" element={<AttemptDetailPage />} />
          <Route path="/students" element={<StudentsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default function App() {
  seedIfEmpty();

  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}