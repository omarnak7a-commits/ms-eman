/**
 * Protected route state machine:
 *  - AUTH_INITIALIZING  → loading screen (no redirect, no page render)
 *  - AUTHENTICATED      → render the protected page
 *  - UNAUTHENTICATED    → redirect to /login
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';

function renderRoutes(initialUrl: string, props: { isAuthenticated: boolean; authLoading?: boolean }) {
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <Routes>
        <Route path="/login" element={<div>LOGIN PAGE</div>} />
        <Route
          element={<ProtectedRoute isAuthenticated={props.isAuthenticated} authLoading={props.authLoading} />}
        >
          <Route path="/dashboard" element={<div>DASHBOARD PAGE</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  it('shows a loading state while auth is initializing (no redirect, no page)', () => {
    const { container } = renderRoutes('/dashboard', { isAuthenticated: false, authLoading: true });
    expect(screen.queryByText('LOGIN PAGE')).toBeNull();
    expect(screen.queryByText('DASHBOARD PAGE')).toBeNull();
    // The loading spinner is rendered.
    expect(container.querySelector('.animate-spin')).not.toBeNull();
  });

  it('renders the protected page when authenticated and not loading', () => {
    renderRoutes('/dashboard', { isAuthenticated: true, authLoading: false });
    expect(screen.getByText('DASHBOARD PAGE')).toBeTruthy();
    expect(screen.queryByText('LOGIN PAGE')).toBeNull();
  });

  it('redirects to login when unauthenticated and NOT still loading', () => {
    renderRoutes('/dashboard', { isAuthenticated: false, authLoading: false });
    expect(screen.getByText('LOGIN PAGE')).toBeTruthy();
    expect(screen.queryByText('DASHBOARD PAGE')).toBeNull();
  });

  it('loads then renders the page once auth initialization completes', () => {
    // Simulate the transition: loading → authenticated.
    const first = renderRoutes('/dashboard', { isAuthenticated: false, authLoading: true });
    expect(screen.queryByText('DASHBOARD PAGE')).toBeNull();
    first.unmount();

    renderRoutes('/dashboard', { isAuthenticated: true, authLoading: false });
    expect(screen.getByText('DASHBOARD PAGE')).toBeTruthy();
  });
});
