# 06 — Shortlist Engine

Runs entirely in the `shortlist` Edge Function. Never client-side — the algorithm and commission data must not be tamperable.

## Contract

```ts
// input
{
  qualification: 'see' | 'plus2' | 'bachelors' | 'masters',
  score_pct: number,          // normalized to % even if GPA entered
  board: string,
  backlogs: number,
  gap_years: number,
  gap_reason?: 'worked'|'studied'|'family'|'health'|'reattempt'|'other',
  english_test?: 'ielts'|'pte'|'duolingo'|'toefl'|null,
  english_overall?: number,
  english_min_band?: number,
  budget_npr: number,
  has_collateral: boolean,
  field: string,
  priority: 'cheapest'|'pr'|'ranking'|'fastest'
}

// output
{
  share_slug: string,
  verdict: string,            // AI-written, honest
  confidence: 'none'|'low'|'medium'|'high',
  matches: UniversityResult[],     // 8-12
  rejections: RejectionResult[]    // 3-5
}
```

## Pipeline

```
1. Normalize input          (GPA→%, test scores→IELTS equivalent)
2. Hard filter              (eligibility gates)
3. Score each course        (fit 0-100)
4. Compute real cost NPR
5. Compute visa odds
6. Compute PR pathway
7. Attach commission        (required — else drop)
8. Rank by priority
9. Select rejections
10. Generate verdict        (Claude)
11. Freeze and store
```

---

## 1. Normalization

**GPA → percentage**

| Scale | Conversion |
|---|---|
| 4.0 GPA | `pct = gpa × 25` |
| TU/PU % | already % |
| NEB GPA (4.0) | `pct = gpa × 25` |

**Test → IELTS equivalent** (needed because courses store IELTS minimums)

| Test | Formula |
|---|---|
| PTE | `ielts ≈ 0.075 × pte + 1.0` (clamp 4.0-9.0) |
| TOEFL iBT | lookup table, standard ETS/IELTS concordance |
| Duolingo | `ielts ≈ 0.055 × det + 0.5` (clamp 4.0-9.0) |

If `english_test` is null: proceed, but every result carries `english_required` and the verdict must say the list is provisional.

---

## 2. Hard filters

Drop the course entirely if any fail:

```
course.min_gpa_pct       > input.score_pct
course.max_backlogs      < input.backlogs
course.min_ielts         > ielts_equiv        (skip if no test yet)
course.min_ielts_band    > input.english_min_band
university.commission_aud IS NULL
university.is_active     = false
course.field            != input.field        (unless field = 'other')
```

**`commission_aud IS NULL` drops the university.** Trust rule 2 enforced in the query, not in the UI. If we can't state what we earn, we don't show it.

---

## 3. Fit score (0-100)

Weighted sum, each component 0-100.

| Component | Weight | Logic |
|---|---|---|
| Academic headroom | 25 | `min(100, 50 + (score_pct − min_gpa_pct) × 3)` |
| Budget fit | 25 | `100` if total ≤ budget; falls linearly to 0 at 1.4× budget |
| English fit | 15 | `100` if ≥ required + 0.5; `70` if exactly required; `0` if below |
| Backlog tolerance | 10 | `100 × (1 − backlogs / max(1, course.max_backlogs))` |
| Gap tolerance | 10 | `100` if 0 gaps; `−15` per gap year; `+20` back if reason is `worked` or `studied` |
| PR alignment | 10 | `100` if on skilled occupation list AND regional; `60` if one; `20` if neither |
| Community | 5 | scaled `nepali_student_estimate`, capped |

**Priority modifier** applied after:

| Priority | Adjustment |
|---|---|
| `cheapest` | Budget weight → 40, academic → 15 |
| `pr` | PR weight → 30, community → 10, budget → 15 |
| `ranking` | Add `ranking_tier` bonus: go8 +15, mid +8, regional 0 |
| `fastest` | Bonus for nearest intake with a makeable deadline |

Round to integer. Always render a one-line plain reason next to it.

---

## 4. Real total cost (NPR)

The number consultancies never give honestly.

```
tuition_total   = course.annual_tuition_aud × (duration_months / 12)
living_total    = median_monthly_living_aud(city) × duration_months
oshc            = 650 × (duration_months / 12)      // AUD, approx, flag as estimate
visa_fee        = 1,600                              // AUD, Subclass 500
flights         = 900                                // AUD, one way + one return
forex_loss      = (subtotal_aud) × 0.025             // realistic bank spread

total_aud = tuition + living + oshc + visa + flights
total_npr = total_aud × npr_aud_rate × 1.025         // includes forex loss
```

**`median_monthly_living_aud(city)`** comes from `v_city_costs` — verified student submissions only.

**If `n < 5` for that city: return `confidence: 'none'` for cost.** Render "Insufficient data." Do not substitute an official university estimate — those are systematically understated and using them would violate trust rule 1.

