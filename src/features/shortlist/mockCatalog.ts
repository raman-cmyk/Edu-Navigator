import type { University, Course, Field } from '@/types/domain';
import { FIELDS } from '@/types/domain';
import type { Catalog } from '@/lib/shortlist/catalog';

/*
 * DEMO-ONLY catalog for local/demo mode.
 *
 * In production the `shortlist` Edge Function fetches the real catalog from
 * Postgres (universities, courses, v_city_costs, university_data_points,
 * commission_ledger) and feeds it to the SAME pure engine. This mock exists only
 * so the public flow is runnable without a backend — it deliberately mirrors the
 * dev-seed shape from docs/09, including:
 *   - one university with commission_aud = null (dropped from results)
 *   - Melbourne with n >= 5 living-cost samples, Adelaide with n < 5
 *     (so the "Insufficient data" cost path renders).
 */

const FX = 88; // NPR per AUD (demo constant; prod refreshes daily and freezes it)

interface Seed {
  slug: string;
  name: string;
  city: string;
  regional: boolean;
  ranking: University['ranking_tier'];
  tuition: number;
  minGpa: number;
  commission: number | null;
  nepali: number | null;
  onSol: boolean;
  dataCount: number;
  chooseAgainNo: number;
  chooseAgainTotal: number;
  visaRefused: number;
  visaTotal: number;
  gradSalary: number | null;
  rebate: number | null;
}

const SEEDS: Seed[] = [
  { slug: 'deakin', name: 'Deakin University', city: 'melbourne', regional: false, ranking: 'mid', tuition: 34000, minGpa: 60, commission: 3200, nepali: 340, onSol: true, dataCount: 22, chooseAgainNo: 3, chooseAgainTotal: 20, visaRefused: 2, visaTotal: 18, gradSalary: 58000, rebate: null },
  { slug: 'federation', name: 'Federation University', city: 'brisbane', regional: true, ranking: 'regional', tuition: 28000, minGpa: 55, commission: 4000, nepali: 210, onSol: true, dataCount: 8, chooseAgainNo: 1, chooseAgainTotal: 8, visaRefused: 1, visaTotal: 7, gradSalary: 52000, rebate: null },
  { slug: 'cqu', name: 'CQUniversity', city: 'brisbane', regional: true, ranking: 'regional', tuition: 26500, minGpa: 50, commission: 4500, nepali: 180, onSol: true, dataCount: 7, chooseAgainNo: 1, chooseAgainTotal: 7, visaRefused: 1, visaTotal: 6, gradSalary: 50000, rebate: 20 },
  { slug: 'adelaide', name: 'University of Adelaide', city: 'adelaide', regional: false, ranking: 'go8', tuition: 45000, minGpa: 70, commission: 2800, nepali: 90, onSol: true, dataCount: 3, chooseAgainNo: 0, chooseAgainTotal: 3, visaRefused: 0, visaTotal: 3, gradSalary: 62000, rebate: null },
  { slug: 'latrobe', name: 'La Trobe University', city: 'melbourne', regional: false, ranking: 'mid', tuition: 33000, minGpa: 58, commission: 3500, nepali: 260, onSol: true, dataCount: 9, chooseAgainNo: 3, chooseAgainTotal: 9, visaRefused: 1, visaTotal: 8, gradSalary: 55000, rebate: null },
  { slug: 'vu', name: 'Victoria University', city: 'melbourne', regional: false, ranking: 'mid', tuition: 31000, minGpa: 55, commission: 3800, nepali: 300, onSol: false, dataCount: 5, chooseAgainNo: 2, chooseAgainTotal: 5, visaRefused: 1, visaTotal: 5, gradSalary: 51000, rebate: null },
  { slug: 'usyd', name: 'University of Sydney', city: 'sydney', regional: false, ranking: 'go8', tuition: 52000, minGpa: 75, commission: 2500, nepali: 120, onSol: false, dataCount: 4, chooseAgainNo: 1, chooseAgainTotal: 4, visaRefused: 0, visaTotal: 4, gradSalary: 68000, rebate: null },
  { slug: 'wsu', name: 'Western Sydney University', city: 'sydney', regional: false, ranking: 'mid', tuition: 32000, minGpa: 58, commission: 3600, nepali: 220, onSol: true, dataCount: 8, chooseAgainNo: 2, chooseAgainTotal: 8, visaRefused: 1, visaTotal: 7, gradSalary: 54000, rebate: 10 },
  { slug: 'scu', name: 'Southern Cross University', city: 'brisbane', regional: true, ranking: 'regional', tuition: 27000, minGpa: 52, commission: 4300, nepali: 140, onSol: true, dataCount: 5, chooseAgainNo: 4, chooseAgainTotal: 5, visaRefused: 2, visaTotal: 5, gradSalary: 48000, rebate: null },
  // A university with NO published commission — the engine drops it entirely.
  { slug: 'privateco', name: 'Metro Private College', city: 'sydney', regional: false, ranking: 'private', tuition: 24000, minGpa: 45, commission: null, nepali: 60, onSol: false, dataCount: 1, chooseAgainNo: 1, chooseAgainTotal: 1, visaRefused: 1, visaTotal: 1, gradSalary: null, rebate: null },
];

