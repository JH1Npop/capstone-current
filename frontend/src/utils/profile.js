export const PROFILE_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

const acceptedImageTypes = new Set(PROFILE_IMAGE_ACCEPT.split(','));

export const validateProfileImageFile = (file) => {
  if (!acceptedImageTypes.has(file.type)) {
    return 'Choose a JPEG, PNG, WebP, or GIF image.';
  }
  if (file.size > 2 * 1024 * 1024) {
    return 'Profile photos must be 2 MB or smaller.';
  }
  return '';
};

export const releaseObjectPreview = (previewUrl) => {
  if (String(previewUrl || '').startsWith('blob:')) {
    URL.revokeObjectURL(previewUrl);
  }
};

/**
 * Splits a profile save response into the user to keep and the message to show. When the new
 * email's verification could not be sent, the server saves the other changes, keeps the old email
 * and says so in `email_change_error`.
 */
export const profileSaveOutcome = (response, emailChanged) => {
  const { email_change_error: emailChangeError, ...savedUser } = response || {};
  if (emailChanged && emailChangeError) {
    return { savedUser, message: { type: 'error', text: `Your other changes were saved. ${emailChangeError}` } };
  }
  return {
    savedUser,
    message: {
      type: 'success',
      text: emailChanged && savedUser.pending_email
        ? `Profile saved. Verify ${savedUser.pending_email} before it replaces your current email.`
        : 'Profile updated successfully.',
    },
  };
};
