import { Outlet } from 'react-router-dom';
import { Logo } from '@/components/Logo';

export function ExamLayout() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col notranslate" lang="en" translate="no">
      <header className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-start" translate="no">
        <Logo size="lg" className="h-10 sm:h-14 md:h-16" />
      </header>
      <main className="flex-1" translate="no">
        <Outlet />
      </main>
    </div>
  );
}
