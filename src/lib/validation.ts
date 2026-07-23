/** Basic email check — local@domain with a dot in the domain. */
export function isValidEmail(raw: string): boolean {
  const email = raw.trim();
  // Practical, not RFC-perfect — enough for the initial release.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Normalize a phone number to digits with an optional leading +.
 * Accepts spaces, dashes, parentheses; keeps a single leading +.
 */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  // 7–15 digits is the common E.164 range (without country code max 15).
  if (digits.length < 7 || digits.length > 15) return null;
  return hasPlus ? `+${digits}` : digits;
}

export function isValidName(raw: string): boolean {
  const name = raw.trim();
  return name.length >= 2 && name.length <= 80;
}
