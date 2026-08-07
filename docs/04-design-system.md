# 04 — Design System

## Direction

The name is बाटो — *path*. The visual language comes from the thing that marks a path in Nepal: **the trail blaze**, the painted bar on rock that tells a trekker they're still on the route.

That gives the product its signature element and its logic. A student going abroad is on a route with marked stages. The interface marks them.

**What this is not:** not a startup landing page, not a consultancy website, not a Reddit clone. It should look like a field guide — practical, legible, quietly confident, printed to be read outdoors on a cheap phone.

**Deliberately avoided:** cream backgrounds with high-contrast serifs and terracotta accents; near-black with a single acid accent; broadsheet columns with hairline rules. All three are what an AI reaches for by default.

---

## Color

```css
:root {
  /* base */
  --ink:        #17202A;  /* deep slate — mountain rock in shadow */
  --ink-soft:   #3D4854;
  --stone:      #6E7681;  /* secondary text */
  --rule:       #E4E4DF;  /* hairlines */
  --paper:      #FAFAF7;  /* page — a hint of warmth, not cream */
  --surface:    #FFFFFF;  /* cards */
  --sunk:       #F1F1EC;  /* wells, inputs */

  /* signal — used sparingly, each has exactly one meaning */
  --blaze:      #D6402B;  /* UNANSWERED. nothing else. */
  --blaze-weak: #FBEAE7;
  --verified:   #B07D2B;  /* gold tier */
  --student:    #2F6F5E;  /* green tier */
  --agent:      #A56A2B;  /* agent label */
  --focus:      #2C5FA8;  /* keyboard focus only */
}
```

### Rules that make the palette work

