/**
 * Safe accessor for a top-level key on an unknown object.
 * Returns undefined if the object is null, not an object, or the key is missing.
 */
export function getField(obj: unknown, key: string): unknown {
  if (obj !== null && typeof obj === "object" && key in (obj as Record<string, unknown>)) {
    return (obj as Record<string, unknown>)[key];
  }
  return undefined;
}

function navigatePath(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    if (!(k in (cur as Record<string, unknown>))) return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

/**
 * Traverses a nested path and returns a trimmed non-empty string,
 * converting finite numbers to strings. Returns null otherwise.
 */
export function getStr(obj: unknown, path: string[]): string | null {
  const v = navigatePath(obj, path);
  if (typeof v === "string" && v.trim()) return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/**
 * Traverses a nested path and returns a finite number,
 * parsing numeric strings. Returns null otherwise.
 */
export function getNum(obj: unknown, path: string[]): number | null {
  const v = navigatePath(obj, path);
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Traverses a nested path and returns the value if it is an array.
 * Returns null otherwise.
 */
export function getArr(obj: unknown, path: string[]): unknown[] | null {
  const v = navigatePath(obj, path);
  return Array.isArray(v) ? v : null;
}
