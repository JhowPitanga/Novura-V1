/**
 * Brazilian-style numeric helpers: thousands with dot, decimals with comma.
 * Canonical stored values use "." as decimal separator for parseFloat.
 */

/** Remove thousand dots; first comma → decimal point; then parse. */
export function parseBrDecimalToCanonical(raw: string): string {
  const t = String(raw || "").trim();
  if (!t) return "";
  const noThousands = t.replace(/\./g, "");
  const normalized = noThousands.replace(",", ".");
  const cleaned = normalized.replace(/[^\d.-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === "." || cleaned === "-.") return "";
  const n = parseFloat(cleaned);
  if (Number.isNaN(n)) return "";
  return String(n);
}

/**
 * Parse BRL money while typing or pasted: last comma is always decimal separator;
 * dots before it are thousands. Without comma: multiple dots → thousands only;
 * single dot with 1–2 fractional digits → decimal dot (e.g. 25.90); otherwise ambiguous dot as thousands.
 * Avoids "25,90" becoming 2590 (that happens if all dots are stripped then "25.90" is misread).
 */
export function parseBrlMoneyToCanonical(raw: string): string {
  const t = String(raw || "").trim().replace(/\s/g, "");
  if (!t) return "";

  let s = t.replace(/[^\d.,]/g, "");
  const commaCount = (s.match(/,/g) || []).length;
  if (commaCount > 1) {
    const last = s.lastIndexOf(",");
    s = s.slice(0, last).replace(/,/g, "") + s.slice(last);
  }

  const lastComma = s.lastIndexOf(",");
  if (lastComma !== -1) {
    const beforeComma = s.slice(0, lastComma);
    const afterComma = s.slice(lastComma + 1);
    const intPart = beforeComma.replace(/\./g, "").replace(/\D/g, "");
    const fracDigits = afterComma.replace(/\D/g, "");
    if (intPart === "" && fracDigits === "") return "";
    const intNum = intPart === "" ? 0 : parseInt(intPart, 10);
    if (fracDigits === "") {
      return String(intNum);
    }
    const fracVal = parseInt(fracDigits.padEnd(2, "0").slice(0, 2), 10) / 100;
    return String(intNum + fracVal);
  }

  const dotCount = (s.match(/\./g) || []).length;
  if (dotCount === 0) {
    const digits = s.replace(/\D/g, "");
    if (digits === "") return "";
    return String(parseInt(digits, 10));
  }

  if (dotCount === 1) {
    const idx = s.indexOf(".");
    const left = s.slice(0, idx).replace(/\D/g, "");
    const right = s.slice(idx + 1).replace(/\D/g, "");
    if (left !== "" && right.length > 0 && right.length <= 2) {
      const fracVal = parseInt(right.padEnd(2, "0").slice(0, 2), 10) / 100;
      return String(parseInt(left, 10) + fracVal);
    }
  }

  const digitsOnly = s.replace(/\./g, "").replace(/\D/g, "");
  if (digitsOnly === "") return "";
  return String(parseInt(digitsOnly, 10));
}

export function displayBrDecimalFromCanonical(canonical: string): string {
  if (!canonical) return "";
  return String(canonical).replace(".", ",");
}

export function parseBrIntegerDigits(raw: string): string {
  return String(raw || "").replace(/\D/g, "");
}

export function formatBrIntegerDisplay(digits: string): string {
  if (!digits) return "";
  const n = parseInt(digits, 10);
  if (Number.isNaN(n)) return "";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

export function formatBrDecimalDisplay(canonical: string, fractionDigits = 2): string {
  if (!canonical) return "";
  const n = parseFloat(canonical);
  if (Number.isNaN(n)) return "";
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}
