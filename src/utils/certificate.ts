// SECURITY-SENSITIVE: This file contains A1 digital certificate (PFX/PKCS#12) parsing logic.
// Any change to this file requires explicit security reviewer sign-off.
// Cert parsing logic is preserved BYTE-FOR-BYTE from the original NewCompany.tsx.
import * as forge from 'node-forge';

export type CertParseResult =
  | { ok: true; notAfter: Date }
  | { ok: false; reason: 'no-validity' | 'invalid-password' };

/** Reads a File as a base64 string (without the data-URL prefix). */
export const readFileAsBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] || result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

/** Private: ensures at least `minMs` have elapsed since `start`. */
const ensureMinDelay = async (start: number, minMs: number): Promise<void> => {
  const elapsed = Date.now() - start;
  if (elapsed < minMs) await new Promise((r) => setTimeout(r, minMs - elapsed));
};

/**
 * Parses a PFX/PKCS#12 file and extracts the last certificate's notAfter date.
 *
 * INVARIANTS (must not change):
 * - Chunked binary build: 0x8000 window, String.fromCharCode(...subarray)
 * - forge.pkcs12.pkcs12FromAsn1(asn1, password) — positional arg order
 * - Last-cert-wins loop (no break — notAfter is overwritten on each certBag)
 * - ≥500ms artificial min-delay in success path via ensureMinDelay
 * - Fixed 500ms delay in catch path (different mechanism — preserved)
 * - No expiry/notBefore check added — only extracts notAfter
 */
export const parsePfxCertificate = async (
  bytes: Uint8Array,
  password: string,
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
    for (const sc of p12.safeContents) {
      for (const bag of sc.safeBags) {
        if (bag.type === forge.pki.oids.certBag && (bag as any).cert) {
          const cert = (bag as any).cert as forge.pki.Certificate;
          notAfter = cert.validity.notAfter;
        }
      }
    }
    if (notAfter) {
      await ensureMinDelay(startedAt, 500);
      return { ok: true, notAfter };
    } else {
      await ensureMinDelay(startedAt, 500);
      return { ok: false, reason: 'no-validity' };
    }
  } catch {
    // Fixed 500ms delay in error path — intentionally different from ensureMinDelay
    await new Promise((r) => setTimeout(r, 500));
    return { ok: false, reason: 'invalid-password' };
  }
};
