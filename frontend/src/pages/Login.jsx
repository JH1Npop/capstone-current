import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FiArrowRight, FiEye, FiEyeOff } from 'react-icons/fi';
import AuthShell from '../components/AuthShell';
import { useAuth } from '../context/AuthContext';

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-200';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const submittedUsername = username.trim();
    const submittedPassword = password.trim();
    if (!submittedUsername || !submittedPassword) {
      setError('Enter your username and password.');
      return;
    }

    setLoading(true);

    try {
      const result = await login(submittedUsername, submittedPassword);

      if (!result || typeof result !== 'object') {
        setError('Login service error. Please try again.');
        return;
      }

      if (!result.success) {
        setError(result.message || 'Login failed. Please try again.');
        return;
      }

      const requestedPath = searchParams.get('next');
      const safeNextPath = requestedPath?.startsWith('/') && !requestedPath.startsWith('//')
        ? requestedPath
        : '/';
      navigate(safeNextPath, { replace: true });
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to continue to the AFN service management system."
      maxWidth="max-w-[360px]"
      variant="solar"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">Username or Email</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={inputClass}
            placeholder="Enter username or email"
            autoComplete="username"
            required
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">Password</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${inputClass} pr-12`}
              placeholder="Enter password"
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-400 transition hover:text-brand-700"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
            </button>
          </div>

          <div className="mt-3 text-right">
            <Link to="/forgot-password" className="text-sm font-semibold text-brand-700 hover:text-brand-900">
              Forgot password?
            </Link>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-700 via-brand-600 to-brand-500 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-brand-900/20 transition hover:from-brand-800 hover:to-brand-600 focus:outline-none focus:ring-2 focus:ring-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8V0C5.3 0 0 5.3 0 12h4z" />
              </svg>
              Signing in...
            </span>
          ) : (
            <>
              Sign In
              <FiArrowRight size={17} />
            </>
          )}
        </button>
      </form>

      <p className="mt-7 text-center text-sm text-slate-600">
        Do not have an account?{' '}
        <Link to="/register" className="font-bold text-brand-700 hover:text-brand-900">
          Create account
        </Link>
      </p>
    </AuthShell>
  );
}
