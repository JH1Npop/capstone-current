import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowRight, FiEye, FiEyeOff, FiMail } from 'react-icons/fi';
import AuthShell from '../components/AuthShell';
import { useAuth } from '../context/AuthContext';
import {
  CALABARZON_PROVINCES,
  fetchBarangays,
  fetchCitiesMunicipalities,
} from '../utils/calabarzonLocations';

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-200';

const SectionLabel = ({ children }) => (
  <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-800">{children}</p>
);

export default function Register() {
  const { register, resendVerification } = useAuth();

  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [successMessage, setSuccessMessage] = useState('');
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    password_confirm: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    phone: '',
    landline: '',
    company_name: '',
    address: '',
    role: 'client',
  });
  const [addressParts, setAddressParts] = useState({
    provinceCode: '',
    barangay: '',
    city: '',
    province: '',
  });
  const [citiesMunicipalities, setCitiesMunicipalities] = useState([]);
  const [barangays, setBarangays] = useState([]);
  const [cityLoadState, setCityLoadState] = useState('idle');
  const [barangayLoadState, setBarangayLoadState] = useState('idle');
  const [cityLoadAttempt, setCityLoadAttempt] = useState(0);
  const [barangayLoadAttempt, setBarangayLoadAttempt] = useState(0);

  const selectedCity = useMemo(
    () => citiesMunicipalities.find((place) => place.code === addressParts.city) || null,
    [addressParts.city, citiesMunicipalities],
  );

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = window.setInterval(() => {
      setResendCooldown((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (!addressParts.provinceCode) {
      setCitiesMunicipalities([]);
      setCityLoadState('idle');
      return undefined;
    }

    const controller = new AbortController();
    setCityLoadState('loading');
    fetchCitiesMunicipalities(addressParts.provinceCode, controller.signal)
      .then((places) => {
        setCitiesMunicipalities(places);
        setCityLoadState('success');
      })
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') {
          setCitiesMunicipalities([]);
          setCityLoadState('error');
        }
      });

    return () => controller.abort();
  }, [addressParts.provinceCode, cityLoadAttempt]);

  useEffect(() => {
    if (!addressParts.city) {
      setBarangays([]);
      setBarangayLoadState('idle');
      return undefined;
    }

    const controller = new AbortController();
    setBarangayLoadState('loading');
    fetchBarangays(addressParts.city, controller.signal)
      .then((places) => {
        setBarangays(places);
        setBarangayLoadState('success');
      })
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') {
          setBarangays([]);
          setBarangayLoadState('error');
        }
      });

    return () => controller.abort();
  }, [addressParts.city, barangayLoadAttempt]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((previous) => ({ ...previous, [name]: '' }));
  };

  const fieldClass = (name, extra = '') => `${inputClass} ${extra} ${
    fieldErrors[name] ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : ''
  }`;

  const renderFieldError = (name) => fieldErrors[name] && (
    <span id={`${name}-error`} className="block text-xs font-medium text-red-700" role="alert">
      {fieldErrors[name]}
    </span>
  );

  const handleProvinceChange = (e) => {
    const provinceCode = e.target.value;
    const province = CALABARZON_PROVINCES.find((place) => place.code === provinceCode);
    setAddressParts({
      provinceCode,
      province: province?.name || '',
      city: '',
      barangay: '',
    });
    setCitiesMunicipalities([]);
    setBarangays([]);
    setBarangayLoadState('idle');
  };

  const handleCityChange = (e) => {
    setAddressParts((previous) => ({
      ...previous,
      city: e.target.value,
      barangay: '',
    }));
    setBarangays([]);
  };

  const buildAddress = () =>
    [
      addressParts.barangay.trim(),
      selectedCity?.name || '',
      addressParts.province.trim(),
    ].filter(Boolean).join(', ');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    setSuccessMessage('');

    if (!formData.username || !formData.email || !formData.password) {
      setFieldErrors({
        username: !formData.username ? 'Enter a username.' : '',
        email: !formData.email ? 'Enter an email address.' : '',
        password: !formData.password ? 'Enter a password.' : '',
      });
      return;
    }

    if (formData.password !== formData.password_confirm) {
      setFieldErrors({ password_confirm: 'Passwords do not match.' });
      return;
    }

    if (formData.password.length < 8) {
      setFieldErrors({ password: 'Use at least 8 characters.' });
      return;
    }

    if (/^\d+$/.test(formData.password)) {
      setFieldErrors({ password: 'Password cannot contain only numbers.' });
      return;
    }

    setLoading(true);
    try {
      const result = await register({
        ...formData,
        address: buildAddress(),
        role: 'client',
      });
      setLoading(false);

      if (!result || !result.success) {
        const resultErrors = result?.errors || {};
        const hasFieldErrors = Object.keys(resultErrors).some((field) => ![
          'error',
          'detail',
          'non_field_errors',
        ].includes(field));
        setFieldErrors(resultErrors);
        setError(hasFieldErrors ? '' : (result?.message || 'Registration failed.'));
        return;
      }

      setRegisteredEmail(formData.email);
      setSuccessMessage(result.message || 'Account created. Please check your email to verify your account before signing in.');
      setResendCooldown(60);
    } catch (err) {
      setLoading(false);
      setError('Something went wrong.');
    }
  };

  const handleResendVerification = async () => {
    if (!registeredEmail || resending || resendCooldown > 0) return;
    setResending(true);
    setResendMessage('');
    const result = await resendVerification(registeredEmail);
    setResending(false);
    setResendMessage(result?.message || 'Unable to resend the verification email.');
    if (result?.success) setResendCooldown(60);
  };

  return (
    <AuthShell
      title="Create account"
      subtitle={successMessage ? 'Verify your email address to activate your account.' : 'Register as a client to request and track AFN services.'}
      maxWidth="max-w-[520px]"
    >
      {successMessage ? (
        <div className="space-y-5">
          <div className="rounded-2xl border border-sky-100 bg-sky-50/80 px-5 py-5 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white text-brand-700 shadow-sm">
              <FiMail size={26} />
            </div>
            <h2 className="mt-4 text-xl font-bold text-slate-950">Check your email</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              We sent a verification link to{' '}
              <span className="font-semibold text-slate-900">{registeredEmail}</span>.
              Open it within 24 hours and verify your account before signing in. Check your spam or junk folder if it does not appear.
            </p>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            {successMessage}
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={handleResendVerification}
              disabled={resending || resendCooldown > 0}
              className="text-sm font-bold text-brand-700 hover:text-brand-900 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              {resending
                ? 'Sending verification email...'
                : resendCooldown > 0
                  ? `Resend available in ${resendCooldown}s`
                  : 'Resend verification email'}
            </button>
            {resendMessage && <p className="mt-2 text-xs leading-5 text-slate-600" role="status">{resendMessage}</p>}
          </div>

          <p className="text-center text-sm text-slate-600">
            Already verified?{' '}
            <Link to="/login" className="font-bold text-brand-700 hover:text-brand-900">
              Sign in
            </Link>
          </p>
        </div>
      ) : (
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-3">
          <SectionLabel>Account</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm font-semibold text-slate-700">
              Username <span aria-hidden="true">*</span>
              <input id="username" name="username" value={formData.username} onChange={handleChange} className={fieldClass('username')} placeholder="Choose a username" autoComplete="username" aria-invalid={Boolean(fieldErrors.username)} aria-describedby={fieldErrors.username ? 'username-error' : undefined} required />
              {renderFieldError('username')}
            </label>
            <label className="space-y-1.5 text-sm font-semibold text-slate-700">
              Email <span aria-hidden="true">*</span>
              <input id="email" type="email" name="email" value={formData.email} onChange={handleChange} className={fieldClass('email')} placeholder="you@example.com" autoComplete="email" aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? 'email-error' : undefined} required />
              {renderFieldError('email')}
            </label>
          </div>
        </div>

        <div className="space-y-3">
          <SectionLabel>Client details</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1.5 text-sm font-semibold text-slate-700">First name<input name="first_name" value={formData.first_name} onChange={handleChange} className={fieldClass('first_name')} autoComplete="given-name" aria-invalid={Boolean(fieldErrors.first_name)} />{renderFieldError('first_name')}</label>
            <label className="space-y-1.5 text-sm font-semibold text-slate-700">Middle name <span className="font-normal text-slate-500">(optional)</span><input name="middle_name" value={formData.middle_name} onChange={handleChange} className={fieldClass('middle_name')} autoComplete="additional-name" aria-invalid={Boolean(fieldErrors.middle_name)} />{renderFieldError('middle_name')}</label>
            <label className="space-y-1.5 text-sm font-semibold text-slate-700">Last name<input name="last_name" value={formData.last_name} onChange={handleChange} className={fieldClass('last_name')} autoComplete="family-name" aria-invalid={Boolean(fieldErrors.last_name)} />{renderFieldError('last_name')}</label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm font-semibold text-slate-700">Mobile number<input name="phone" value={formData.phone} onChange={handleChange} className={fieldClass('phone')} placeholder="09123456789" inputMode="tel" autoComplete="tel" aria-invalid={Boolean(fieldErrors.phone)} aria-describedby={fieldErrors.phone ? 'phone-error' : undefined} />{renderFieldError('phone')}</label>
            <label className="space-y-1.5 text-sm font-semibold text-slate-700">Landline <span className="font-normal text-slate-500">(optional)</span><input name="landline" value={formData.landline} onChange={handleChange} className={fieldClass('landline')} autoComplete="tel" aria-invalid={Boolean(fieldErrors.landline)} />{renderFieldError('landline')}</label>
          </div>
          <div className="grid gap-3 sm:grid-cols-1">
            <label className="space-y-1.5 text-sm font-semibold text-slate-700">Company name <span className="font-normal text-slate-500">(optional)</span><input name="company_name" value={formData.company_name} onChange={handleChange} className={fieldClass('company_name')} placeholder="Used on quotations when provided" autoComplete="organization" aria-invalid={Boolean(fieldErrors.company_name)} />{renderFieldError('company_name')}</label>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
            <p className="mb-3 text-xs leading-5 text-slate-500">
              Optional account address. Select a CALABARZON province first, followed by its city or municipality and barangay.
            </p>
            <div className="grid gap-3">
              <label className="space-y-1.5 text-sm font-semibold text-slate-700">
                Province
                <select
                  name="province"
                  value={addressParts.provinceCode}
                  onChange={handleProvinceChange}
                  className={inputClass}
                  autoComplete="address-level1"
                >
                  <option value="">Select province</option>
                  {CALABARZON_PROVINCES.map((province) => (
                    <option key={province.code} value={province.code}>{province.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700">
                City / Municipality
                <select
                  name="city"
                  value={addressParts.city}
                  onChange={handleCityChange}
                  disabled={!addressParts.provinceCode || cityLoadState === 'loading' || cityLoadState === 'error'}
                  className={`${inputClass} disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400`}
                  autoComplete="address-level2"
                >
                  <option value="">
                    {cityLoadState === 'loading' ? 'Loading locations...' : 'Select city / municipality'}
                  </option>
                  {citiesMunicipalities.map((place) => (
                    <option key={place.code} value={place.code}>{place.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700">
                Barangay
                <select
                  name="barangay"
                  value={addressParts.barangay}
                  onChange={(event) => setAddressParts((previous) => ({ ...previous, barangay: event.target.value }))}
                  disabled={!addressParts.city || barangayLoadState === 'loading' || barangayLoadState === 'error'}
                  className={`${inputClass} disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400`}
                  autoComplete="address-line2"
                >
                  <option value="">
                    {barangayLoadState === 'loading' ? 'Loading barangays...' : 'Select barangay'}
                  </option>
                  {barangays.map((barangay) => (
                    <option key={barangay.code} value={barangay.name}>{barangay.name}</option>
                  ))}
                </select>
              </label>
            </div>
            {cityLoadState === 'error' && (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status">
                <span>Could not load cities and municipalities. Your account can still be created without an address.</span>
                <button type="button" className="shrink-0 font-bold underline" onClick={() => setCityLoadAttempt((value) => value + 1)}>Retry</button>
              </div>
            )}
            {barangayLoadState === 'error' && (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status">
                <span>Could not load barangays. Your account can still be created without a barangay.</span>
                <button type="button" className="shrink-0 font-bold underline" onClick={() => setBarangayLoadAttempt((value) => value + 1)}>Retry</button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <SectionLabel>Security</SectionLabel>
          <label className="block space-y-1.5 text-sm font-semibold text-slate-700">
            Password <span aria-hidden="true">*</span>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={formData.password}
                onChange={handleChange}
                className={fieldClass('password', 'pr-12')}
                placeholder="Create a password"
                autoComplete="new-password"
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby="password-guidance password-error"
                minLength={8}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute inset-y-0 right-0 px-4 text-slate-400 transition hover:text-brand-700"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>
            {renderFieldError('password')}
          </label>

          <div id="password-guidance" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
            Use at least 8 characters. Avoid common passwords, personal information, and passwords containing only numbers.
          </div>

          <label className="block space-y-1.5 text-sm font-semibold text-slate-700">
            Confirm password <span aria-hidden="true">*</span>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                name="password_confirm"
                value={formData.password_confirm}
                onChange={handleChange}
                className={fieldClass('password_confirm', 'pr-12')}
                placeholder="Repeat your password"
                autoComplete="new-password"
                aria-invalid={Boolean(fieldErrors.password_confirm)}
                aria-describedby={fieldErrors.password_confirm ? 'password_confirm-error' : undefined}
                minLength={8}
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirm((current) => !current)}
                className="absolute inset-y-0 right-0 px-4 text-slate-400 transition hover:text-brand-700"
                aria-label={showConfirm ? 'Hide password confirmation' : 'Show password confirmation'}
              >
                {showConfirm ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>
            {renderFieldError('password_confirm')}
          </label>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-700 via-brand-600 to-brand-500 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-brand-900/20 transition hover:from-brand-800 hover:to-brand-600 focus:outline-none focus:ring-2 focus:ring-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Creating account...' : <>Create Account <FiArrowRight size={17} /></>}
        </button>
      </form>
      )}

      {!successMessage && (
        <p className="mt-7 text-center text-sm text-slate-600">
          Already have an account?{' '}
          <Link to="/login" className="font-bold text-brand-700 hover:text-brand-900">
            Sign in
          </Link>
        </p>
      )}
    </AuthShell>
  );
}
