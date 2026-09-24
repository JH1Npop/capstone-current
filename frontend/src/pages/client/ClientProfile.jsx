import { useEffect, useState } from 'react';
import {
  FiCamera,
  FiBriefcase,
  FiMail,
  FiMapPin,
  FiPhone,
  FiSave,
  FiUser,
  FiX,
} from 'react-icons/fi';
import { updateUserProfile } from '../../api/client';
import Layout from '../../components/layout/Layout';
import ProfileIdentityCard, { ProfileField } from '../../components/shared/ProfileIdentityCard';
import ProfileSecuritySection from '../../components/shared/ProfileSecuritySection';
import { useAuth } from '../../context/AuthContext';
import { PROFILE_IMAGE_ACCEPT, releaseObjectPreview, validateProfileImageFile } from '../../utils/profile';

const emptyProfile = {
  first_name: '',
  middle_name: '',
  last_name: '',
  email: '',
  phone: '',
  landline: '',
  company_name: '',
  address: '',
};

const profileFromUser = (user) => ({
  first_name: user?.first_name || '',
  middle_name: user?.middle_name || '',
  last_name: user?.last_name || '',
  email: user?.email || '',
  phone: user?.phone || '',
  landline: user?.landline || '',
  company_name: user?.client_profile?.company_name || '',
  address: user?.address || '',
});

export default function ClientProfile() {
  const { user, updateCurrentUser } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [profileData, setProfileData] = useState(emptyProfile);
  const [profileImageFile, setProfileImageFile] = useState(null);
  const [profileImagePreview, setProfileImagePreview] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    if (!user) return;
    setProfileData(profileFromUser(user));
    setProfileImagePreview(user.profile_image_url || '');
  }, [user]);

  const displayName = `${profileData.first_name} ${profileData.middle_name} ${profileData.last_name}`.replace(/\s+/g, ' ').trim() || user?.username || 'Client';

  const handleProfileChange = (event) => {
    const { name, value } = event.target;
    setProfileData((current) => ({ ...current, [name]: value }));
  };

  const handleProfileImageChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const validationError = validateProfileImageFile(file);
    if (validationError) {
      event.target.value = '';
      setMessage({ type: 'error', text: validationError });
      return;
    }
    releaseObjectPreview(profileImagePreview);
    setProfileImageFile(file);
    setProfileImagePreview(URL.createObjectURL(file));
    setMessage({ type: '', text: '' });
  };

  const cancelProfileEdit = () => {
    releaseObjectPreview(profileImagePreview);
    setProfileData(profileFromUser(user));
    setProfileImageFile(null);
    setProfileImagePreview(user?.profile_image_url || '');
    setMessage({ type: '', text: '' });
    setIsEditing(false);
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const emailChanged = profileData.email.trim().toLowerCase() !== String(user?.email || '').trim().toLowerCase();
      const updatedProfile = await updateUserProfile({
        ...profileData,
        ...(profileImageFile ? { profile_image: profileImageFile } : {}),
      });
      releaseObjectPreview(profileImagePreview);
      updateCurrentUser(updatedProfile);
      setProfileImageFile(null);
      setIsEditing(false);
      setMessage({
        type: 'success',
        text: emailChanged && updatedProfile.pending_email
          ? `Profile saved. Verify ${updatedProfile.pending_email} before it replaces your current email.`
          : 'Profile updated successfully.',
      });
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Unable to update profile.' });
    } finally {
      setLoading(false);
    }
  };

  const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100';

  return (
    <Layout>
      <div className="py-2">
        <div className="mx-auto max-w-5xl">
          {message.text ? (
            <div role="status" aria-live="polite" className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
              message.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-rose-200 bg-rose-50 text-rose-700'
            }`}>
              {message.text}
            </div>
          ) : null}
          {user?.pending_email ? (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p className="font-semibold">Email verification pending</p>
              <p className="mt-1">Check {user.pending_email}. Your sign-in email remains {user.email} until verification is complete.</p>
            </div>
          ) : null}

          <section className="mb-6 space-y-4">
            <ProfileIdentityCard user={user} displayName={displayName} username={user?.username} profileImage={profileImagePreview} editing={isEditing} onEdit={() => setIsEditing(true)}>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
                <FiUser size={14} /> Client Account
              </span>
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
                Service customer
              </span>
            </ProfileIdentityCard>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Contact Information</h3>
                <p className="mt-1 text-sm text-slate-500">Contact and company details used for service documents.</p>
              </div>

            {isEditing ? (
              <form onSubmit={saveProfile} className="mt-6 space-y-4">
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
                  <FiCamera size={18} />
                  <span>{profileImageFile ? profileImageFile.name : 'Choose a new profile photo'}</span>
                  <input type="file" accept={PROFILE_IMAGE_ACCEPT} onChange={handleProfileImageChange} className="hidden" />
                </label>
                <div className="flex flex-col gap-2 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                  <span>JPEG, PNG, WebP, or GIF. Maximum 2 MB.</span>
                  {profileImageFile ? (
                    <button type="button" onClick={() => { releaseObjectPreview(profileImagePreview); setProfileImageFile(null); setProfileImagePreview(user?.profile_image_url || ''); }} className="font-semibold text-slate-700 hover:text-slate-900">
                      Clear selected photo
                    </button>
                  ) : null}
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="block text-sm font-medium text-slate-700">
                    First Name
                    <input name="first_name" value={profileData.first_name} onChange={handleProfileChange} autoComplete="given-name" className={`${inputClass} mt-1`} />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Middle Name (Optional)
                    <input name="middle_name" value={profileData.middle_name} onChange={handleProfileChange} autoComplete="additional-name" className={`${inputClass} mt-1`} />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Last Name
                    <input name="last_name" value={profileData.last_name} onChange={handleProfileChange} autoComplete="family-name" className={`${inputClass} mt-1`} />
                  </label>
                </div>
                <label className="block text-sm font-medium text-slate-700">
                  Email Address
                  <input type="email" name="email" value={profileData.email} onChange={handleProfileChange} autoComplete="email" className={`${inputClass} mt-1`} />
                  <span className="mt-1 block text-xs font-normal text-slate-500">A new address must be verified before it replaces your current email.</span>
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-slate-700">
                    Phone Number
                    <input type="tel" name="phone" value={profileData.phone} onChange={handleProfileChange} autoComplete="tel" placeholder="09123456789" className={`${inputClass} mt-1`} />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Landline (Optional)
                    <input type="tel" name="landline" value={profileData.landline} onChange={handleProfileChange} autoComplete="tel" className={`${inputClass} mt-1`} />
                  </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-slate-700">
                    Company Name (Optional)
                    <input name="company_name" value={profileData.company_name} onChange={handleProfileChange} autoComplete="organization" className={`${inputClass} mt-1`} />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Address
                    <input name="address" value={profileData.address} onChange={handleProfileChange} autoComplete="street-address" className={`${inputClass} mt-1`} />
                  </label>
                </div>
                <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                  <button type="submit" disabled={loading} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60">
                    <FiSave size={16} />
                    Save Changes
                  </button>
                  <button type="button" onClick={cancelProfileEdit} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-300">
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
                <ProfileField icon={FiPhone} label="Landline" value={profileData.landline || 'Not provided'} />
                <ProfileField icon={FiBriefcase} label="Company" value={profileData.company_name || 'Not provided'} />
                <ProfileField icon={FiMapPin} label="Address" value={profileData.address || 'Not provided'} />
              </div>
            )}
            </div>
          </section>

          <ProfileSecuritySection onMessage={setMessage} />
        </div>
      </div>
    </Layout>
  );
}
