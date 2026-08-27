import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowRight, FiEye, FiEyeOff, FiMail } from 'react-icons/fi';
import AuthShell from '../components/AuthShell';
import { useAuth } from '../context/AuthContext';

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-200';

const SectionLabel = ({ children }) => (
  <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-800">{children}</p>
);

export default function Register() {
  const { register } = useAuth();

  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [loading, setLoading] = useState(false);
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
    barangay: '',
    city: '',
    province: '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddressChange = (e) => {
    const { name, value } = e.target;
    setAddressParts((prev) => ({ ...prev, [name]: value }));
  };

  const buildAddress = () =>
    [
      addressParts.barangay.trim(),
      addressParts.city.trim(),
      addressParts.province.trim(),
    ].filter(Boolean).join(', ');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setLoading(true);

    if (!formData.username || !formData.email || !formData.password) {
      setError('Username, email, and password are required');
      setLoading(false);
      return;
    }

    if (formData.password !== formData.password_confirm) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    try {
      const result = await register({
        ...formData,
        address: buildAddress(),
        role: 'client',
      });
      setLoading(false);

      if (!result || !result.success) {
        setError(result?.message || 'Registration failed.');
        return;
      }

      setRegisteredEmail(formData.email);
      setSuccessMessage(result.message || 'Account created. Please check your email to verify your account before signing in.');
    } catch (err) {
      setLoading(false);
      setError('Something went wrong.');
    }
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
            <h2 className="mt-4 text-xl font-bold text-slate-950">Check your Gmail</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              We sent a verification link to{' '}
              <span className="font-semibold text-slate-900">{registeredEmail}</span>.
              Open that email and verify your account before signing in.
            </p>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            {successMessage}
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
            <input name="username" value={formData.username} onChange={handleChange} className={inputClass} placeholder="Username *" autoComplete="username" required />
            <input type="email" name="email" value={formData.email} onChange={handleChange} className={inputClass} placeholder="Email *" autoComplete="email" required />
          </div>
        </div>

        <div className="space-y-3">
          <SectionLabel>Client details</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-3">
            <input name="first_name" value={formData.first_name} onChange={handleChange} className={inputClass} placeholder="First name" autoComplete="given-name" />
            <input name="middle_name" value={formData.middle_name} onChange={handleChange} className={inputClass} placeholder="Middle name (Optional)" autoComplete="additional-name" />
            <input name="last_name" value={formData.last_name} onChange={handleChange} className={inputClass} placeholder="Last name" autoComplete="family-name" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <input name="phone" value={formData.phone} onChange={handleChange} className={inputClass} placeholder="Phone, e.g. 09123456789" autoComplete="tel" />
            <input name="landline" value={formData.landline} onChange={handleChange} className={inputClass} placeholder="Landline (Optional)" autoComplete="tel" />
          </div>
          <div className="grid gap-3 sm:grid-cols-1">
            <input name="company_name" value={formData.company_name} onChange={handleChange} className={inputClass} placeholder="Company Name (Optional - e.g. for Quotations)" autoComplete="organization" />
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                name="barangay"
                value={addressParts.barangay}
                onChange={handleAddressChange}
                className={inputClass}
                placeholder="Barangay"
                autoComplete="address-line2"
              />
              <input
                name="city"
                value={addressParts.city}
                onChange={handleAddressChange}
                className={inputClass}
                placeholder="City / Municipality"
                autoComplete="address-level2"
              />
              <input
                name="province"
                value={addressParts.province}
                onChange={handleAddressChange}
                className={inputClass}
                placeholder="Province"
                autoComplete="address-level1"
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <SectionLabel>Security</SectionLabel>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              name="password"
              value={formData.password}
              onChange={handleChange}
              className={`${inputClass} pr-12`}
              placeholder="Password *"
              autoComplete="new-password"
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

          <div className="relative">
            <input
              type={showConfirm ? 'text' : 'password'}
              name="password_confirm"
              value={formData.password_confirm}
              onChange={handleChange}
              className={`${inputClass} pr-12`}
              placeholder="Confirm password *"
              autoComplete="new-password"
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
