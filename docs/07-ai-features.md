# 07 — AI Features

Four AI features in V1. All run in Edge Functions. **The Claude API key never touches the client.**

| Feature | Model | Frequency |
|---|---|---|
| Shortlist verdict | Sonnet | Per shortlist run |
| Search summary | Haiku | Per search |
| Thread summary | Haiku | Threads > 15 answers, cached |
| Moderation check | Haiku | Every post/answer insert |

Not in V1: SOP generation, visa interview simulation, document OCR, chatbot counselor, auto-translation on load.

---

## Universal rules

Applied to every AI output in the product.

### Banned output
No AI response may contain: `guaranteed`, `assured`, `100%`, `definitely will`, `certain to`, `dream`, `unlock`, `empower`, `seamless`, `journey` (as marketing).

Post-check with a regex list. On hit: retry once with the violation named, then fall back to a deterministic template. **Never ship an unchecked output.**

### No invented numbers
Any figure in AI output must exist in the structured input passed to it. Post-check: extract all numerals from the output, assert each appears in the input payload. On failure, retry once, then template.

This is trust rule 1 enforced mechanically.

### Always labeled
Every AI-generated block renders with a visible label and, where applicable, links to its sources. Never presented as a human answer.

### Language
Generate in the user's `lang`. For `ne`, generate directly in Nepali — do not generate English and translate.

---

## 1. Shortlist verdict

**Model:** Sonnet. Worth the cost — this is the output people screenshot.

**System prompt:**

```
You write honest university assessments for Nepali students going abroad.

Your job is to tell the student the truth about their profile, even when
it's discouraging. Consultancies in Nepal lie to these students to earn
commission. You do not.

Rules:
- Lead with the biggest problem in their profile. Do not soften it.
- Use only numbers present in the data given to you. Invent nothing.
- If confidence is 'none' or 'low', say the list is provisional and why.
- Plain language. The reader's English may be their second language.
- 3-5 sentences. No headings, no bullets, no preamble.
- Never promise or predict a visa outcome.
- Never use: guaranteed, assured, 100%, dream, unlock, empower, seamless.
- Do not congratulate, encourage, or motivate. State the situation.

You are not selling anything. Baato earns commission from these
universities and publishes the amount. Write as if the student can see
exactly what we earn — because they can.
```

**User message:** JSON of normalized profile, top 3 matches with fit/cost/visa/PR, top 2 rejections with commission, overall confidence.

**Post-checks:**
- Banned words → retry, then template
- Numbers not in input → retry, then template
- Must reference the weakest profile component → retry
- 3-5 sentences → truncate

**Fallback template:**
```
Your profile is {strength} for {country}. The main constraint is
{weakest_component}. Based on {n} verified students, your realistic
total cost is {cost}. {confidence_note}
```

---

## 2. Search summary

**Model:** Haiku. High volume, low complexity.

**System prompt:**

```
Summarize what verified Nepali students have said about this question.

Rules:
- Only use the provided threads. Add nothing from your own knowledge.
- Cite by thread number: [1], [2]. Every claim needs a citation.
- Where verified students disagree, say so. Do not pick a side.
- If the threads don't actually answer the question, say that plainly
  and suggest the student ask it.
- 2-4 sentences. Plain language.
- Never promise or predict a visa outcome.
```

**Rendering:** labeled "Summary — generated from N threads", with source links. Human answers always render below it.

**Cache:** hash of `query + top_thread_ids`, 24h TTL.

---

## 3. Thread summary

**Model:** Haiku. Triggered when a thread passes 15 answers.

**System prompt:**

```
Summarize this discussion for someone arriving late.

Rules:
- Separate what verified students agree on from what they disagree on.
- Attribute by answer number: [3], [7].
- Do not resolve disagreements. Present both.
- Do not include unverified comments.
- 3-5 sentences.
- Never promise or predict a visa outcome.
```

Cached on `post_id + answer_count`. Regenerates every 10 new answers.

Collapsed by default. Label: "Summary — generated, check the answers below."

---

## 4. Moderation check

**Model:** Haiku. Runs on every post and answer insert via DB webhook.

Enforces exactly two rules. Nothing else.

**System prompt:**

```
Check this post against two rules.

RULE 1 — Outcome guarantee
Flag if it promises or guarantees a visa, admission, PR, or job outcome.
"I got mine approved in 3 weeks" is fine — that's experience.
"You will definitely get approved" is a violation.
"Apply through us, visa guaranteed" is a violation.

RULE 2 — Agent posing as student
Flag if it reads as commercial promotion of a consultancy or service:
contact details, service offers, "DM me for guidance", pricing.
A student sharing their own consultancy's bad behaviour is NOT a violation.

Return JSON only:
{"rule1": bool, "rule2": bool, "confidence": "low"|"medium"|"high",
 "quote": "the specific text that triggered it, or null"}

Everything else is allowed. Anger, criticism of universities, saying
going abroad was a mistake, negative reviews, failure stories — all
allowed. Do not flag them.
```

**Handling:**

| Result | Action |
|---|---|
| `rule1` high confidence | Auto-remove, notify author with the quote, allow edit + resubmit |
| `rule1` low/medium | Queue for human review, post stays up |
| `rule2` any confidence | Queue for human review, post stays up |
| Neither | No action |

**Never auto-label someone an agent.** A human decides. AI only queues it.

**Never auto-remove for rule 2.** False positives would silence exactly the honesty the product exists for.

---

## Embeddings

`text-embedding-3-small` (1536 dims) or equivalent. Backfilled every 5 minutes by the `embed` function for posts with `embedding is null`.

Embed `title + body` truncated to 8000 chars.

---

## Cost control

Under $200/month at target scale. Rate limit the public shortlist endpoint (10/hr/IP). Alert at 2× the 7-day average daily spend.

---

## Failure handling

AI is never load-bearing. Every feature degrades cleanly:

| Feature | If Claude is down |
|---|---|
| Shortlist verdict | Deterministic template. Scores and costs still compute. |
| Search summary | Omit the block. Ranked results still render. |
| Thread summary | Omit. Answers still render. |
| Moderation | Queue everything for human review. Posts stay up. |

The product works without AI. It's better with it.

---

## What is deliberately not AI

| Thing | Why not AI |
|---|---|
| Fit score, cost, visa odds, PR pathway | Deterministic. Must be auditable and published on `/methodology`. |
| Verification review | Human. It's the trust bottleneck. |
| Agent labeling | Human. Permanent and reputational. |
| Ranking | Deterministic formula. Published. |

The AI writes prose. It does not make judgments that affect a student's money or a member's reputation.
