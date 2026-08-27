import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FiMail } from 'react-icons/fi';
import AuthShell from '../components/AuthShell';
import { api, getApiErrorMessage } from '../api/core';

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-200';

export default function ForgotPassword() {
  const [identifier, setIdentifier] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const response = await api.post('/users/password_reset_request/', { identifier });
      setMessage(
        response.data?.message ||
          'If an account exists for that email or username, a password reset link has been sent.'
      );
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to send password reset email right now.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Forgot password"
      subtitle="Enter your email or username and we will send reset instructions if the account exists."
    >
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-yellow-100 text-brand-800">
        <FiMail size={22} />
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">Email or Username</label>
          <input
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            className={inputClass}
            placeholder="Enter email or username"
            autoComplete="username"
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
          disabled={loading}
          className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-brand-700 via-brand-600 to-brand-500 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-brand-900/20 transition hover:from-brand-800 hover:to-brand-600 focus:outline-none focus:ring-2 focus:ring-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Sending reset link...' : 'Send Reset Link'}
        </button>
      </form>

      <p className="mt-7 text-center text-sm text-slate-600">
        Remembered it?{' '}
        <Link to="/login" className="font-bold text-brand-700 hover:text-brand-900">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
