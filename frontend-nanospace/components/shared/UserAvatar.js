import React, { useState, useEffect } from 'react';

export const FALLBACK_AVATAR_DATA_URI =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%23e0e7ff"/><stop offset="100%" stop-color="%23cbd5e1"/></linearGradient><linearGradient id="b" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%2364748b"/><stop offset="100%" stop-color="%23475569"/></linearGradient></defs><rect width="128" height="128" rx="64" fill="url(%23g)"/><circle cx="64" cy="46" r="22" fill="url(%23b)"/><path d="M22 108 C 22 84, 40 68, 64 68 C 88 68, 106 84, 106 108 Z" fill="url(%23b)"/></svg>';

export default function UserAvatar({
  user,
  src,
  name,
  size = 36,
  className = '',
  style = {},
  alt = 'Profile picture',
}) {
  const activeSrc = src !== undefined ? src : (user?.avatar || user?.avatarUrl || null);
  const displayName = name || user?.name || user?.full_name || 'User';
  const [hasError, setHasError] = useState(false);

  // Reset error when src changes (e.g. user selects a new image)
  useEffect(() => {
    setHasError(false);
  }, [activeSrc]);

  const baseStyle = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
    borderRadius: '50%',
    objectFit: 'cover',
    display: 'inline-block',
    verticalAlign: 'middle',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    border: '1.5px solid rgba(226, 232, 240, 0.9)',
    ...style,
  };

  if (activeSrc && !hasError) {
    return (
      <img
        src={activeSrc}
        alt={alt || displayName}
        className={`ns-user-avatar ${className}`}
        style={baseStyle}
        onError={() => setHasError(true)}
      />
    );
  }

  // Drawback picture (default avatar)
  return (
    <img
      src="/default-avatar.svg"
      alt={alt || `${displayName} (default profile picture)`}
      className={`ns-user-avatar ns-user-avatar-drawback ${className}`}
      style={baseStyle}
      onError={(e) => {
        // Fallback to embedded data URI if static file path is not reachable
        e.currentTarget.onerror = null;
        e.currentTarget.src = FALLBACK_AVATAR_DATA_URI;
      }}
    />
  );
}
