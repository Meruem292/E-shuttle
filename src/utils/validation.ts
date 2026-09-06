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

/**
 * Validates Philippine and international phone numbers.
 * Strictly forbids alphabet characters.
 */
export const PHONE_REGEX = /^(?:\+63|0)?[9]\d{9}$/;

export function isValidPhoneNumber(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false;
  const trimmed = phone.trim();

  // Strictly disallow any letters/alphabets
  if (/[a-zA-Z]/.test(trimmed)) return false;

  // Extract raw digits
  const digits = trimmed.replace(/\D/g, '');

  // PH standard mobile: 11 digits starting with 09, or 12 digits starting with 639, or 10 digits starting with 9
  if (digits.length === 11 && digits.startsWith('09')) return true;
  if (digits.length === 12 && digits.startsWith('639')) return true;
  if (digits.length === 10 && digits.startsWith('9')) return true;

  // General valid international/local range (10 to 13 digits, no alphabets)
  if (digits.length >= 10 && digits.length <= 13) return true;

  return false;
}

/**
 * Returns human-readable error for phone number typing feedback.
 */
export function getPhoneValidationError(phone: string): string | null {
  const trimmed = phone.trim();
  if (!trimmed) {
    return 'Mobile phone number is required.';
  }

  if (/[a-zA-Z]/.test(trimmed)) {
    return 'Phone number cannot contain letters or alphabet characters. Numbers only.';
  }

  // Check for disallowed symbols (only +, -, space, brackets, and numbers allowed)
  if (/[^0-9+\s\-()]/.test(trimmed)) {
    return 'Phone number contains invalid symbols. Only numbers, spaces, and "+" are permitted.';
  }

  const digits = trimmed.replace(/\D/g, '');

  if (digits.length < 10) {
    return `Phone number is too short (${digits.length}/11 digits). e.g., 0917 123 4567`;
  }

  if (digits.length > 13) {
    return 'Phone number exceeds maximum length (11-12 digits).';
  }

  // Check if starts with Philippine format
  if (trimmed.startsWith('0') && !trimmed.startsWith('09')) {
    return 'Philippine mobile numbers start with "09" (e.g., 0917 123 4567).';
  }

  if (trimmed.startsWith('+63') && digits.length !== 12) {
    return `+63 mobile requires 10 digits after country code (${digits.length - 2}/10). e.g., +63 917 123 4567`;
  }

  if (trimmed.startsWith('09') && digits.length !== 11) {
    return `09 mobile number requires 11 digits (${digits.length}/11). e.g., 0917 123 4567`;
  }

  return null;
}

/**
 * Automatically cleans and formats phone input while typing.
 * Strips alphabets and maintains readable spacing (e.g., 0917 123 4567 or +63 917 123 4567).
 */
export function formatPhoneNumber(input: string): string {
  if (!input) return '';

  // Remove any alphabetic characters immediately
  let cleaned = input.replace(/[a-zA-Z]/g, '').replace(/[^0-9+\s-]/g, '');

  const hasPlus = cleaned.startsWith('+');
  const digits = cleaned.replace(/\D/g, '');

  if (hasPlus) {
    if (digits.startsWith('63')) {
      const rest = digits.slice(2);
      if (rest.length <= 3) return `+63 ${rest}`;
      if (rest.length <= 6) return `+63 ${rest.slice(0, 3)} ${rest.slice(3)}`;
      return `+63 ${rest.slice(0, 3)} ${rest.slice(3, 6)} ${rest.slice(6, 10)}`;
    }
    return `+${digits.slice(0, 14)}`;
  }

  if (digits.startsWith('09')) {
    if (digits.length <= 4) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 11)}`;
  }

  if (digits.startsWith('9')) {
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 10)}`;
  }

  return cleaned.slice(0, 16);
}

/**
 * Official Philippine LTO Driver's License regex:
 * Format: 1 Letter + 2 Digits - 2 Digits - 6 Digits (e.g. N01-23-456789, A02-19-123456)
 */
export const LTO_DRIVER_LICENSE_REGEX = /^[A-Z][0-9]{2}-[0-9]{2}-[0-9]{6}$/;

/**
 * Validates whether a driver's license number conforms to official Philippine LTO format.
 */
export function isValidDriverLicense(license: string): boolean {
  if (!license || typeof license !== 'string') return false;
  const trimmed = license.trim().toUpperCase();
  return LTO_DRIVER_LICENSE_REGEX.test(trimmed);
}

/**
 * Returns human-readable error message for Driver's License number format.
 */
