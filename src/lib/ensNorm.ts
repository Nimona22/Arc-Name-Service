/**
 * ENSIP-15 compliant Name Normalization & Validation for Arc Name Service (ANS).
 * Prevents homoglyph spoofing, hidden zero-width injection, illegal characters,
 * and handles uniform canonical representation of .arc names.
 */

export interface NameValidationResult {
  isValid: boolean;
  clean: string;           // e.g. "nimox"
  fullName: string;        // e.g. "nimox.arc"
  error?: string;
}

// Zero-width & invisible unicode regex patterns
const ZERO_WIDTH_REGEX = /[\u200B-\u200D\uFEFF\u00A0\u180E\u2000-\u200A\u202F\u205F\u3000]/g;

/**
 * Strips URL schemes, trailing slashes, leading symbols, zero-width chars,
 * and canonicalizes .arc names.
 */
export function normalizeAnsName(raw: string): string {
  if (!raw) return '';

  let normalized = raw.trim();

  // Strip protocol prefixes if accidentally pasted
  normalized = normalized.replace(/^https?:\/\//i, '');
  // Strip leading '@' or '/'
  normalized = normalized.replace(/^[@/]+/, '');
  // Strip trailing slashes or path
  normalized = normalized.split('/')[0];
  // Strip trailing .arc (case insensitive)
  normalized = normalized.replace(/\.arc$/i, '');
  // Remove zero-width spaces & hidden unicode markers
  normalized = normalized.replace(ZERO_WIDTH_REGEX, '');
  // Unicode NFKC normalization
  try {
    normalized = normalized.normalize('NFKC');
  } catch {
    // Fallback if environment lacks NFKC
  }
  // Convert to lowercase
  normalized = normalized.toLowerCase().trim();

  return normalized;
}

/**
 * Validates a name candidate according to Arc Name Service on-chain rules:
 * - 3 to 32 characters
 * - Only lowercase alphanumeric characters (a-z, 0-9)
 * - No whitespace, no punctuation, no dots within 2nd-level domain
 */
export function validateAnsName(raw: string): NameValidationResult {
  const clean = normalizeAnsName(raw);
  const fullName = `${clean}.arc`;

  if (!clean) {
    return {
      isValid: false,
      clean: '',
      fullName: '',
      error: 'Please enter a name.',
    };
  }

  if (clean.length < 3) {
    return {
      isValid: false,
      clean,
      fullName,
      error: 'Name must be at least 3 characters long.',
    };
  }

  if (clean.length > 32) {
    return {
      isValid: false,
      clean,
      fullName,
      error: 'Name cannot exceed 32 characters.',
    };
  }

  // Check character set against contract specification: bytes1 [a-z, 0-9]
  const validCharset = /^[a-z0-9]+$/;
  if (!validCharset.test(clean)) {
    if (/[A-Z]/.test(raw)) {
      // It had uppercase, but normalized to lowercase - if that's all, it's fine,
      // but let's check what other characters triggered the failure
    }
    if (/\s/.test(clean)) {
      return {
        isValid: false,
        clean,
        fullName,
        error: 'Spaces are not allowed in .arc names.',
      };
    }
    if (/[._\-]/.test(clean)) {
      return {
        isValid: false,
        clean,
        fullName,
        error: 'Punctuation, dots, and hyphens are not supported in primary .arc names.',
      };
    }
    return {
      isValid: false,
      clean,
      fullName,
      error: 'Names may only contain lowercase letters (a-z) and numbers (0-9).',
    };
  }

  return {
    isValid: true,
    clean,
    fullName,
  };
}

/**
 * Validates a potential subdomain (e.g. "pay.nimox.arc" or "pay")
 */
export function validateSubdomainLabel(sublabel: string): { isValid: boolean; label: string; error?: string } {
  const clean = normalizeAnsName(sublabel);
  if (!clean) {
    return { isValid: false, label: '', error: 'Subdomain label cannot be empty.' };
  }
  if (clean.length < 1 || clean.length > 32) {
    return { isValid: false, label: clean, error: 'Subdomain must be between 1 and 32 characters.' };
  }
  if (!/^[a-z0-9]+$/.test(clean)) {
    return { isValid: false, label: clean, error: 'Subdomains can only contain lowercase letters and numbers.' };
  }
  return { isValid: true, label: clean };
}
