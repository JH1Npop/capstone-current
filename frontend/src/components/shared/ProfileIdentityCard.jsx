import { FiCalendar, FiCheckCircle, FiEdit2, FiHash, FiShield } from 'react-icons/fi';
import { formatRoleId } from '../../utils/roleIds';

const titleCase = (value, fallback) => {
  const normalized = String(value || '').replace(/_/g, ' ').trim();
  return normalized ? normalized.replace(/\b\w/g, (character) => character.toUpperCase()) : fallback;
};

const formatMemberSince = (value) => {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
};

export default function ProfileIdentityCard({
  user,
  displayName,
  username,
  profileImage,
  editing,
  onEdit,
  children,
}) {
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'U';

  const facts = [
    { icon: FiHash, label: 'Account ID', value: formatRoleId(user?.role, user?.id) },
    { icon: FiShield, label: 'Account status', value: titleCase(user?.status, user?.is_active === false ? 'Inactive' : 'Active') },
    { icon: FiCheckCircle, label: 'Email status', value: user?.pending_email ? 'Verification pending' : user?.email_verified ? 'Verified' : 'Not verified' },
    { icon: FiCalendar, label: 'Member since', value: formatMemberSince(user?.created_at) },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="h-20 bg-brand-700" aria-hidden="true" />
      <div className="px-5 pb-5 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="-mt-10 h-24 w-24 shrink-0 rounded-full bg-white p-1 shadow-md">
            {profileImage ? (
              <img src={profileImage} alt={displayName} className="h-full w-full rounded-full object-cover" />
            ) : (
              <div className="grid h-full w-full place-items-center rounded-full bg-brand-50 text-2xl font-bold text-brand-700">
                {initials}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 sm:pt-3">
            <h2 className="truncate text-2xl font-bold text-slate-900">{displayName}</h2>
            <p className="mt-0.5 text-sm text-slate-500">@{username}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">{children}</div>
          </div>
          {!editing ? (
            <button type="button" onClick={onEdit} className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600 sm:mt-3">
              <FiEdit2 size={16} />
              Edit Profile
            </button>
          ) : null}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-px border-t border-slate-200 bg-slate-200 sm:grid-cols-4">
        {facts.map(({ icon: Icon, label, value }) => (
          <div key={label} className="min-w-0 bg-slate-50 px-4 py-3">
            <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <Icon size={13} /> {label}
            </dt>
            <dd className="mt-1 truncate text-sm font-semibold text-slate-900" title={String(value)}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function ProfileField({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 transition hover:border-slate-300 hover:bg-white">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Icon /> {label}
      </p>
      <p className="mt-2 break-words text-base font-semibold text-slate-900">{value}</p>
    </div>
  );
}
