// Tests for EAN checksum validation utility
import { describe, it, expect } from 'vitest';
import { validateEanChecksum } from './eanChecksum';

describe('validateEanChecksum', () => {
  describe('EAN-13', () => {
    it('accepts a valid EAN-13', () => {
      expect(validateEanChecksum('7891000315507')).toBe(true);
    });

    it('rejects an EAN-13 with wrong check digit', () => {
      expect(validateEanChecksum('7891000315508')).toBe(false);
    });

    it('rejects a non-numeric EAN-13', () => {
      expect(validateEanChecksum('789100031550A')).toBe(false);
    });
  });

  describe('EAN-8', () => {
    it('accepts a valid EAN-8', () => {
      expect(validateEanChecksum('96385074')).toBe(true);
    });

    it('rejects an EAN-8 with wrong check digit', () => {
      expect(validateEanChecksum('96385075')).toBe(false);
    });
  });

  describe('GTIN-14', () => {
    it('accepts a valid GTIN-14', () => {
      // GTIN-14 formed from EAN-13 with leading 0
      expect(validateEanChecksum('07891000315507')).toBe(true);
    });
  });

  describe('invalid lengths', () => {
    it('rejects a 7-digit code', () => {
      expect(validateEanChecksum('1234567')).toBe(false);
    });

    it('rejects a 10-digit code', () => {
      expect(validateEanChecksum('1234567890')).toBe(false);
    });

    it('rejects an empty string', () => {
      expect(validateEanChecksum('')).toBe(false);
    });
  });
});