**`--blaze` means one thing: an unanswered question.** Not errors, not CTAs, not badges, not alerts. Its power comes entirely from scarcity. If blaze appears on a button, the whole system collapses. (The one principled exception is the Trail Bar's *current* segment — the literal trail blaze mark that gives the product its name.)

Errors use `--ink` with a `--blaze` left border. Primary buttons are `--ink` on `--paper`. Destructive actions are `--ink` with an outline.

**Tier colors are only for badges.** `--verified`, `--student`, `--agent` never appear as backgrounds, buttons, or decoration.

### Dark mode
Not in V1. Ship light only. Revisit after month 6.

---

## The signature: Trail Bar

A five-segment horizontal bar. Filled segments are `--ink`, current is `--blaze`, unreached are `--rule`.

```
Deciding   Applying   Visa      Landing   Living
▓▓▓▓▓▓▓▓  ▓▓▓▓▓▓▓▓  ████████  ────────  ────────
```

Appears in three places, always meaning the same thing:
1. **Stage selector** on the feed — full size, interactive
2. **Post card** — 16px tall, showing which stage the post belongs to
3. **Shortlist tool** — repurposed as the 7-step progress indicator

Segments are 4px tall, 2px gap, fully square. No rounding — a painted mark on rock isn't rounded.

`prefers-reduced-motion`: no transition on segment change.

This is the one bold element. Everything else stays quiet.

---

## Typography

The bilingual requirement drives this. Devanagari and Latin must feel like one system, not a translation bolted on.

```css
:root {
  --font-display: 'Bricolage Grotesque', 'Mukta', system-ui, sans-serif;
  --font-body:    'Mukta', system-ui, sans-serif;
  --font-data:    'JetBrains Mono', ui-monospace, monospace;
}
```

**Mukta** is Devanagari-first with a matching Latin. Using it for body in both languages means a Nepali user and an English user see the same texture — not two different products.

**Bricolage Grotesque** carries Latin headlines. For Devanagari headlines, Mukta ExtraBold takes over via the `[lang="ne"]` selector.

**JetBrains Mono is reserved for money.** NPR totals, AUD commissions, hourly rates. A commission figure set in mono reads as a ledger entry, not a marketing number. That's the point.

### Scale

| Token | Size / line-height | Use |
|---|---|---|
| `--t-display` | 32/1.15 | Landing headline only |
| `--t-h1` | 24/1.25 | Screen titles |
| `--t-h2` | 19/1.3 | Section, post title |
| `--t-body` | 16/1.55 | Everything |
| `--t-small` | 14/1.5 | Meta, badges |
| `--t-micro` | 12/1.4 | Timestamps, counts |
| `--t-data` | 16/1.4 | Mono figures |

### Devanagari adjustments — required

Devanagari has taller ascenders, the shirorekha (head line), and deeper descenders. Latin metrics crush it.

```css
[lang="ne"] {
  --t-body: 17px;
  line-height: 1.75;      /* not 1.55 */
  letter-spacing: 0;      /* never track Devanagari */
}
```

**Never use `text-transform: uppercase`.** Devanagari has no case. Applying it produces nothing in Nepali and inconsistent UI between languages. Use weight and size for emphasis instead.

Font loading: subset both scripts, `font-display: swap`, total under 120KB. Devanagari subsetting is the single biggest bundle risk — check it in CI.

---

## Spacing & layout

4px base. `--s1: 4px` through `--s8: 48px`.

Mobile-first. **Test at 360px width.** That's a real device in Kathmandu, not an edge case.

| Breakpoint | Width | Layout |
|---|---|---|
| base | 360-767 | Single column, bottom nav |
| md | 768+ | Single column, wider gutters, top nav |
| lg | 1024+ | Feed + sidebar (city stats, unanswered queue) |

Content max-width 680px. Longer lines hurt on a text-heavy community.

Border radius: `--r-sm: 3px`, `--r-md: 6px`. Nothing rounder. Cards are near-square — this is a field guide, not a consumer social app.

Shadows: one only. `--shadow: 0 1px 2px rgba(23,32,42,.06)`. Elevation comes from `--rule` borders, not blur.

---

## Components

### Badge

The most-rendered component in the product. Gets its own careful spec.

```
[●] Gold · Melbourne · Deakin '24
```

- Dot: 6px square (not circle), tier color
- Text: `--t-small`, `--ink-soft`
- Separator: `·` with 4px margins
- Agent variant: full pill, `--agent` background at 12% opacity, `--agent` text, label reads "Agent" — never abbreviated, never subtle
- Grey variant: dot only, no text beyond name

**Agents must be unmistakable.** If a student has to look twice to notice, the badge failed.

### PostCard

```
┌────────────────────────────────────┐
│ ▓▓▓▓▓▓▓ ████ ──── ──── ────        │  trail bar, 16px
│ Sujata  [●] Gold · Melbourne       │
│                                    │
│ Will a 2-year gap kill my visa?    │  --t-h2
│ I worked at a bank after my bach…  │  --t-body, --stone, 2 lines
│                                    │
│ ⬤ Unanswered · 6h        ↑12  💬0  │  blaze if unanswered
└────────────────────────────────────┘
```

Unanswered state: 2px `--blaze` left border, blaze dot, blaze label. This is the only place blaze lives in the feed.

Answered state: "Answered by 3 verified" in `--student`.

### Locked reply box

The most important UI element in the product.

```
┌────────────────────────────────────┐
│  Anyone can ask. Only verified     │
│  students answer.                  │
│                                    │
│  [ Verify your status ]            │
└────────────────────────────────────┘
```

- `--sunk` background, `--rule` border, no input field rendered at all
- Copy is explanatory, never scolding
- Button is `--ink`, primary weight

Do not render a disabled textarea. A disabled input reads as a bug; an explanation reads as a rule.

### DataFigure

For money. Mono, with confidence attached.

```
NPR 42,50,000        ← --font-data
Based on 12 verified students   ← --t-micro, --stone
```

If confidence is `none`:
```
Insufficient data
We don't have enough verified Nepali student data on this university yet.
```

**Never render a number without its sample size.** This component enforces trust rule 1 in the UI layer.

NPR formatting uses lakh/crore grouping (`42,50,000`), not Western grouping (`4,250,000`). Write the formatter; `Intl` won't do this correctly for `en-NP`.

### CommissionRow

Always visible on every university card. Never collapsed, never behind a tooltip.

```
What we earn if you enrol here    AUD 3,200  ·  NPR 2,84,000
```

Set in `--font-data`, `--ink`, normal weight. Not small, not grey, not apologetic. The whole thesis is that this number is stated plainly.

### Empty states

Never "No results." Always an invitation.

| Screen | Copy |
|---|---|
| Search | "Nobody's asked this yet. Ask it — 340 verified students will see it." + composer |
| City room | "Only 12 people here so far. Post something and the room starts." |
| Feed | "Nothing in this stage yet." + link to a stage with activity |
| Notifications | "Nothing yet. When someone answers your question, it shows here." |

### Errors

State what happened and what to do. No apology, no vagueness, no exclamation marks.

> "That document didn't upload. It needs to be under 10MB and a JPG, PNG, or PDF. Try again."

Not: "Oops! Something went wrong. Please try again later."

---

## Motion

Minimal. This is a utility read on slow connections.

| Element | Motion |
|---|---|
| Trail bar segment change | 180ms ease-out fill |
| Card tap | 80ms scale to 0.99 |
| New unanswered post arriving | Single blaze pulse, once, 400ms |
| Page transition | None. Instant. |

`prefers-reduced-motion: reduce` → all of it off.

No skeleton shimmer. Use a static `--sunk` block. Shimmer costs frames on cheap Android.

---

## Accessibility floor

Not optional, not a later ticket.

- Contrast: 4.5:1 body, 3:1 large text. `--stone` on `--paper` is 4.6:1 — verified.
- Visible keyboard focus everywhere: 2px `--focus` outline, 2px offset
- Touch targets 44×44 minimum
- Every icon-only button has `aria-label`, translated
- `lang` attribute switches with the language toggle — screen readers need it for Devanagari
- Badges are not color-only: tier is always spelled out in text

---

## Voice

Plain, direct, no marketing register. Nepali translation is the primary voice — English follows it, not the other way around.

| Do | Don't |
|---|---|
| "Verify your status" | "Unlock your full potential" |
| "We earn AUD 3,200 if you enrol here" | "Trusted partner university" |
| "Don't apply here. Here's why." | "May not be the best fit" |
| "Insufficient data" | "Approximately NPR 40 lakh" |
| "That document didn't upload" | "Oops! Something went wrong" |

Buttons say what happens. "Publish" produces "Published." Same word through the whole flow.

Never: guaranteed, assured, 100%, dream, journey (as marketing), unlock, empower, seamless.