const CITIES = [
  { id: 'melbourne', slug: 'melbourne', name: 'Melbourne' },
  { id: 'sydney', slug: 'sydney', name: 'Sydney' },
  { id: 'brisbane', slug: 'brisbane', name: 'Brisbane' },
  { id: 'adelaide', slug: 'adelaide', name: 'Adelaide' },
];

// Adelaide deliberately < 5 so the "Insufficient data" cost branch renders.
const CITY_LIVING: Catalog['cityLivingCost'] = {
  melbourne: { median_monthly_aud: 1850, sample_size: 12 },
  sydney: { median_monthly_aud: 2100, sample_size: 9 },
  brisbane: { median_monthly_aud: 1650, sample_size: 6 },
  adelaide: { median_monthly_aud: null, sample_size: 3 },
};

function buildUniversities(): University[] {
  return SEEDS.map((s) => ({
    id: s.slug,
    slug: s.slug,
    name: s.name,
    city_id: s.city,
    country: 'AU',
    is_regional: s.regional,
    is_active: true,
    annual_tuition_aud: s.tuition,
    commission_aud: s.commission,
    commission_source: 'DEV_PLACEHOLDER',
    commission_updated_at: '2026-01-01T00:00:00Z',
    ranking_tier: s.ranking,
    nepali_student_estimate: s.nepali,
    data_confidence: 'none',
  }));
}

function buildCourses(): Course[] {
  const courses: Course[] = [];
  for (const s of SEEDS) {
    FIELDS.filter((f) => f !== 'other').forEach((field, i) => {
      courses.push({
        id: `${s.slug}-${field}`,
        university_id: s.slug,
        name: courseName(field),
        field: field as Field,
        duration_months: 24,
        annual_tuition_aud: s.tuition + (i % 3) * 1000,
        min_gpa_pct: s.minGpa,
        max_backlogs: 4 + (i % 4),
        min_ielts: 6.0,
        min_ielts_band: 5.5,
        on_skilled_occupation_list: s.onSol,
      });
    });
  }
  return courses;
}

function courseName(field: string): string {
  const map: Record<string, string> = {
    it: 'Master of Information Technology',
    nursing: 'Master of Nursing',
    business: 'Master of Business Administration',
    engineering: 'Master of Engineering',
    cookery: 'Diploma of Commercial Cookery',
    aged_care: 'Certificate in Aged Care',
    accounting: 'Master of Professional Accounting',
    public_health: 'Master of Public Health',
    data: 'Master of Data Science',
    construction: 'Master of Construction Management',
  };
  return map[field] ?? 'Graduate Program';
}

export function buildDemoCatalog(): Catalog {
  return {
    universities: buildUniversities(),
    courses: buildCourses(),
    cities: CITIES,
    cityLivingCost: CITY_LIVING,
    dataPoints: Object.fromEntries(
      SEEDS.map((s) => [
        s.slug,
        {
          count: s.dataCount,
          would_choose_again_no: s.chooseAgainNo,
          would_choose_again_total: s.chooseAgainTotal,
          visa_refused: s.visaRefused,
          visa_total: s.visaTotal,
          median_grad_salary_aud: s.gradSalary,
        },
      ]),
    ),
    ledger: Object.fromEntries(
      SEEDS.filter((s) => s.commission != null).map((s) => [
        s.slug,
        { amount_aud: s.commission as number, rebate_pct: s.rebate },
      ]),
    ),
    fxRate: FX,
  };
}
