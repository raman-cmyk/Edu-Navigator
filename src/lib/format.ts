/*
 * Money and date formatting.
 * NPR uses lakh/crore grouping (42,50,000) — Intl cannot do this for en-NP,
 * so we write it by hand. See docs/04-design-system.md (DataFigure).
 */

/**
 * Format an integer with Indian/Nepali digit grouping.
 * 4250000 -> "42,50,000"  (last three digits, then pairs)
 */
export function groupLakh(n: number): string {
  const sign = n < 0 ? '-' : '';
  const digits = Math.round(Math.abs(n)).toString();
  if (digits.length <= 3) return sign + digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const withCommas = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return sign + withCommas + ',' + last3;
}

/** "NPR 42,50,000" — always with the currency label, ledger-style. */
export function formatNPR(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `NPR ${groupLakh(n)}`;
}

/** "AUD 3,200" — standard grouping for the foreign currency. */
export function formatAUD(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const s = Math.round(Math.abs(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `AUD ${n < 0 ? '-' : ''}${s}`;
}

/**
 * Relative time, in the given language.
 * ne: "२ घण्टा अघि"  en: "2 hours ago"
 */
const NE_DIGITS = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];

export function toNepaliDigits(input: string | number): string {
  return input.toString().replace(/\d/g, (d) => NE_DIGITS[Number(d)]);
}

export function relativeTime(iso: string, lang: 'ne' | 'en', now = Date.now()): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.floor((now - then) / 1000));
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (lang === 'ne') {
    if (secs < 60) return 'भर्खरै';
    if (mins < 60) return `${toNepaliDigits(mins)} मिनेट अघि`;
    if (hours < 24) return `${toNepaliDigits(hours)} घण्टा अघि`;
    return `${toNepaliDigits(days)} दिन अघि`;
  }
  if (secs < 60) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** Hours between an ISO timestamp and now — used for "Unanswered — 6h". */
export function hoursSince(iso: string, now = Date.now()): number {
  return (now - new Date(iso).getTime()) / 3_600_000;
}
