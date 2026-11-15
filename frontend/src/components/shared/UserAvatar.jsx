import { useEffect, useState } from 'react';

export const getInitials = (name, fallback = '?') =>
  String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || fallback;

/**
 * A person's profile photo, or their initials when there is no photo or it cannot load.
 * Decorative: the name is always shown next to it, so the image has empty alt text.
 * `className` sets size, shape and the initials' colours.
 */
export default function UserAvatar({ name, imageUrl, className = '', fallback = '?' }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [imageUrl]);
  const showImage = Boolean(imageUrl) && !failed;

  return (
    <span aria-hidden="true" className={`grid flex-none place-items-center overflow-hidden ${className}`}>
      {showImage ? (
        <img src={imageUrl} alt="" loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : getInitials(name, fallback)}
    </span>
  );
}
