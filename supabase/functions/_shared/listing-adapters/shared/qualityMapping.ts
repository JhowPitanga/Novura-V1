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
  // Portuguese labels persisted by mercado-livre-update-quality / marketplace_metrics
  profissional: 'excellent',
  professional: 'excellent',
  satisfatoria: 'good',
  satisfatória: 'good',
  standard: 'good',
  basica: 'low',
  básica: 'low',
  basic: 'low',
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

/** Shopee content diagnosis uses numeric tiers 1 | 2 | 3 in performance_data. */
const SHOPEE_NUMERIC_LEVEL_MAP: Record<number, QualityLevelCanonical> = {
  3: 'excellent',
  2: 'good',
  1: 'low',
};

export function shopeeNumericQualityScore(level: number | null | undefined): number | null {
  if (level === 3) return 100;
  if (level === 2) return 76;
  if (level === 1) return 50;
  return null;
}

export function mapShopeeQuality(
  qualityLevel: string | number | null | undefined,
): QualityLevelCanonical {
  if (qualityLevel == null || qualityLevel === '') return 'unknown';
  const num = typeof qualityLevel === 'number' ? qualityLevel : Number(qualityLevel);
  if (Number.isFinite(num) && SHOPEE_NUMERIC_LEVEL_MAP[num]) {
    return SHOPEE_NUMERIC_LEVEL_MAP[num];
  }
  return SHOPEE_QUALITY_MAP[String(qualityLevel).toUpperCase()] ?? 'unknown';
}
