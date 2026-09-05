import { Navigate, Outlet } from 'react-router-dom';
import { LoadingSpinner } from '@/components/LoadingSpinner';

interface ProtectedRouteProps {
  isAuthenticated: boolean;
  /** Auth state is still being restored/validated — show a loading state,
   *  never redirect to login and never render the protected page yet. */
  authLoading?: boolean;
  redirectTo?: string;
}

export function ProtectedRoute({
  isAuthenticated,
  authLoading = false,
  redirectTo = '/login',
}: ProtectedRouteProps) {
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <LoadingSpinner className="py-16" />
      </div>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }
  return <Outlet />;
}
