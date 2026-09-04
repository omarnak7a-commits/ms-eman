import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSession, logout } from '@/lib/auth';
import { getTeachers, hashPassword } from '@/lib/db';

export function SettingsPage() {
  const teacher = getSession()!;
  const navigate = useNavigate();
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (!currentPw || !newPw || !confirmPw) { setMsg({ type: 'error', text: 'All fields are required.' }); return; }
    if (newPw !== confirmPw) { setMsg({ type: 'error', text: 'New passwords do not match.' }); return; }
    if (newPw.length < 6) { setMsg({ type: 'error', text: 'Password must be at least 6 characters.' }); return; }

    const { checkPassword } = require('@/lib/db');
    if (!checkPassword(currentPw, teacher.password_hash)) {
      setMsg({ type: 'error', text: 'Current password is incorrect.' });
      return;
    }

    const teachers = getTeachers();
    const updated = teachers.map(t =>
      t.id === teacher.id ? { ...t, password_hash: hashPassword(newPw) } : t
    );
    localStorage.setItem('ty_teachers', JSON.stringify(updated));
    setMsg({ type: 'success', text: 'Password changed. Please sign in again.' });
    setTimeout(() => { logout(); navigate('/login'); }, 1500);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Settings</h1>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
        <h2 className="font-semibold text-slate-800 mb-4">Account</h2>
        <div className="space-y-2 text-sm">
          <div className="flex gap-3">
            <span className="text-slate-500 w-20">Name</span>
            <span className="text-slate-800 font-medium">{teacher.name}</span>
          </div>
          <div className="flex gap-3">
            <span className="text-slate-500 w-20">Email</span>
            <span className="text-slate-800">{teacher.email}</span>
          </div>
          <div className="flex gap-3">
            <span className="text-slate-500 w-20">Role</span>
            <span className="capitalize text-slate-800">{teacher.role}</span>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
        <h2 className="font-semibold text-slate-800 mb-4">Change Password</h2>
        {msg && (
          <div className={`mb-4 p-3 rounded-xl text-sm ${msg.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
            {msg.text}
          </div>
        )}
        <form onSubmit={handleChangePassword} className="space-y-4">
          {[
            { label: 'Current password', value: currentPw, set: setCurrentPw },
            { label: 'New password', value: newPw, set: setNewPw },
            { label: 'Confirm new password', value: confirmPw, set: setConfirmPw },
          ].map(f => (
            <div key={f.label}>
              <label className="block text-sm font-medium text-slate-700 mb-1">{f.label}</label>
              <input
                type="password"
                value={f.value}
                onChange={e => f.set(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          ))}
          <button type="submit" className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
            Update Password
          </button>
        </form>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <h2 className="font-semibold text-slate-800 mb-2">Sign Out</h2>
        <p className="text-sm text-slate-500 mb-4">You will be redirected to the login page.</p>
        <button onClick={handleLogout} className="px-5 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700">
          Sign Out
        </button>
      </div>
    </div>
  );
}
