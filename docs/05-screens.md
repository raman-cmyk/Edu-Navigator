# 05 — Screens

Every route. What renders, what data it needs, what each state looks like.

## Route map

```
PUBLIC
/                        Landing
/shortlist               Shortlist tool (7 steps)
/s/:slug                 Shortlist result (shareable, permanent)
/commissions             Public commission ledger
/methodology             How the shortlist is calculated
/c                       Community (read-only when logged out)
/c/:stage                Stage room
/city/:slug              City room
/p/:id                   Thread

AUTHED
/feed                    Home feed
/ask                     Composer
/search                  Search
/u/:handle               Profile
/me                      Own profile
/verify                  Verification flow
/notifications
/settings

ADMIN  (/admin/*)
/admin/verify            Verification queue
/admin/moderate          Moderation queue
/admin/friction          Friction log
/admin/data              Data console
```

---

# PUBLIC

## `/` — Landing

**Job:** convince a stranger in 8 seconds this isn't another consultancy site.

| Block | Content |
|---|---|
| Hero | Headline + one-line sub. Language toggle top-right. |
| Primary CTA | "Check my universities — free, no signup" → `/shortlist` |
| Secondary CTA | "See what students are saying" → `/c` |
| Proof strip | Live counts: verified students, students per city, questions answered this week. Pulled from real queries. |
| Live questions | 5 real threads from the feed with author badges visible |
| Transparency block | "We publish what universities pay us." → `/commissions` |

**Data:** `v_answer_rate`, verified count by city, 5 most recent answered posts.

**No:** stock photos, testimonial carousel, "98% success rate", partner university logos.

If the feed is dead, the landing page looks dead. That's intentional pressure.

---

## `/shortlist` — Shortlist tool

Seven steps, one question per screen. Trail Bar as progress. Back always available. State in `localStorage` under `shortlist_draft`.

| Step | Input | Helper text |
|---|---|---|
| 1 | Qualification (SEE/+2/Bachelor's/Master's) + % or GPA + board autocomplete | — |
| 2 | Backlogs, 0-20 | "Failed and re-sat subjects. Be honest — this changes everything." |
| 3 | Gap years + reason if >0 | "Gaps are fine if explained. Hiding them is what gets visas refused." |
| 4 | IELTS/PTE/Duolingo/TOEFL/Not taken + scores | "Not taken? We'll show what you'd need." |
| 5 | Budget NPR (slider + number) + collateral toggle | "What your family can actually arrange. Not what you hope." |
| 6 | Field of study | — |
| 7 | Priority (cheapest / best PR / best ranked / fastest) | — |

**Submit** → `POST /functions/v1/shortlist` → redirect to `/s/:slug`.

No email. No phone. No account. Any signup gate here kills the funnel.

Loading state: "Checking 40 universities against your profile." Under 8s or show progress.

---

## `/s/:slug` — Shortlist result

**The screenshot people send to their cousin.** Design accordingly.

### Header
- Profile summary, one line
- **Verdict** — AI-written honest paragraph, `--t-h2`, prominent
- Confidence: "Based on 47 verified Nepali students with similar profiles"

### University cards (8-12, ranked)

Cost breakdown expands: tuition, living, visa, flights, OSHC, forex loss.

Every figure carries its sample size. Where `confidence = none` → "Insufficient data", never a number.

### Rejection section — the marketing

Heading: **"We'd earn money if you applied here. Don't."**

3-5 cards, each with the commission being forgone and the plain reason.

### Footer
- "Ask the community about this" → `/ask` with `shortlist_run_id` pre-attached
- "Share this result" → copy permanent link
- "Talk to a human" → Phase 2 only, hidden until then
- "How we calculated this" → `/methodology`

**Results are frozen.** Read from `shortlist_runs.results`, never recompute. A shared link must show what the sharer saw.

---

## `/commissions` — Public ledger

Table: university, commission AUD, rebate %, effective date, note. Sortable. Anonymous-readable.

Intro paragraph explains why it exists. No defensiveness.

---

## `/methodology`

How fit score, cost, visa odds, and PR pathway are computed. Plain language, with the actual weights. Publishing this is part of the moat — a competitor copying it has to also publish commissions, which breaks their model.

---

## `/c` — Community, logged out

Full feed. Blur nothing, gate nothing. Content is the advertisement.

Login prompt appears only on: vote, comment, post, save.

---

# AUTHED

## `/feed` — Home

**Stage pills:** five. User's stage pre-selected from `profiles.stage`.

**Stage banner** — contextual nudge:
- Visa: "Visa questions get answered fastest between 8-10pm NPT."
- Landing: "You landed recently — 4 people in your city asked questions you could answer."

The Landing/Living banners drive reciprocity. That's how answer rate stays above 60%.

**Ranking:** see `03-architecture.md`. Unanswered questions under 24h get a 3× boost.

**Virtualize past 30 items.** Infinite scroll, 20 per page.

---

## `/c/:stage` — Stage room

