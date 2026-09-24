import { useState } from 'react';
import { FiEye, FiEyeOff, FiLock } from 'react-icons/fi';
import { changePassword } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const emptyPassword = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

const inputClass = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100';

export default function ProfileSecuritySection({ onMessage }) {
  const { logout } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordData, setPasswordData] = useState(emptyPassword);
  const [loading, setLoading] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setPasswordData((current) => ({ ...current, [name]: value }));
  };

  const closeForm = () => {
    setExpanded(false);
    setShowPasswords(false);
    setPasswordData(emptyPassword);
  };

  const submitPassword = async (event) => {
    event.preventDefault();
    onMessage({ type: '', text: '' });

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      onMessage({ type: 'error', text: 'New password and confirmation do not match.' });
      return;
    }

    setLoading(true);
    try {
      await changePassword(passwordData);
      closeForm();
      await logout();
      window.location.assign('/login?reason=password_changed');
    } catch (error) {
      onMessage({ type: 'error', text: error.message || 'Unable to change password.' });
    } finally {
      setLoading(false);
    }
  };

  const passwordType = showPasswords ? 'text' : 'password';

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">Account protection</p>
          <h3 className="mt-1 flex items-center gap-2 text-lg font-semibold text-slate-900">
            <FiLock size={20} />
            Password & Security
          </h3>
          <p className="mt-1 text-sm text-slate-500">Changing your password signs you out of this device.</p>
        </div>
        {!expanded ? (
          <button type="button" onClick={() => setExpanded(true)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            Change Password
          </button>
        ) : null}
      </div>

      {expanded ? (
        <form onSubmit={submitPassword} className="mt-5 space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Current password
            <input type={passwordType} name="currentPassword" value={passwordData.currentPassword} onChange={handleChange} autoComplete="current-password" className={inputClass} required />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            New password
            <input type={passwordType} name="newPassword" value={passwordData.newPassword} onChange={handleChange} autoComplete="new-password" minLength={8} className={inputClass} required />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Confirm new password
            <input type={passwordType} name="confirmPassword" value={passwordData.confirmPassword} onChange={handleChange} autoComplete="new-password" minLength={8} className={inputClass} required />
          </label>
          <p className="text-xs text-slate-500">Use at least 8 characters. Avoid common or entirely numeric passwords.</p>
          <button type="button" onClick={() => setShowPasswords((current) => !current)} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900" aria-pressed={showPasswords}>
            {showPasswords ? <FiEyeOff size={16} /> : <FiEye size={16} />}
            {showPasswords ? 'Hide passwords' : 'Show passwords'}
          </button>
          <div className="flex flex-col gap-3 pt-1 sm:flex-row">
            <button type="submit" disabled={loading} className="flex-1 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60">
              {loading ? 'Changing Password…' : 'Change Password'}
            </button>
            <button type="button" onClick={closeForm} disabled={loading} className="flex-1 rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-300 disabled:opacity-60">
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
