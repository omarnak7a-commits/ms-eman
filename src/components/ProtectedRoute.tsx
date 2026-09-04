import { Navigate, Outlet } from 'react-router-dom';

interface ProtectedRouteProps {
  isAuthenticated: boolean;
  redirectTo?: string;
}

export function ProtectedRoute({ isAuthenticated, redirectTo = '/login' }: ProtectedRouteProps) {
  if (!isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }
  return <Outlet />;
}