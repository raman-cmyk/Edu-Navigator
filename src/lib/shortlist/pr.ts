/*
 * PR pathway — Australia-specific in V1. Yes / Weak / No with a reason.
 * See docs/06-shortlist-engine.md section 6.
 */

import type { Course, University, PrPathway, Field } from '../../types/domain';

/** Metro + oversupplied → "Weak" even when on the occupation list. */
const OVERSUPPLIED_METRO_FIELDS: ReadonlySet<Field> = new Set<Field>([
  'accounting',
  'business',
  'it', // IT generalist
]);

/** Fields in genuine national shortage — carry PR even in metro. */
const HIGH_DEMAND_FIELDS: ReadonlySet<Field> = new Set<Field>([
  'nursing',
  'aged_care',
  'engineering',
  'construction',
  'public_health',
  'data',
]);

export interface PrAssessment {
  pathway: PrPathway;
  reason: string;
}

export function computePr(course: Course, university: University): PrAssessment {
  if (!course.on_skilled_occupation_list) {
    return {
      pathway: 'No',
      reason: `${course.name} is not on the skilled occupation list, so it does not lead to PR on its own.`,
    };
  }

  const regional = university.is_regional;
  const highDemand = HIGH_DEMAND_FIELDS.has(course.field);

  if (regional || highDemand) {
    const why = regional
      ? 'a regional university earns extra PR points'
      : `${course.field} is in national shortage`;
    return {
      pathway: 'Yes',
      reason: `On the skilled occupation list and ${why}, so there is a realistic PR pathway.`,
    };
  }

  if (OVERSUPPLIED_METRO_FIELDS.has(course.field)) {
    return {
      pathway: 'Weak',
      reason: `On the list, but ${course.field} is oversupplied in metro areas — PR is possible but competitive.`,
    };
  }

  // On the list, metro, neither shortage nor clearly oversupplied: still weak
  // because there are no regional points to lift the score.
  return {
    pathway: 'Weak',
    reason: 'On the list but metro, with no regional points to lift the score — PR is uncertain.',
  };
}
