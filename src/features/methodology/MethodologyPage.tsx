import { useTranslation } from 'react-i18next';
import { PublicHeader } from '@/components/PublicHeader';

/*
 * How fit score, cost, visa odds, and PR pathway are computed — in plain
 * language, with the actual weights. Publishing this is part of the moat: a
 * competitor copying it must also publish commissions, which breaks their model.
 * See docs/05 §/methodology and docs/06.
 */
export function MethodologyPage() {
  const { t } = useTranslation();
  return (
    <div className="min-h-full bg-paper">
      <PublicHeader />
      <main className="mx-auto max-w-content px-s4 pb-s8 pt-s5">
        <h1 className="text-h1">{t('methodology.title')}</h1>
        <p className="mt-s3 text-body text-ink-soft">{t('methodology.intro')}</p>

        <Section title="Fit score (0–100)">
          <p>A weighted sum, each component scored 0–100:</p>
          <ul className="ml-s4 mt-s2 list-disc">
            <li>Academic headroom — 25%. How far your score clears the entry bar.</li>
            <li>Budget fit — 25%. 100 if the real total is within budget; falls to 0 at 1.4× budget.</li>
            <li>English fit — 15%. 100 at required + 0.5; 70 exactly at required; 0 below.</li>
            <li>Backlog tolerance — 10%. Scaled against the course's maximum.</li>
            <li>Gap tolerance — 10%. −15 per gap year; +20 back if the reason is work or study.</li>
            <li>PR alignment — 10%. Highest when on the skilled-occupation list and regional.</li>
            <li>Community — 5%. Scaled by the number of Nepali students already there.</li>
          </ul>
          <p className="mt-s2">Your chosen priority re-weights these. "Cheapest" lifts budget; "Best PR" lifts PR and community; "Best ranked" adds a ranking bonus.</p>
        </Section>

        <Section title="Real total cost">
          <p>Tuition + verified median living cost + health cover + visa fee + flights, converted to NPR at that day's rate with a realistic 2.5% forex spread. Living cost comes only from verified students. If a city has fewer than five verified data points, we show "Insufficient data" — we never substitute an understated official estimate.</p>
        </Section>

        <Section title="Visa odds">
          <p>Three bands only — High, Moderate, Low. Never a fake percentage. We start at Moderate and move a band for each real signal (explained gap, backlogs, budget coverage, collateral, field relevance, regional status). We always show the reasons, not just the band.</p>
        </Section>

        <Section title="PR pathway">
          <p>Yes when the occupation is on the skilled list and the course is regional or high-demand. Weak when it's on the list but metro and oversupplied. No when it isn't on the list. We state why.</p>
        </Section>

        <Section title="What we never do">
          <p>We never fabricate a number, never hide a commission, and never guarantee an outcome. Where we lack verified data, we say so.</p>
        </Section>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-s6">
      <h2 className="text-h2">{title}</h2>
      <div className="mt-s2 text-body text-ink-soft">{children}</div>
    </section>
  );
}
