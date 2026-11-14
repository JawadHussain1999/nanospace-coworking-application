const passwordEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

export function isPasswordWithinLimit(password) {
  return passwordEncoder
    ? passwordEncoder.encode(password).length <= 72
    : password.length <= 72;
}

export default function PasswordStrengthHint({ password }) {
  const characterTypes = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^a-zA-Z0-9]/.test(password),
  ].filter(Boolean).length;
  const strength = password.length >= 16 || (password.length >= 12 && characterTypes >= 3)
    ? 'strong'
    : password.length >= 8 && characterTypes >= 2
      ? 'fair'
      : 'weak';
  const message = !password
    ? 'Choose any password. A longer, unique passphrase is harder to guess.'
    : !isPasswordWithinLimit(password)
      ? 'Passwords can be up to 72 UTF-8 bytes.'
      : strength === 'strong'
        ? 'Strong — use this password only for your NanoSpace account.'
        : strength === 'fair'
          ? 'Fair — adding more length or another character type can make it stronger.'
          : 'Weak — try a longer, unique password with a mix of letters, numbers, or symbols.';

  return (
    <div className={`password-strength-hint ${password && isPasswordWithinLimit(password) ? `is-${strength}` : ''}`} aria-live="polite">
      {password && isPasswordWithinLimit(password) && (
        <span className="password-strength-label">Password strength: {strength}</span>
      )}
      <span>{message}</span>
    </div>
  );
}
