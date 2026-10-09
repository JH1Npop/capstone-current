import { useEffect, useState } from 'react';
import { FiEye, FiEyeOff, FiLock, FiShield } from 'react-icons/fi';
import {
  changePassword,
  confirmMfaSetup,
  disableMfa,
  getMfaStatus,
  startMfaSetup,
} from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const emptyPassword = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

const inputClass = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100';

export default function ProfileSecuritySection({ onMessage }) {
  const { logout, updateCurrentUser, user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordData, setPasswordData] = useState(emptyPassword);
  const [loading, setLoading] = useState(false);
  const [mfaStatus, setMfaStatus] = useState(null);
  const [mfaMode, setMfaMode] = useState('idle');
  const [mfaPassword, setMfaPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaSetup, setMfaSetup] = useState(null);
  const [recoveryCodes, setRecoveryCodes] = useState([]);

  const isAdministrator = user?.role === 'admin' || user?.role === 'superadmin';

  useEffect(() => {
    if (!isAdministrator) return undefined;
    let active = true;
    getMfaStatus()
      .then((status) => {
        if (active) setMfaStatus(status);
      })
      .catch(() => {
        if (active) setMfaStatus({ enabled: Boolean(user?.mfa_enabled) });
      });
    return () => {
      active = false;
    };
  }, [isAdministrator, user?.mfa_enabled]);

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

  const beginMfaSetup = async (event) => {
    event.preventDefault();
    setLoading(true);
    onMessage({ type: '', text: '' });
    try {
      const setup = await startMfaSetup(mfaPassword);
      setMfaSetup(setup);
      setMfaCode('');
      setMfaMode('confirm');
    } catch (error) {
      onMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const finishMfaSetup = async (event) => {
    event.preventDefault();
    setLoading(true);
    onMessage({ type: '', text: '' });
    try {
      const result = await confirmMfaSetup({
        currentPassword: mfaPassword,
        setupToken: mfaSetup.setup_token,
        code: mfaCode,
      });
      setRecoveryCodes(result.recovery_codes || []);
      setMfaStatus({ enabled: true, recovery_codes_remaining: result.recovery_codes?.length || 0 });
      updateCurrentUser({ mfa_enabled: true });
      setMfaMode('recovery');
      setMfaPassword('');
      setMfaCode('');
      onMessage({ type: 'success', text: 'Multi-factor authentication is enabled.' });
    } catch (error) {
      onMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const turnOffMfa = async (event) => {
    event.preventDefault();
    setLoading(true);
    onMessage({ type: '', text: '' });
    try {
      await disableMfa({ currentPassword: mfaPassword, code: mfaCode });
      updateCurrentUser({ mfa_enabled: false });
      await logout();
      window.location.assign('/login?reason=mfa_changed');
    } catch (error) {
      onMessage({ type: 'error', text: error.message });
      setLoading(false);
    }
  };

  const resetMfaForm = () => {
    setMfaMode('idle');
    setMfaPassword('');
    setMfaCode('');
    setMfaSetup(null);
    setRecoveryCodes([]);
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
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

      {isAdministrator ? (
        <div className="mt-6 border-t border-slate-200 pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="flex items-center gap-2 font-semibold text-slate-900">
                <FiShield size={18} />
                Authenticator MFA
              </h4>
              <p className="mt-1 text-sm text-slate-500">
                {mfaStatus?.enabled
                  ? `Enabled${Number.isInteger(mfaStatus.recovery_codes_remaining) ? ` · ${mfaStatus.recovery_codes_remaining} recovery codes remaining` : ''}`
                  : 'Protect this administrator account with an authenticator app.'}
              </p>
            </div>
            {mfaMode === 'idle' ? (
              <button
                type="button"
                onClick={() => setMfaMode(mfaStatus?.enabled ? 'disable' : 'setup')}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                {mfaStatus?.enabled ? 'Disable MFA' : 'Enable MFA'}
              </button>
            ) : null}
          </div>

          {mfaMode === 'setup' ? (
            <form onSubmit={beginMfaSetup} className="mt-4 space-y-3">
              <label className="block text-sm font-medium text-slate-700">
                Confirm current password
                <input type="password" value={mfaPassword} onChange={(event) => setMfaPassword(event.target.value)} autoComplete="current-password" className={inputClass} required />
              </label>
              <div className="flex gap-3">
                <button type="submit" disabled={loading} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Continue</button>
                <button type="button" onClick={resetMfaForm} className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-800">Cancel</button>
              </div>
            </form>
          ) : null}

          {mfaMode === 'confirm' && mfaSetup ? (
            <form onSubmit={finishMfaSetup} className="mt-4 space-y-3">
              <p className="text-sm text-slate-600">Add this setup key to your authenticator app, then enter its current six-digit code.</p>
              <code className="block break-all rounded-lg bg-slate-100 p-3 text-sm font-semibold text-slate-900">{mfaSetup.secret}</code>
              <label className="block text-sm font-medium text-slate-700">
                Authentication code
                <input value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} autoComplete="one-time-code" className={inputClass} required />
              </label>
              <div className="flex gap-3">
                <button type="submit" disabled={loading} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Verify and enable</button>
                <button type="button" onClick={resetMfaForm} className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-800">Cancel</button>
              </div>
            </form>
          ) : null}

          {mfaMode === 'recovery' ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">Save these recovery codes now. Each works once and they cannot be displayed again.</p>
              <div className="mt-3 grid gap-2 font-mono text-sm text-amber-950 sm:grid-cols-2">
                {recoveryCodes.map((code) => <span key={code}>{code}</span>)}
              </div>
              <button type="button" onClick={resetMfaForm} className="mt-4 rounded-lg bg-amber-900 px-4 py-2 text-sm font-semibold text-white">I saved them</button>
            </div>
          ) : null}

          {mfaMode === 'disable' ? (
            <form onSubmit={turnOffMfa} className="mt-4 space-y-3">
              <p className="text-sm text-slate-600">Disabling MFA requires your password and a current authenticator or recovery code. You will be signed out.</p>
              <label className="block text-sm font-medium text-slate-700">
                Current password
                <input type="password" value={mfaPassword} onChange={(event) => setMfaPassword(event.target.value)} autoComplete="current-password" className={inputClass} required />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Authentication or recovery code
                <input value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} autoComplete="one-time-code" className={inputClass} required />
              </label>
              <div className="flex gap-3">
                <button type="submit" disabled={loading} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Disable MFA</button>
                <button type="button" onClick={resetMfaForm} className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-800">Cancel</button>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
