// EAN-8, EAN-13, and GTIN-14 checksum validation (Luhn-based modulo-10)

/** Validates EAN/GTIN checksum. Accepts: 8, 12, 13, or 14 digits. */
export function validateEanChecksum(code: string): boolean {
  const validLengths = [8, 12, 13, 14];
  if (!validLengths.includes(code.length)) return false;
  if (!/^\d+$/.test(code)) return false;

  const digits = code.split('').map(Number);
  const checkDigit = digits.pop()!;
  const sum = digits.reduceRight((acc, digit, idx) => {
    // From right: odd positions (0-indexed from right) × 3, even × 1
    const multiplier = (digits.length - idx) % 2 === 0 ? 3 : 1;
    return acc + digit * multiplier;
  }, 0);

  const expected = (10 - (sum % 10)) % 10;
  return expected === checkDigit;
}

/** Returns the lengths accepted by this validator */
export const VALID_EAN_LENGTHS = [8, 12, 13, 14] as const;
