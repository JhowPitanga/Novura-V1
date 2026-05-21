// Helpers for persisting variation picture_ids in the attributes jsonb column.

export const PICTURE_IDS_ATTR_ID = '_picture_ids';

export function encodePictureIdsAttr(pictureIds: string[]): Array<Record<string, unknown>> {
  if (!pictureIds.length) return [];
  return [
    {
      id: PICTURE_IDS_ATTR_ID,
      name: 'picture_ids',
      value_id: null,
      value_name: JSON.stringify(pictureIds),
    },
  ];
}

export function decodePictureIdsFromAttrs(
  attributes: unknown,
): { combinations: Array<Record<string, unknown>>; picture_ids: string[] } {
  if (!Array.isArray(attributes)) {
    return { combinations: [], picture_ids: [] };
  }
  const combinations: Array<Record<string, unknown>> = [];
  let picture_ids: string[] = [];
  for (const a of attributes) {
    if (!a || typeof a !== 'object') continue;
    const row = a as Record<string, unknown>;
    if (row.id === PICTURE_IDS_ATTR_ID) {
      const raw = row.value_name ?? row.value_id;
      if (typeof raw === 'string' && raw.trim()) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            picture_ids = parsed.map((x) => String(x)).filter(Boolean);
          }
        } catch {
          picture_ids = [raw.trim()];
        }
      } else if (Array.isArray(raw)) {
        picture_ids = raw.map((x) => String(x)).filter(Boolean);
      }
      continue;
    }
    combinations.push(row);
  }
  return { combinations, picture_ids };
}

export function mlVariationPictureIds(v: Record<string, unknown>): string[] {
  if (Array.isArray(v.picture_ids)) {
    return v.picture_ids.map((x) => String(x)).filter(Boolean);
  }
  if (v.picture_id != null) return [String(v.picture_id)];
  return [];
}

export function resolveMlVariationImageUrl(
  pictureIds: string[],
  pictures: Array<{ id?: string; url?: string; secure_url?: string }>,
): string | null {
  if (!pictureIds.length) return null;
  for (const pid of pictureIds) {
    const match = pictures.find((p) => String(p.id ?? '') === String(pid));
    if (match) return match.secure_url ?? match.url ?? null;
  }
  return null;
}
