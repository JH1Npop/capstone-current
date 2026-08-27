import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import AuthShell from '../components/AuthShell';
import { API_BASE_URL } from '../api/core';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('Verifying your email address...');

  useEffect(() => {
    const uid = searchParams.get('uid');
    const token = searchParams.get('token');
    const email = searchParams.get('email');

    if (!uid || !token) {
      setStatus('error');
      setMessage('This verification link is missing required information.');
      return;
    }

    let isMounted = true;

    axios.post(`${API_BASE_URL}/users/verify_email/`, { uid, token, email })
      .then((response) => {
        if (!isMounted) return;
        setStatus('success');
        setMessage(response.data?.message || 'Email verified successfully. You can now sign in.');
      })
      .catch((error) => {
        if (!isMounted) return;
        setStatus('error');
        setMessage(error.response?.data?.error || 'This verification link is invalid or has expired.');
      });

    return () => {
      isMounted = false;
    };
  }, [searchParams]);

  return (
    <AuthShell
      title={status === 'success' ? 'Email verified' : 'Verify email'}
      subtitle={message}
      maxWidth="max-w-[420px]"
    >
      <div className="space-y-4">
        <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${
          status === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : status === 'error'
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-sky-200 bg-sky-50 text-sky-800'
        }`}>
          {message}
        </div>

        <Link
          to="/login"
          className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-brand-700 via-brand-600 to-brand-500 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-brand-900/20 transition hover:from-brand-800 hover:to-brand-600 focus:outline-none focus:ring-2 focus:ring-yellow-300"
        >
          Go to Sign In
        </Link>
      </div>
    </AuthShell>
  );
}
