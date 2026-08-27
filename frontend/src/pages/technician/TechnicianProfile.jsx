import { useEffect, useState } from 'react';
import {
  FiCamera,
  FiEdit2,
  FiLock,
  FiMapPin,
  FiMail,
  FiPhone,
  FiSave,
  FiShield,
  FiUser,
  FiX,
} from 'react-icons/fi';
import { fetchTechnicianProfile } from '../../api/api';
import { changePassword, updateUserProfile } from '../../api/client';
import Layout from '../../components/layout/Layout';
import { useAuth } from '../../context/AuthContext';

const emptyProfile = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  address: '',
};

const emptyPassword = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100';

const formatSkillLevel = (value) => {
  const normalized = String(value || '').replace(/_/g, ' ').trim();
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : 'Not rated';
};

const getSkillName = (skill) => {
  if (typeof skill === 'string') return skill;
  return skill?.service_type_name || skill?.serviceTypeName || skill?.name || skill?.service_type || 'Unnamed service skill';
};

const skillLevelClass = (level) => {
  switch (String(level || '').toLowerCase()) {
    case 'expert':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'intermediate':
      return 'border-sky-200 bg-sky-50 text-sky-700';
    case 'beginner':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-600';
  }
};

export default function TechnicianProfile() {
  const { user, logout } = useAuth();
  const techName = user?.username || 'Technician';
  const [profileData, setProfileData] = useState(emptyProfile);
  const [profileImageFile, setProfileImageFile] = useState(null);
  const [profileImagePreview, setProfileImagePreview] = useState('');
  const [technicianProfile, setTechnicianProfile] = useState({
    skills: [],
    totalCompleted: 0,
    completedLast30Days: 0,
    avgCompletionTime: '',
    rating: 0,
    ratingLast30Days: 0,
    status: '',
  });
  const [passwordData, setPasswordData] = useState(emptyPassword);
  const [editing, setEditing] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => {
    if (!user) return;
    setProfileData({
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      email: user.email || '',
      phone: user.phone || '',
      address: user.address || '',
    });
    setProfileImagePreview(user.profile_image_url || '');
  }, [user]);

  useEffect(() => {
    let isMounted = true;

    fetchTechnicianProfile(techName)
      .then((data) => {
        if (!isMounted) return;
        setTechnicianProfile(data || {});
        setProfileData((current) => ({
          ...current,
          email: current.email || data?.email || '',
          phone: current.phone || data?.phone || '',
        }));
      })
      .catch(() => {
        if (isMounted) {
          setMessage({ type: 'error', text: 'Unable to load technician profile details.' });
        }
      });

    return () => { isMounted = false; };
  }, [techName]);

  const displayName = `${profileData.first_name} ${profileData.last_name}`.trim() || techName;
  const skills = Array.isArray(technicianProfile.skills) ? technicianProfile.skills : [];
  const completedLast30Days = technicianProfile.completedLast30Days ?? technicianProfile.totalCompleted ?? 0;
  const rating = Number(technicianProfile.rating || 0);
  const skillCounts = skills.reduce((counts, skill) => {
    const level = String(skill?.skill_level || 'unrated').toLowerCase();
    counts[level] = (counts[level] || 0) + 1;
    return counts;
  }, {});

  const handleProfileChange = (event) => {
    const { name, value } = event.target;
    setProfileData((current) => ({ ...current, [name]: value }));
  };

  const handlePasswordChange = (event) => {
    const { name, value } = event.target;
    setPasswordData((current) => ({ ...current, [name]: value }));
  };

  const handleProfileImageChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setProfileImageFile(file);
    setProfileImagePreview(URL.createObjectURL(file));
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const updatedProfile = await updateUserProfile({
        ...profileData,
        ...(profileImageFile ? { profile_image: profileImageFile } : {}),
      });
      const updatedUser = { ...user, ...updatedProfile };
      sessionStorage.setItem('afn_user', JSON.stringify(updatedUser));
      setProfileImageFile(null);
      setEditing(false);
      setMessage({ type: 'success', text: 'Profile updated successfully.' });
      window.setTimeout(() => window.location.reload(), 800);
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Unable to update profile.' });
    } finally {
      setLoading(false);
    }
  };

  const changeTechnicianPassword = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match.' });
      setLoading(false);
      return;
    }

    try {
      await changePassword(passwordData);
      setPasswordData(emptyPassword);
      setShowPasswordForm(false);
      setMessage({ type: 'success', text: 'Password changed successfully.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Unable to change password.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <main className="min-h-screen bg-slate-50 p-4 sm:p-6">
        <div className="mx-auto max-w-3xl">
          {message.text ? (
            <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
              message.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-rose-200 bg-rose-50 text-rose-700'
            }`}>
              {message.text}
            </div>
          ) : null}

          <section className="mb-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-center">
              <div className="relative h-20 w-20 shrink-0">
                {profileImagePreview ? (
                  <img src={profileImagePreview} alt={displayName} className="h-20 w-20 rounded-full object-cover ring-2 ring-brand-100" />
                ) : (
                  <div className="grid h-20 w-20 place-items-center rounded-full bg-brand-50 text-2xl font-bold text-brand-700">
                    {displayName.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-2xl font-bold text-slate-900">{displayName}</h2>
                <p className="mt-1 text-sm text-slate-500">@{techName}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
                    <FiShield size={14} /> Field Technician
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-brand-700">
                    Status: {technicianProfile.status || 'Active'}
                  </span>
                </div>
              </div>
              {!editing ? (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
                >
                  <FiEdit2 size={16} />
                  Edit Profile
                </button>
              ) : null}
            </div>

            {editing ? (
              <form onSubmit={saveProfile} className="mt-6 space-y-4">
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
                  <FiCamera size={18} />
                  <span>{profileImageFile ? profileImageFile.name : 'Change profile photo'}</span>
                  <input type="file" accept="image/*" onChange={handleProfileImageChange} className="hidden" />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-slate-700">
                    First Name
                    <input name="first_name" value={profileData.first_name} onChange={handleProfileChange} className={`${inputClass} mt-1`} />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Last Name
                    <input name="last_name" value={profileData.last_name} onChange={handleProfileChange} className={`${inputClass} mt-1`} />
                  </label>
                </div>
                <label className="block text-sm font-medium text-slate-700">
                  Email Address
                  <input type="email" name="email" value={profileData.email} onChange={handleProfileChange} className={`${inputClass} mt-1`} />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-slate-700">
                    Phone Number
                    <input name="phone" value={profileData.phone} onChange={handleProfileChange} placeholder="09123456789" className={`${inputClass} mt-1`} />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Address
                    <input name="address" value={profileData.address} onChange={handleProfileChange} className={`${inputClass} mt-1`} />
                  </label>
                </div>
                <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                  <button type="submit" disabled={loading} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60">
                    <FiSave size={16} />
                    Save Changes
                  </button>
                  <button type="button" onClick={() => setEditing(false)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-300">
                    <FiX size={16} />
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <ProfileField icon={FiUser} label="Name" value={displayName} />
                <ProfileField icon={FiMail} label="Email" value={profileData.email || 'Not provided'} />
                <ProfileField icon={FiPhone} label="Phone" value={profileData.phone || 'Not provided'} />
                <ProfileField icon={FiMapPin} label="Address" value={profileData.address || 'Not provided'} />
              </div>
            )}
          </section>

          <section className="mb-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Performance</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Metric label="Total Jobs" value={technicianProfile.totalCompleted || 0} />
              <Metric label="Last 30 Days" value={completedLast30Days || 0} />
              <Metric label="Avg Time" value={technicianProfile.avgCompletionTime || 'N/A'} />
              <Metric label="Rating" value={rating ? `${rating.toFixed(1)} / 5` : 'Not rated'} />
            </div>
          </section>

          <section className="mb-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Service Skills</h3>
              </div>
              <p className="text-sm font-semibold text-slate-600">Total: {skills.length}</p>
            </div>

            {skills.length ? (
              <>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {['expert', 'intermediate', 'beginner'].map((level) => (
                    <Metric key={level} label={formatSkillLevel(level)} value={skillCounts[level] || 0} />
                  ))}
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {skills.map((skill, index) => (
                    <div key={skill.id || index} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-900">{getSkillName(skill)}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${skillLevelClass(skill?.skill_level)}`}>
                          {formatSkillLevel(skill?.skill_level)}
                        </span>
                        {skill?.service_type ? (
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
                            Service #{skill.service_type}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                No service skills assigned yet. Ask an admin or superadmin to assign technician skills in User Management.
              </p>
            )}
          </section>

          <section className="mb-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <FiLock size={20} />
              Security
            </h3>
            {showPasswordForm ? (
              <form onSubmit={changeTechnicianPassword} className="mt-4 space-y-4">
                <input type="password" name="currentPassword" value={passwordData.currentPassword} onChange={handlePasswordChange} placeholder="Current password" className={inputClass} required />
                <input type="password" name="newPassword" value={passwordData.newPassword} onChange={handlePasswordChange} placeholder="New password" className={inputClass} required />
                <input type="password" name="confirmPassword" value={passwordData.confirmPassword} onChange={handlePasswordChange} placeholder="Confirm new password" className={inputClass} required />
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button type="submit" disabled={loading} className="flex-1 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60">Change Password</button>
                  <button type="button" onClick={() => { setShowPasswordForm(false); setPasswordData(emptyPassword); }} className="flex-1 rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-300">Cancel</button>
                </div>
              </form>
            ) : (
              <button type="button" onClick={() => setShowPasswordForm(true)} className="mt-4 w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                Change Password
              </button>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            {showLogoutConfirm ? (
              <div className="flex items-center gap-3">
                <button type="button" onClick={logout} className="flex-1 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700">
                  Yes, Sign Out
                </button>
                <button type="button" onClick={() => setShowLogoutConfirm(false)} className="flex-1 rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-300">
                  Cancel
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setShowLogoutConfirm(true)} className="w-full rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700">
                Sign Out
              </button>
            )}
          </section>
        </div>
      </main>
    </Layout>
  );
}

function ProfileField({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg bg-slate-50 p-4">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
        <Icon /> {label}
      </p>
      <p className="mt-2 break-words text-base font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
    </div>
  );
}
