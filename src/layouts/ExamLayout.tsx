import { Outlet } from 'react-router-dom';
import { Logo } from '@/components/Logo';

export function ExamLayout() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-center">
        <Logo size="sm" />
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
