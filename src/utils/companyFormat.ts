/**
 * Company data formatting and normalization utilities.
 * Logic preserved byte-for-byte from src/pages/NewCompany.tsx.
 *
 * normalizeTipoEmpresa LATENT BUG (preserved — do NOT fix here):
 *   The branch `s === 'matríZ'` is dead because toLowerCase() produces
 *   'matríz', not 'matríZ'. The fallback 'Matriz' fires instead.
 *   Observable output is correct. Fix in a separate fix(company): commit.
 */

/** Formats a Date as DD/MM/YYYY. */
export const formatDateBR = (d: Date): string => {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

/**
 * Converts a DD/MM/YYYY string to ISO YYYY-MM-DD.
 * Returns null if the input does not match the expected format.
 * Note: no day-range validation — '32/01/2024' passes the regex.
 */
export const ddmmyyyyToISO = (s?: string | null): string | null => {
  const v = String(s || '').trim();
  const m = v.match(/^([0-3]\d)\/(0\d|1[0-2])\/(\d{4})$/);
  if (!m) return null;
  const dd = m[1], mm = m[2], yyyy = m[3];
  return `${yyyy}-${mm}-${dd}`;
};

/** Converts an ISO YYYY-MM-DD string (or datetime) to DD/MM/YYYY. */
export const parseToBR = (iso: string): string => {
  const ymd = String(iso || '').slice(0, 10);
  const [y, m, d] = ymd.split('-');
  return y && m && d ? `${d}/${m}/${y}` : '';
};

/**
 * Normalizes tipo_empresa to the DB enum value.
 *
 * LATENT BUG (preserved): `s === 'matríZ'` is compared AFTER toLowerCase(),
 * so it can never match — 'Matríz'.toLowerCase() === 'matríz' ≠ 'matríZ'.
 * The fallback 'Matriz' fires, producing the correct output by accident.
 */
export const normalizeTipoEmpresa = (v: string): 'Matriz' | 'Filial' => {
  const s = String(v || '').trim().toLowerCase();
  if (s === 'matriz' || s === 'matríZ') return 'Matriz';
  if (s === 'filial') return 'Filial';
  return 'Matriz';
};

/** Normalizes tributacao to the DB enum value. Defaults to 'Simples Nacional'. */
export const normalizeTributacao = (v: string): string => {
  const s = String(v || '').trim().toLowerCase();
  if (s === 'mei') return 'MEI';
  if (s === 'simples nacional') return 'Simples Nacional';
  if (s.includes('excesso') || s.includes('sublimite'))
    return 'Simples Nacional - Excesso de sublimite de receita bruta';
  if (s === 'regime normal' || s === 'normal') return 'Regime Normal';
  return 'Simples Nacional';
};

/** Resizes a File image to PNG at most maxW×maxH pixels. Impure — uses DOM Canvas API. */
export const resizeImageToPNG = (
  file: File,
  maxW = 200,
  maxH = 200,
): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.naturalWidth || img.width;
      let h = img.naturalHeight || img.height;
      const ratio = Math.min(maxW / w, maxH / h, 1);
      w = Math.max(1, Math.floor(w * ratio));
      h = Math.max(1, Math.floor(h * ratio));
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas context not available'));
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Failed to generate PNG blob'));
        resolve(blob);
      }, 'image/png', 1.0);
    };
    img.onerror = (e) => reject(e);
    const reader = new FileReader();
    reader.onload = () => { img.src = String(reader.result || ''); };
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
