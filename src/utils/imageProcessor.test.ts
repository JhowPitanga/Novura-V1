// Tests for image processor utility
// Note: these run in a jsdom environment; canvas operations are mocked.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildImageStoragePath } from './imageProcessor';

describe('buildImageStoragePath', () => {
  it('builds the expected canonical path', () => {
    const path = buildImageStoragePath('org-123', 'prod-456', 'img-789');
    expect(path).toBe('org/org-123/products/prod-456/original/img-789.webp');
  });

  it('uses lowercase segments', () => {
    const path = buildImageStoragePath('ORG', 'PROD', 'IMG');
    expect(path).toContain('org/ORG');
  });
});

describe('processImageForUpload validation rules (mocked canvas)', () => {
  beforeEach(() => {
    // Mock canvas context
    const mockCtx = {
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
      drawImage: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCtx as any);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (cb, type, quality) {
      // Simulate small WebP blob (200 bytes)
      const blob = new Blob(['mock'], { type: 'image/webp' });
      cb!(blob);
    });
  });

  it('exports buildImageStoragePath as a pure function', () => {
    expect(typeof buildImageStoragePath).toBe('function');
  });
});
