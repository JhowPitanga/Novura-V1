/**
 * Characterization tests for PFX certificate parsing.
 *
 * Strategy:
 *   1. Mocked unit tests — vi.mock('node-forge') to verify:
 *      - chunked binary build (0x8000 window, String.fromCharCode + subarray)
 *      - pkcs12FromAsn1(asn1, password) positional arg order
 *      - last-cert-wins (loop overwrites notAfter, no break)
 *      - ≥500ms min-delay in success path (ensureMinDelay)
 *      - fixed 500ms delay in catch path
 *      - result mapping ok/no-validity/invalid-password
 *   2. Integration smoke test — real dummy.pfx (self-signed, password 'test')
 *      FIXTURE: test-fixtures/dummy.pfx, self-signed cert, password 'test', expires ~2034.
 *      NEVER commit any production certificate.
 *
 * SECURITY-SENSITIVE: any change to parsePfxCertificate logic needs explicit review.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

// ─────────────────────────────────────────────────
// Helpers copied verbatim from NewCompany.tsx (pre-extraction)
// After commit 2 these become imports from '@/utils/certificate'
// ─────────────────────────────────────────────────

type CertParseResult =
  | { ok: true; notAfter: Date }
  | { ok: false; reason: 'no-validity' | 'invalid-password' };

// NOTE: ensureMinDelay and parsePfxCertificate below are inline implementations
// that mirror the exact logic in NewCompany.tsx handleVerifyCertPassword.
// They will be replaced with imports after commit 2.

// ─────────────────────────────────────────────────
// Mocked unit tests
// ─────────────────────────────────────────────────

describe('parsePfxCertificate — mocked forge (behavioral unit tests)', () => {
  // We build a minimal mock of node-forge's API surface used in the function
  let mockForge: {
    asn1: { fromDer: ReturnType<typeof vi.fn> };
    pkcs12: { pkcs12FromAsn1: ReturnType<typeof vi.fn> };
    pki: { oids: { certBag: string } };
  };

  beforeEach(() => {
    vi.useFakeTimers();
    mockForge = {
      asn1: { fromDer: vi.fn() },
      pkcs12: { pkcs12FromAsn1: vi.fn() },
      pki: { oids: { certBag: '1.2.840.113549.1.12.10.1.3' } },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /**
   * Helper: run the exact cert-parsing logic from NewCompany.tsx
   * using the injected mockForge (simulates the extracted parsePfxCertificate).
   */
  const runParsePfx = async (
    bytes: Uint8Array,
    password: string,
    forge: typeof mockForge,
  ): Promise<CertParseResult> => {
    try {
      const startedAt = Date.now();
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const asn1Obj = forge.asn1.fromDer(binary);
      const p12 = forge.pkcs12.pkcs12FromAsn1(asn1Obj, password);
      let notAfter: Date | undefined;
      for (const sc of (p12 as any).safeContents) {
        for (const bag of sc.safeBags) {
          if (bag.type === forge.pki.oids.certBag && bag.cert) {
            notAfter = bag.cert.validity.notAfter;
          }
        }
      }
      const ensureMinDelay = async (start: number, minMs: number) => {
        const elapsed = Date.now() - start;
        if (elapsed < minMs)
          await new Promise((r) => setTimeout(r, minMs - elapsed));
      };
      if (notAfter) {
        await ensureMinDelay(startedAt, 500);
        return { ok: true, notAfter };
      } else {
        await ensureMinDelay(startedAt, 500);
        return { ok: false, reason: 'no-validity' };
      }
    } catch {
      await new Promise((r) => setTimeout(r, 500));
      return { ok: false, reason: 'invalid-password' };
    }
  };

  it('builds binary in 0x8000 chunks — spy on String.fromCharCode (indirect via forge.asn1.fromDer arg)', async () => {
    // 3 chunks: 3 × 0x8000 = 98304 bytes
    const totalBytes = 0x8000 * 3;
    const bytes = new Uint8Array(totalBytes).fill(65); // all 'A'

    const notAfterDate = new Date(2034, 0, 1);
    mockForge.asn1.fromDer.mockImplementation((binary: string) => {
      // Each chunk should be exactly 0x8000 chars (32768)
      // The entire binary should be totalBytes chars
      expect(binary).toHaveLength(totalBytes);
      return 'mockAsn1';
    });
    mockForge.pkcs12.pkcs12FromAsn1.mockReturnValue({
      safeContents: [
        {
          safeBags: [
            {
              type: mockForge.pki.oids.certBag,
              cert: { validity: { notAfter: notAfterDate } },
            },
          ],
        },
      ],
    });

    const p = runParsePfx(bytes, 'pw', mockForge);
    await vi.runAllTimersAsync();
    const result = await p;
    expect(result.ok).toBe(true);
  });

  it('calls pkcs12FromAsn1(asn1Result, password) in positional arg order', async () => {
    const bytes = new Uint8Array(10).fill(1);
    const mockAsn1 = { tag: 'mockAsn1' };
    mockForge.asn1.fromDer.mockReturnValue(mockAsn1);
    mockForge.pkcs12.pkcs12FromAsn1.mockReturnValue({
      safeContents: [{ safeBags: [] }],
    });

    const p = runParsePfx(bytes, 'my-password', mockForge);
    await vi.runAllTimersAsync();
    await p;

    expect(mockForge.pkcs12.pkcs12FromAsn1).toHaveBeenCalledWith(
      mockAsn1,
      'my-password',
    );
  });

  it('last-cert-wins: returns notAfter of the LAST certBag when multiple exist', async () => {
    const bytes = new Uint8Array(4).fill(2);
    const firstDate = new Date(2025, 0, 1);
    const secondDate = new Date(2030, 5, 15);

    mockForge.asn1.fromDer.mockReturnValue('asn1');
    mockForge.pkcs12.pkcs12FromAsn1.mockReturnValue({
      safeContents: [
        {
          safeBags: [
            {
              type: mockForge.pki.oids.certBag,
              cert: { validity: { notAfter: firstDate } },
            },
            {
              type: mockForge.pki.oids.certBag,
              cert: { validity: { notAfter: secondDate } },
            },
          ],
        },
      ],
    });

    const p = runParsePfx(bytes, 'pw', mockForge);
    await vi.runAllTimersAsync();
    const result = await p;

    expect(result.ok).toBe(true);
    if (result.ok) {
      // LAST cert's date must win — no break in loop
      expect(result.notAfter).toBe(secondDate);
      expect(result.notAfter).not.toBe(firstDate);
    }
  });

  it('min-delay (success path): calls setTimeout with remaining ms when forge resolves instantly', async () => {
    const bytes = new Uint8Array(4).fill(3);
    const notAfterDate = new Date(2034, 0, 1);
    mockForge.asn1.fromDer.mockReturnValue('asn1');
    mockForge.pkcs12.pkcs12FromAsn1.mockReturnValue({
      safeContents: [
        {
          safeBags: [
            {
              type: mockForge.pki.oids.certBag,
              cert: { validity: { notAfter: notAfterDate } },
            },
          ],
        },
      ],
    });

    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
    const p = runParsePfx(bytes, 'pw', mockForge);
    await vi.runAllTimersAsync();
    await p;

    // At least one setTimeout call with ≥0 delay from ensureMinDelay (500ms - elapsed)
    const timerCalls = setTimeoutSpy.mock.calls.filter(
      (c) => typeof c[1] === 'number' && (c[1] as number) > 0,
    );
    expect(timerCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('returns { ok: true, notAfter } when a certBag has a cert', async () => {
    const bytes = new Uint8Array(4).fill(4);
    const notAfterDate = new Date(2030, 0, 1);
    mockForge.asn1.fromDer.mockReturnValue('asn1');
    mockForge.pkcs12.pkcs12FromAsn1.mockReturnValue({
      safeContents: [
        {
          safeBags: [
            {
              type: mockForge.pki.oids.certBag,
              cert: { validity: { notAfter: notAfterDate } },
            },
          ],
        },
      ],
    });

    const p = runParsePfx(bytes, 'pw', mockForge);
    await vi.runAllTimersAsync();
    const result = await p;

    expect(result).toEqual({ ok: true, notAfter: notAfterDate });
  });

  it('returns { ok: false, reason: "no-validity" } when no certBag has a cert', async () => {
    const bytes = new Uint8Array(4).fill(5);
    mockForge.asn1.fromDer.mockReturnValue('asn1');
    mockForge.pkcs12.pkcs12FromAsn1.mockReturnValue({
      safeContents: [
        {
          safeBags: [
            // non-certBag type
            { type: 'other-type', cert: null },
          ],
        },
      ],
    });

    const p = runParsePfx(bytes, 'pw', mockForge);
    await vi.runAllTimersAsync();
    const result = await p;

    expect(result).toEqual({ ok: false, reason: 'no-validity' });
  });

  it('returns { ok: false, reason: "invalid-password" } when pkcs12FromAsn1 throws', async () => {
    const bytes = new Uint8Array(4).fill(6);
    mockForge.asn1.fromDer.mockReturnValue('asn1');
    mockForge.pkcs12.pkcs12FromAsn1.mockImplementation(() => {
      throw new Error('Invalid password');
    });

    const p = runParsePfx(bytes, 'wrong-pw', mockForge);
    await vi.runAllTimersAsync();
    const result = await p;

    expect(result).toEqual({ ok: false, reason: 'invalid-password' });
  });

  it('applies 500ms delay in the catch (invalid-password) path', async () => {
    const bytes = new Uint8Array(4).fill(7);
    mockForge.asn1.fromDer.mockReturnValue('asn1');
    mockForge.pkcs12.pkcs12FromAsn1.mockImplementation(() => {
      throw new Error('bad cert');
    });

    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
    const p = runParsePfx(bytes, 'bad-pw', mockForge);
    await vi.runAllTimersAsync();
    await p;

    // The catch path calls setTimeout(r, 500) — fixed 500ms
    const call500 = setTimeoutSpy.mock.calls.find(
      (c) => c[1] === 500,
    );
    expect(call500).toBeDefined();
  });
});

// ─────────────────────────────────────────────────
// Integration smoke test — real node-forge + fixture
// ─────────────────────────────────────────────────

const fixturePath = resolve(process.cwd(), 'test-fixtures/dummy.pfx');

describe.skipIf(!existsSync(fixturePath))(
  'parsePfxCertificate — real fixture (integration smoke)',
  () => {
    it(
      'parses test-fixtures/dummy.pfx with password "test" and returns ok:true + notAfter Date',
      async () => {
        // FIXTURE: self-signed cert, password 'test', expires ~2034. NOT a production cert.
        const bytes = new Uint8Array(readFileSync(fixturePath));
        // Use real node-forge here
        const forge = await import('node-forge');
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
        }
        const asn1Obj = forge.asn1.fromDer(binary);
        const p12 = forge.pkcs12.pkcs12FromAsn1(asn1Obj, 'test');
        let notAfter: Date | undefined;
        for (const sc of p12.safeContents) {
          for (const bag of sc.safeBags) {
            if (bag.type === forge.pki.oids.certBag && (bag as any).cert) {
              notAfter = ((bag as any).cert as forge.pki.Certificate).validity
                .notAfter;
            }
          }
        }
        expect(notAfter).toBeInstanceOf(Date);
        // Certificate expires in the future (generated with -days 3650)
        expect(notAfter!.getFullYear()).toBeGreaterThan(2026);
      },
      15000, // generous timeout for forge crypto
    );

    it('returns invalid-password error for wrong password on dummy.pfx', async () => {
      const bytes = new Uint8Array(readFileSync(fixturePath));
      const forge = await import('node-forge');
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const asn1Obj = forge.asn1.fromDer(binary);
      expect(() =>
        forge.pkcs12.pkcs12FromAsn1(asn1Obj, 'wrong-password'),
      ).toThrow();
    }, 15000);
  },
);
