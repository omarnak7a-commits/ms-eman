import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/hooks/useAuth';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: '⊞' },
  { to: '/exams', label: 'Exams', icon: '📋' },
  { to: '/students', label: 'Students', icon: '👥' },
  { to: '/ranking', label: 'Student Ranking', icon: '🏆' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
];

export function TeacherLayout() {
  const navigate = useNavigate();
  // Read the teacher from the SHARED auth store (not raw storage) so a
  // session invalidation updates the layout too, and route logout through the
  // store so signing out resets isAuthenticated for every consumer at once —
  // otherwise LoginPage still believes the teacher is signed in and bounces
  // /login straight back to /dashboard.
  const { teacher, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Sidebar – desktop */}
      <aside className="hidden md:flex flex-col w-60 bg-white border-r border-slate-200 shrink-0">
        <div className="px-5 py-6 border-b border-slate-100 flex flex-col items-center text-center">
          <Logo size="lg" className="h-20 w-auto object-contain mx-auto" />
          <div className="text-sm font-bold text-slate-800 mt-3.5 tracking-tight truncate max-w-full">
            {teacher?.name || 'Ms Eman Zahy'}
          </div>
          <div className="text-xs text-slate-500 font-medium mt-0.5 tracking-wide">
            Teacher Dashboard
          </div>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-1">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`
              }
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-100">
          <div className="text-xs text-slate-500 mb-1 truncate">{teacher?.name}</div>
          <div className="text-xs text-slate-400 mb-3 truncate">{teacher?.email}</div>
          <button
            onClick={handleLogout}
            className="w-full text-sm text-slate-600 hover:text-red-600 text-left transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-slate-200 flex items-center justify-between px-4 py-3">
        <Logo size="sm" />
        <button
          onClick={() => setMobileOpen(v => !v)}
          className="p-2 rounded-lg text-slate-600 hover:bg-slate-100"
          aria-label="Menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 bg-white flex flex-col h-full">
            <div className="px-5 py-6 border-b border-slate-100 flex flex-col items-center text-center">
              <Logo size="lg" className="h-20 w-auto object-contain mx-auto" />
              <div className="text-sm font-bold text-slate-800 mt-3.5 tracking-tight truncate max-w-full">
                {teacher?.name || 'Ms Eman Zahy'}
              </div>
              <div className="text-xs text-slate-500 font-medium mt-0.5 tracking-wide">
                Teacher Dashboard
              </div>
            </div>
            <nav className="flex-1 py-4 px-3 space-y-1">
              {navItems.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'
                    }`
                  }
                >
                  <span>{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="p-4 border-t border-slate-100">
              <div className="text-xs text-slate-500 mb-1">{teacher?.name}</div>
              <button onClick={handleLogout} className="text-sm text-red-600">Sign out</button>
            </div>
          </aside>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 min-w-0 md:overflow-auto">
        <div className="md:hidden h-14" /> {/* mobile header spacer */}
        <Outlet />
      </main>
    </div>
  );
}
