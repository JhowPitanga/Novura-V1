import type { QualityLevelCanonical } from '../types.ts';

// ---------------------------------------------------------------------------
// Mercado Livre
// quality_level comes as 'bronze'|'silver'|'gold'|'platinum' or as a numeric
// score (0-100) from listing_quality.
// ---------------------------------------------------------------------------

const ML_QUALITY_LEVEL_MAP: Record<string, QualityLevelCanonical> = {
  platinum: 'excellent',
  gold: 'good',
  silver: 'medium',
  bronze: 'low',
  incomplete: 'incomplete',
};

export function mapMercadoLivreQuality(
  qualityLevel: string | null | undefined,
  score: number | null | undefined,
): { level: QualityLevelCanonical; score: number | null } {
  const level =
    ML_QUALITY_LEVEL_MAP[String(qualityLevel ?? '').toLowerCase()] ?? scoreToLevel(score);
  return { level, score: score ?? null };
}

function scoreToLevel(score: number | null | undefined): QualityLevelCanonical {
  if (score == null) return 'unknown';
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'medium';
  if (score > 0) return 'low';
  return 'incomplete';
}

// ---------------------------------------------------------------------------
// Shopee
// quality_level in content_diagnosis_result is typically a string: 'GOOD',
// 'MEDIUM', 'LOW', 'POOR', 'INCOMPLETE'.
// ---------------------------------------------------------------------------

const SHOPEE_QUALITY_MAP: Record<string, QualityLevelCanonical> = {
  EXCELLENT: 'excellent',
  GOOD: 'good',
  MEDIUM: 'medium',
  LOW: 'low',
  POOR: 'low',
  INCOMPLETE: 'incomplete',
};

export function mapShopeeQuality(
  qualityLevel: string | null | undefined,
): QualityLevelCanonical {
  if (!qualityLevel) return 'unknown';
  return SHOPEE_QUALITY_MAP[qualityLevel.toUpperCase()] ?? 'unknown';
}
