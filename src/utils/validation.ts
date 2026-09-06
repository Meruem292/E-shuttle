/**
 * Strict Email & Input Validation Utilities
 */

// Strict RFC 5322-compliant email regex:
// - Local part: alphanumeric plus selected symbols (. _ % + -), cannot start/end with dot, no consecutive dots
// - Domain part: alphanumeric and hyphens, followed by dot and valid top-level domain
// - TLD: minimum 2 alphabetical characters (e.g. .com, .ph, .org, .edu, .net, .io)
export const STRICT_EMAIL_REGEX =
  /^[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]*[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

/**
 * Validates whether an email string adheres strictly to standard email format.
 * Rejects missing domain, missing extension, trailing dots, spaces, or single-character TLDs.
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length < 5 || trimmed.length > 254) return false;
  if (trimmed.includes(' ') || trimmed.includes('..')) return false;

  return STRICT_EMAIL_REGEX.test(trimmed);
}

/**
 * Returns a helpful, human-readable validation error for real-time typing feedback,
 * or null if the email format is strictly valid.
 */
export function getEmailValidationError(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) {
    return 'Email address is required.';
  }

  if (trimmed.includes(' ')) {
    return 'Email address cannot contain spaces.';
  }

  if (!trimmed.includes('@')) {
    return 'Email must include an "@" symbol.';
  }

  const atParts = trimmed.split('@');
  if (atParts.length > 2) {
    return 'Email can only contain one "@" symbol.';
  }

  const [localPart, domainPart] = atParts;

  if (!localPart) {
    return 'Please enter the username before the "@" symbol.';
  }

  if (localPart.startsWith('.') || localPart.endsWith('.')) {
    return 'Email username cannot start or end with a period.';
  }

  if (localPart.includes('..')) {
    return 'Email cannot contain consecutive periods.';
  }

  if (!domainPart) {
    return 'Please enter the domain after the "@" (e.g., gmail.com).';
  }

  if (!domainPart.includes('.')) {
    return 'Domain must include an extension (e.g., .com, .org, .ph).';
  }

  const domainSegments = domainPart.split('.');
  const tld = domainSegments[domainSegments.length - 1];

  if (!tld) {
    return 'Please complete the domain extension (e.g., .com, .ph).';
  }

  if (tld.length < 2) {
    return 'Domain extension must be at least 2 letters (e.g., .com, .ph).';
  }

  if (!/^[a-zA-Z]+$/.test(tld)) {
    return 'Domain extension must contain only letters.';
  }

  for (const seg of domainSegments) {
    if (!seg) return 'Domain segments cannot be empty.';
    if (seg.startsWith('-') || seg.endsWith('-')) {
      return 'Domain segments cannot start or end with a hyphen.';
    }
  }

  if (!STRICT_EMAIL_REGEX.test(trimmed)) {
    return 'Please enter a valid email format (e.g., name@example.com).';
  }

  return null;
}
