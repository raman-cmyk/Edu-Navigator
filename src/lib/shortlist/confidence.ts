/*
 * Overall confidence for the whole run. See docs/06 "Confidence, overall".
 *
 *   none    → no city cost data, OR fewer than 3 universities with data
 *   low     → median data points across results < 5
 *   medium  → 5-19
 *   high    → 20+
 */

import type { Confidence } from '../../types/domain';

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * @param dataPointCounts data-point count for each result in the final list
 * @param hasAnyCityCost  whether at least one result has verified city cost data
 */
export function computeOverallConfidence(
  dataPointCounts: number[],
  hasAnyCityCost: boolean
): Confidence {
  if (!hasAnyCityCost) return 'none';

  const withData = dataPointCounts.filter((c) => c > 0).length;
  if (withData < 3) return 'none';

  const med = median(dataPointCounts);
  if (med < 5) return 'low';
  if (med < 20) return 'medium';
  return 'high';
}