Same card list, scoped. Sort tabs: **Hot · New · Unanswered**.

Pinned "Start here" post per stage, maintained by the community manager.

---

## `/city/:slug` — City room

Four only: `sydney`, `melbourne`, `adelaide`, `brisbane`.

| Block | Content |
|---|---|
| Header | City name, member count, verified breakdown |
| Cost panel | Median monthly living cost from `v_city_costs`. **Renders only when n ≥ 5.** Below that: "Not enough data yet — 3 people have shared costs." |
| Pinned | "City basics" — transport, Nepali grocery stores, temple, typical rents by suburb |
| Feed | City-scoped posts |
| Members | Filterable by university |

**Posting:** city-verified members only (RLS enforced). Everyone reads.

**Known launch gap:** rooms will be thin. Gold alumni who previously lived in a city should be allowed to post there.

---

## `/p/:id` — Thread

**Verified answers always render first.** Not sorted by votes — sorted by tier, then helpfulness, then time.

**Reply depth: one level.** No nesting beyond that, enforced in RLS.

**Locked reply box** for grey users — see `04-design-system.md`. Explanation, not a disabled field.

**AI summary** appears only past 15 answers. Collapsed by default. Labeled "Summary — generated, check the answers below." Links to the specific answers it drew from.

---

## `/ask` — Composer

Mode chosen up front: **Ask a question** (anyone) or **Share experience** (verified only).

### Ask
- Title (required, 10-200 chars)
- Body (optional)
- Stage (prefilled from profile)
- Tags: country + university autocomplete
- Attach shortlist result — one tap if one exists in localStorage
- **Anonymous toggle** — badge still shows, name hidden.

**Duplicate check:** as the title is typed (debounce 400ms), similar threads appear below via the search function.

### Share experience (verified only)
Body plus structured fields — these feed the shortlist tool:

- University, course, intake
- Total paid (NPR)
- Monthly living cost (AUD)
- Part-time hourly rate (AUD)
- Visa outcome + refusal reason
- Would you choose again? yes / no / unsure

**Tell users why:** "These numbers make the shortlist tool accurate for the next student."

---

## `/search`

Single natural-language input. Encourage full questions.

**Filters:** stage, country, university, city, tier, date. Toggle: "Only verified answers."

**Results:** AI summary at top (clearly labeled, with source links), then ranked threads.

**Ranking:** verified always outranks unverified. Gold 2023 beats grey yesterday.

**Empty state:** "Nobody's asked this yet. Ask it — 340 verified students will see it." + pre-filled composer.

---

## `/u/:handle` and `/me`

**Own:** badge status + what's needed for next tier, stage (editable), target country/unis, post history, helpfulness score, saved threads, contribution stat.

**Others':** badge, city, uni, year, answers sorted by helpfulness, "Ask [name] a question" — routes to a public post tagged to them, not a DM.

No DMs in V1. DMs are where agents go to sell.

---

## `/verify` — Verification flow

Four steps.

**1. Pick tier** — offer/visa → green; graduated abroad → gold; currently in a city → city tag (stacks).

**2. Upload** — camera or file. Accepts offer letter, visa grant, CoE, student ID, degree, transcript. City tag: utility bill, lease, addressed bank statement.

**3. Redaction preview** — sensitive regions auto-blurred client-side (passport number, address, financial figures) via canvas before upload. User confirms. `redaction_applied = true` is required by RLS.

**4. Review** — status visible in-app. Human reviews within 24h.

**On approval:** badge appears, welcome message, and immediately: "3 people in your city asked questions you can answer" → links to unanswered.

**On rejection:** exact reason, immediate resubmit. Never a dead end.

---

## `/notifications`

Grouped by day. Priority: "your question got a verified answer" is immediate Viber + in-app. Everything else batches.

---

## `/settings`

Language (ne/en) · stage · target country and universities · notification controls (granular, per kind, per channel) · privacy · data export · delete account · verification status.

Default notifications to **less**.

---

# ADMIN

## `/admin/verify`
Queue, oldest first, SLA countdown. Document viewer with redaction applied. Approve / Reject / Request more, with reason templates. Flags: duplicate document, name mismatch, suspected agent. **24h SLA.**

## `/admin/moderate`
Two rules enforced: agent posting as student → permanent orange; guaranteeing outcomes → removed. Everything else stays up.

## `/admin/friction`
Ops logs every manual task: type, student ref, minutes, note. Weekly rollup by task type. **This screen picks V2.**

## `/admin/data`
Shortlist accuracy, confidence by university, commission ledger editor, community health: answer rate, time-to-first-verified-answer, unanswered backlog.

---

# Cross-cutting states

Every screen needs all five defined before it's done:

| State | Requirement |
|---|---|
| Loading | Static `--sunk` block. No shimmer. |
| Empty | An invitation, never "no results" |
| Error | What happened + what to do. No apology. |
| Offline | "Reading works, posting will send when you're back." |
| Unverified | Explanation of the rule, not a disabled control |
