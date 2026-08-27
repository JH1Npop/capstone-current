import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FiLock } from 'react-icons/fi';
import AuthShell from '../components/AuthShell';
import { api, getApiErrorMessage } from '../api/core';

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-200';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const uid = searchParams.get('uid') || '';
  const token = searchParams.get('token') || '';
  const hasResetLink = Boolean(uid && token);

  const [newPassword, setNewPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!hasResetLink) {
      setError('This password reset link is invalid or incomplete.');
      return;
    }

    if (newPassword !== passwordConfirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const response = await api.post('/users/password_reset_confirm/', {
        uid,
        token,
        new_password: newPassword,
        password_confirm: passwordConfirm,
      });
      setMessage(
        response.data?.message ||
          'Password has been reset successfully. Please sign in with your new password.'
      );
      setNewPassword('');
      setPasswordConfirm('');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to reset password with this link.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Reset password"
      subtitle="Choose a new password for your AFN SERVE account."
    >
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-yellow-100 text-brand-800">
        <FiLock size={22} />
      </div>

      {!hasResetLink && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          This password reset link is invalid or incomplete.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">New Password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className={inputClass}
            placeholder="Enter new password"
            autoComplete="new-password"
            required
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">Confirm New Password</label>
          <input
            type="password"
            value={passwordConfirm}
            onChange={(event) => setPasswordConfirm(event.target.value)}
            className={inputClass}
            placeholder="Re-enter new password"
            autoComplete="new-password"
            required
          />
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>
        )}

        {message && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{message}</div>
        )}

        <button
          type="submit"
          disabled={loading || !hasResetLink}
          className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-brand-700 via-brand-600 to-brand-500 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-brand-900/20 transition hover:from-brand-800 hover:to-brand-600 focus:outline-none focus:ring-2 focus:ring-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Resetting password...' : 'Reset Password'}
        </button>
      </form>

      <p className="mt-7 text-center text-sm text-slate-600">
        <Link to="/login" className="font-bold text-brand-700 hover:text-brand-900">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
