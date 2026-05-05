// Image processing utilities for product photos
// Handles: validation, 1:1 crop, downscale, WebP conversion, SHA-256 checksum

const MAX_DIMENSION = 2000;
const MIN_DIMENSION = 800;
const MAX_FILE_SIZE_BYTES = 1.5 * 1024 * 1024; // 1.5 MB
const QUALITY_STEPS = [0.9, 0.85, 0.8];

export interface ProcessedImage {
  blob: Blob;
  width: number;
  height: number;
  checksum: string;
  sourceFormat: string;
  sourceSizeBytes: number;
}

export interface ImageProcessingError {
  code: 'RESOLUTION_TOO_LOW' | 'COMPRESSION_FAILED' | 'INVALID_TYPE';
  message: string;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível carregar a imagem.'));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Falha ao converter canvas para blob.'));
      },
      type,
      quality
    );
  });
}

async function computeSha256(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Processes an image file into a production-ready WebP:
 * - Validates minimum resolution (800×800)
 * - Crops to 1:1 (center crop)
 * - Downscales to max 2000px (never upscales)
 * - Encodes to WebP quality 90% (retries at 85% and 80% if > 1.5 MB)
 * - Returns blob + metadata + SHA-256 checksum
 */
export async function processImageForUpload(file: File): Promise<ProcessedImage> {
  // Validate type
  const acceptedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  if (!acceptedTypes.includes(file.type)) {
    throw {
      code: 'INVALID_TYPE',
      message: `Formato inválido: ${file.type}. Aceitos: JPG, PNG, WebP, HEIC.`,
    } as ImageProcessingError;
  }

  const img = await loadImage(file);
  const naturalW = img.naturalWidth;
  const naturalH = img.naturalHeight;

  // Validate minimum resolution
  if (naturalW < MIN_DIMENSION || naturalH < MIN_DIMENSION) {
    throw {
      code: 'RESOLUTION_TOO_LOW',
      message: `Resolução mínima de ${MIN_DIMENSION}×${MIN_DIMENSION} pixels não atingida. Imagem enviada: ${naturalW}×${naturalH}px.`,
    } as ImageProcessingError;
  }

  // Center crop to 1:1
  const side = Math.min(naturalW, naturalH);
  const offsetX = Math.floor((naturalW - side) / 2);
  const offsetY = Math.floor((naturalH - side) / 2);

  // Output size: cap at MAX_DIMENSION, never upscale
  const outSize = Math.min(side, MAX_DIMENSION);

  // Render to canvas
  const canvas = document.createElement('canvas');
  canvas.width = outSize;
  canvas.height = outSize;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, offsetX, offsetY, side, side, 0, 0, outSize, outSize);

  // Encode as WebP with quality fallback
  let finalBlob: Blob | null = null;
  for (const quality of QUALITY_STEPS) {
    const blob = await canvasToBlob(canvas, 'image/webp', quality);
    if (blob.size <= MAX_FILE_SIZE_BYTES) {
      finalBlob = blob;
      break;
    }
  }

  if (!finalBlob) {
    throw {
      code: 'COMPRESSION_FAILED',
      message: 'Não foi possível comprimir a imagem para menos de 1,5 MB mesmo após redução de qualidade.',
    } as ImageProcessingError;
  }

  const checksum = await computeSha256(finalBlob);

  return {
    blob: finalBlob,
    width: outSize,
    height: outSize,
    checksum,
    sourceFormat: file.type.replace('image/', ''),
    sourceSizeBytes: file.size,
  };
}

/** Generates a canonical storage path for a product image */
export function buildImageStoragePath(
  orgId: string,
  productId: string,
  imageId: string
): string {
  return `org/${orgId}/products/${productId}/original/${imageId}.webp`;
}
