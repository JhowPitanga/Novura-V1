import { supabase } from "@/integrations/supabase/client";

// ─── Image compression ────────────────────────────────────────────────────────

export async function compressImage(file: File, quality = 0.8, maxDim = 1280): Promise<File> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = URL.createObjectURL(file);
  });
  const canvas = document.createElement('canvas');
  let { width, height } = img;
  if (width > height && width > maxDim) {
    height = Math.round((height * maxDim) / width);
    width = maxDim;
  } else if (height > maxDim) {
    width = Math.round((width * maxDim) / height);
    height = maxDim;
  }
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, width, height);
  const blob: Blob = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b as Blob), 'image/jpeg', quality),
  );
  return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || '');
      resolve(s.includes(',') ? s.split(',')[1] : s);
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// ─── File normalization ───────────────────────────────────────────────────────

export async function ensureFile(f: any): Promise<File | null> {
  if (f instanceof File) return f;
  if (f instanceof Blob) return new File([f], 'upload.jpg', { type: (f as any).type || 'application/octet-stream' });
  if (f && typeof f === 'object') {
    if ((f as any).file instanceof File) return (f as any).file as File;
    const src =
      typeof (f as any).preview === 'string'
        ? (f as any).preview
        : typeof (f as any).url === 'string'
          ? (f as any).url
          : null;
    if (src) {
      try {
        const res = await fetch(src);
        const blob = await res.blob();
        const name = (src.split('/').pop() || 'upload').split('?')[0];
        return new File([blob], name, { type: blob.type || 'application/octet-stream' });
      } catch {}
    }
  }
  if (typeof f === 'string') {
    try {
      const res = await fetch(f);
      const blob = await res.blob();
      const name = (f.split('/').pop() || 'upload').split('?')[0];
      return new File([blob], name, { type: blob.type || 'application/octet-stream' });
    } catch {}
  }
  return null;
}

// ─── Storage upload ───────────────────────────────────────────────────────────

export async function uploadImageToStorage(
  file: File,
  organizationId: string | null | undefined,
  draftId: string | null | undefined,
): Promise<string | null> {
  let toUpload = file;
  if (/^image\//.test(toUpload.type)) {
    try {
      toUpload = await compressImage(toUpload, 0.8, 1280);
    } catch {}
  }
  const safeName = (toUpload.name || 'upload').replace(/[^a-zA-Z0-9._-]/g, '-');
  const folder = `${organizationId ? `org_${organizationId}` : 'org_anon'}/${draftId ? `draft_${draftId}` : 'temp'}/${crypto.randomUUID()}`;
  const path = `${folder}/${safeName}`;
  const { error: upErr } = await supabase.storage.from('ad-images').upload(path, toUpload, { upsert: true, contentType: toUpload.type });
  if (upErr) return null;
  const { data } = supabase.storage.from('ad-images').getPublicUrl(path);
  return data?.publicUrl || null;
}

// ─── Batch image serialization ────────────────────────────────────────────────

export async function serializeImages(
  items: any[],
  organizationId: string | null | undefined,
  draftId: string | null | undefined,
  limit = 8,
): Promise<string[]> {
  const out: string[] = [];
  for (const it of items) {
    const f = await ensureFile(it);
    if (f) {
      const url = await uploadImageToStorage(f, organizationId, draftId);
      if (url) {
        out.push(url);
      } else {
        const b64 = await fileToBase64(f);
        out.push(`data:${f.type};base64,${b64}`);
      }
    } else if (typeof it === 'string') {
      out.push(it);
    } else if (it && typeof it === 'object') {
      const src =
        typeof (it as any).preview === 'string'
          ? (it as any).preview
          : typeof (it as any).url === 'string'
            ? (it as any).url
            : null;
      if (src) out.push(src);
    }
    if (out.length >= limit) break;
  }
  return out;
}
