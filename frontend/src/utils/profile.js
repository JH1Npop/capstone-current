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