export function getDriverLicenseValidationError(license: string): string | null {
  const trimmed = license.trim().toUpperCase();
  if (!trimmed) {
    return "Official Driver's License number is required.";
  }

  // Check first character
  if (!/^[A-Z]/.test(trimmed)) {
    return 'Driver\'s License must start with an agency region letter (e.g., "N" in N01-23-456789).';
  }

  // Strip hyphens to check raw alphanumeric length
  const raw = trimmed.replace(/[^A-Z0-9]/g, '');

  if (raw.length < 11) {
    return `Driver's License is incomplete (${raw.length}/11 chars). Expected format: N01-23-456789`;
  }

  if (raw.length > 11) {
    return "Driver's License number exceeds 11 characters. Expected format: N01-23-456789";
  }

  if (!LTO_DRIVER_LICENSE_REGEX.test(trimmed)) {
    return 'Must match official LTO format: Letter + 2 digits - 2 digits - 6 digits (e.g., N01-23-456789).';
  }

  return null;
}

/**
 * Automatically converts to uppercase and auto-inserts hyphens:
 * e.g., typing "n0123456789" -> "N01-23-456789"
 */
export function formatDriverLicense(input: string): string {
  if (!input) return '';

  // Remove any non-alphanumeric except hyphen
  const upper = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!upper) return '';

  const firstLetter = upper.slice(0, 1);
  const rest = upper.slice(1);

  if (rest.length <= 2) {
    return `${firstLetter}${rest}`;
  }

  if (rest.length <= 4) {
    return `${firstLetter}${rest.slice(0, 2)}-${rest.slice(2)}`;
  }

  return `${firstLetter}${rest.slice(0, 2)}-${rest.slice(2, 4)}-${rest.slice(4, 10)}`;
}

/**
 * Validates Full Name.
 * Strictly requires alphabetic characters, spaces, periods, hyphens, and apostrophes.
 * Numbers and special symbols are forbidden.
 */
export const FULL_NAME_REGEX = /^[a-zA-ZÀ-ÿ\s'.\-]{2,70}$/;

export function isValidFullName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 70) return false;
  if (/\d/.test(trimmed)) return false; // Strictly disallow numbers
  return FULL_NAME_REGEX.test(trimmed);
}

export function getFullNameValidationError(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) {
    return 'Full name is required.';
  }

  if (/\d/.test(trimmed)) {
    return 'Name cannot contain numbers. Only letters, spaces, and hyphens are allowed.';
  }

  if (/[@#$%^&*()_+=[\]{};:"\\|<>/?~`]/.test(trimmed)) {
    return 'Name cannot contain special symbols. Only letters, spaces, and hyphens are allowed.';
  }

  if (trimmed.length < 2) {
    return 'Name must be at least 2 characters.';
  }

  if (trimmed.length > 70) {
    return 'Name cannot exceed 70 characters.';
  }

  if (!FULL_NAME_REGEX.test(trimmed)) {
    return 'Please enter a valid personal name (letters only).';
  }

  return null;
}

/**
 * Formats name input by stripping numbers and illegal symbols.
 */
export function formatFullName(input: string): string {
  if (!input) return '';
  return input.replace(/[^a-zA-ZÀ-ÿ\s'.\-]/g, '');
}

/**
 * Validates RFID Card UID.
 * Must be 8 to 14 hexadecimal characters (0-9, A-F).
 */
export const RFID_UID_REGEX = /^[0-9A-F]{8,14}$/;

export function isValidRfidUid(uid: string): boolean {
  if (!uid || typeof uid !== 'string') return false;
  const trimmed = uid.trim().toUpperCase();
  return RFID_UID_REGEX.test(trimmed);
}

export function getRfidUidValidationError(uid: string): string | null {
  const trimmed = uid.trim().toUpperCase();
  if (!trimmed) return null; // Optional

  if (/[^0-9A-F]/.test(trimmed)) {
    return 'RFID UID must contain only hexadecimal characters (0-9, A-F).';
  }

  if (trimmed.length < 8) {
    return `RFID UID is too short (${trimmed.length}/8 min hex chars).`;
  }

  if (trimmed.length > 14) {
    return 'RFID UID cannot exceed 14 hex characters.';
  }

  return null;
}

export const getRfidValidationError = getRfidUidValidationError;

export function formatRfidUid(input: string): string {
  if (!input) return '';
  return input.toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 14);
}

/**
 * Validates Password strength and requirements.
 */
export function isValidPassword(password: string): boolean {
  if (!password || typeof password !== 'string') return false;
  return password.length >= 6;
}

export function getPasswordValidationError(password: string): string | null {
  if (!password) {
    return 'Password is required.';
  }
  if (password.length < 6) {
    return `Password must be at least 6 characters (${password.length}/6).`;
  }
  return null;
}