`npr_aud_rate` refreshed daily, stored with the frozen result. A shared link shows the rate it was computed at.

---

## 5. Visa odds

**Three bands only: High / Moderate / Low.** Never a percentage — we don't have the sample size to justify one, and a fake precise number is worse than an honest band.

Start at Moderate. Apply modifiers:

| Signal | Effect |
|---|---|
| Gap years ≥ 3 with no `worked`/`studied` reason | −1 band |
| Backlogs ≥ 5 | −1 band |
| Budget < 80% of total cost | −1 band |
| No collateral and budget < total | −1 band |
| Course field unrelated to prior qualification | −1 band |
| University refusal rate high in `university_data_points` | −1 band |
| English ≥ required + 1.0 | +1 band |
| Prior qualification directly related | +1 band |
| Regional university | +1 band |

Clamp to the three bands. **Always render the reasons**, not just the band:

> *Moderate — your 2-year gap is explained by work, which helps. Your budget covers 91% of total cost, which officers will question.*

---

## 6. PR pathway

Australia-specific in V1.

| Result | Condition |
|---|---|
| **Yes** | `on_skilled_occupation_list` AND (`is_regional` OR field in high-demand list) |
| **Weak** | On the list but metro and oversupplied (accounting, business, IT generalist) |
| **No** | Not on the list |

Always state the reason: regional points, occupation list status, oversupply.

---

## 7. Commission

```
commission_aud = universities.commission_aud
commission_npr = commission_aud × npr_aud_rate
rebate_pct     = commission_ledger.rebate_pct
```

Rendered on every card via `CommissionRow`. Never collapsed, never behind a tooltip, never in small grey text.

If the ledger and the universities table disagree, **use the lower figure and log a data console warning.** Never overstate what we return, never understate what we take.

---

## 8. Ranking

Sort by fit score. Then diversity constraints so the list is usable, not five versions of the same thing:

- Max 2 courses per university
- At least 2 results under 80% of budget
- At least 1 regional if `priority = 'pr'`
- Return 8-12

---

## 9. Rejections — the marketing

Select 3-5 universities that pass the hard filters (so we'd genuinely earn from them) but score poorly. Prefer high-commission ones — the point lands harder.

Each rejection needs a concrete numeric reason:

| Trigger | Reason template |
|---|---|
| Cost > 1.3× budget | Loan repayment years, computed from median graduate salary |
| PR = No | "This course doesn't lead to PR. Here's what does." |
| Poor `would_choose_again` ratio | "Of N verified Nepali graduates, M said they wouldn't choose it again." |
| Visa odds Low | The specific profile mismatch |

**The commission being forgone must be stated in the rejection.** That's the whole point:

> *"Skip this one. NPR 62 lakh total, average graduate earns AUD 52K, loan repayment runs 11 years. We'd earn AUD 3,200 if you enrolled. Don't."*

---

## 10. Verdict generation

Single Claude call. Prompt in `07-ai-features.md`.

Inputs: normalized profile, top 3 matches, top 2 rejections, overall confidence.

Output: 3-5 sentences, plain, honest, names the biggest problem with the profile first.

**Constraints enforced by post-check:**
- No number appears that isn't in the computed input
- No banned words (guaranteed, assured, 100%, dream, unlock, seamless)
- Must state the weakest part of the profile
- If `confidence = 'none'` or `'low'`, must say the list is provisional

If the post-check fails, retry once, then fall back to a deterministic template. Never ship an unchecked AI verdict.

---

## 11. Freeze

Write the full computed output to `shortlist_runs.results` as jsonb, including the FX rate and every sample size.

**`/s/:slug` reads the frozen jsonb. Never recomputes.** A shared link must show what the sharer saw, even six months later when the data has changed.

---

## Confidence, overall

```
none    → any of: no city cost data, < 3 universities with data
low     → median data points across results < 5
medium  → 5-19
high    → 20+
```

Displayed in the header. Where it's `none` or `low`, the verdict says so explicitly.

---

## Data sources and honesty

| Field | Source | If missing |
|---|---|---|
| Tuition | Scraped from university sites, refreshed quarterly | Drop university |
| Living cost | `v_city_costs`, verified students only | "Insufficient data" |
| Commission | `commission_ledger` | Drop university |
| Visa outcomes | `university_data_points` from experience posts | Band without that modifier |
| Salaries | Community-reported, verified only | Omit the ROI line |
| Occupation list | Manually maintained from Home Affairs | Mark PR as "unknown" |

**The rule for every field: if we don't have it, say so. Never interpolate, never estimate, never round a guess into a number.**

One fabricated figure destroys the premise of the entire product.

---

## Rate limiting

Public endpoint that calls Claude. 10 runs per hour per IP, 50 per day. Return 429 with a plain message and a link to the community.
