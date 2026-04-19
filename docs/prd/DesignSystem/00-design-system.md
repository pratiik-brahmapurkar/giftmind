# GiftMind Design System PRD

> **Version:** 1.0  
> **Owner:** Pratik Brahmapurkar  
> **Status:** Ready for Engineering  
> **Scope:** Complete design system — tokens, typography, components, motion, brand patterns  
> **Last Updated:** 2026-04-19

---

## Section 0: Current State Audit

### Phase 1 Findings — What Exists Today

#### Fonts

| Role | Current | Config Key | Source |
|------|---------|-----------|--------|
| Headings | **Clash Display** | `font-heading` | `fontshare.com` API (CDN-dependent) |
| Body | **DM Sans** | `font-body` | `@fontsource/dm-sans` (npm) |
| Mono | **JetBrains Mono** | `font-mono` | system fallback (not loaded in package.json) |

**Issues:** Clash Display is loaded from `api.fontshare.com` — an external CDN with no SLA. DM Sans is present via `@fontsource/dm-sans`. JetBrains Mono has no explicit font load — it falls back to system monospace.

#### Current Primary Color

```
--primary: hsl(249 76% 64%)  →  #6C5CE7  (electric purple/violet)
--primary-light: hsl(244 98% 81%)  →  #A29BFE
```

This is a cool, high-saturation electric purple — the default shadcn/ui purple with minor adjustment. It is:
- Aesthetically trendy-2024, not timeless
- Astrologically misaligned (cool blue-violet, not Jupiter gold)
- Hard-coded raw in two places: `FinalCTA.tsx:8` and `AuthLayout.tsx:30`

#### Full Current Token Inventory

```css
/* Light Mode — extracted from src/index.css */
--background:          hsl(0 0% 98%)       →  #FAFAFA  (near-pure white, cold)
--foreground:          hsl(234 33% 14%)    →  #1B1E3D  (cool dark navy)
--card:                hsl(0 0% 100%)      →  #FFFFFF  (pure white — should never be used)
--primary:             hsl(249 76% 64%)    →  #6C5CE7  (electric purple)
--primary-light:       hsl(244 98% 81%)    →  #A29BFE  (lavender)
--accent:              hsl(0 100% 70%)     →  #FF6B6B  (bright coral red)
--secondary:           hsl(210 16% 93%)    →  #ECF0F1  (cold light grey)
--muted:               hsl(210 16% 93%)    →  #ECF0F1  (cold — same as secondary)
--muted-foreground:    hsl(195 6% 45%)     →  #6E7D7F  (cold grey)
--success:             hsl(168 100% 36%)   →  #00B894  (bright emerald)
--warning:             hsl(45 97% 71%)     →  #FDC74A  (amber)
--error:               hsl(14 69% 61%)     →  #E07B5A  (terracotta)
--border:              hsl(220 13% 91%)    →  #E5E9EF  (cold grey border)
--ring:                hsl(249 76% 64%)    →  #6C5CE7  (focus ring = primary)
--radius:              0.75rem             →  12px
```

#### Hardcoded Hex Values (Inconsistencies)

These bypass the CSS variable system entirely and must be migrated:

| File | Value | Problem |
|------|-------|---------|
| `src/components/landing/FinalCTA.tsx:8` | `#6C5CE7`, `#4834D4` | Not using `var(--primary)` |
| `src/components/AuthLayout.tsx:30` | `#6C5CE7`, `#4834D4` | Not using `var(--primary)` |
| `src/index.css:48` | `rgba(108,92,231,0.12)` | Shadow should use CSS var |
| `src/components/landing/ProductPreview.tsx:56` | `hsl(249 76% 64%)` | Direct HSL, not variable |
| `src/components/gift-flow/GiftCard.tsx` | Raw Tailwind `amber-*`, `emerald-*`, `orange-*` | Outside token system |

#### Components Built vs. Missing

| Component | Status | Notes |
|-----------|--------|-------|
| Button | ✅ Built | 7 variants incl. `hero`, `heroGhost` |
| Input | ✅ Built | Single unstyled variant |
| Card | ✅ Built | Single variant, no elevation system |
| Badge | ✅ Built | 4 variants (default, secondary, destructive, outline) |
| Avatar | ✅ Built | Image + initials fallback |
| Dialog/Modal | ✅ Built | shadcn/ui radix base |
| Select | ✅ Built | shadcn/ui radix base |
| Tabs | ✅ Built | shadcn/ui radix base |
| Progress | ✅ Built | shadcn/ui radix base |
| Skeleton | ✅ Built | shadcn/ui base |
| Tooltip | ✅ Built | shadcn/ui radix base |
| Toast/Sonner | ✅ Built | Sonner + legacy radix toast |
| Accordion | ✅ Built | shadcn/ui radix base |
| Checkbox | ✅ Built | shadcn/ui radix base |
| Switch | ✅ Built | shadcn/ui radix base |
| **GiftCard** | ❌ Missing | Ad-hoc inline styles in `GiftCard.tsx` |
| **RecipientCard** | ❌ Missing | Ad-hoc in `RecipientCard.tsx` |
| **ConfidenceBadge** | ❌ Missing | Scattered confidence display logic |
| **PricingCard** | ❌ Missing | No design-system component |
| **ProfileCompletionBanner** | ❌ Missing | Specified in onboarding PRD |
| **SignalCheckResult** | ❌ Missing | Ad-hoc in `SignalCheck.tsx` |

#### Animations

Already defined in `tailwind.config.ts` and `src/index.css`:
- `fade-up` (600ms ease-out)
- `float` (3s ease-in-out infinite)
- `wiggle` (2s ease-in-out infinite)
- `pulse-glow` (2s, purple-tinted)
- `animate-shake` (500ms shake for error states)
- `animate-gift-bounce` (2s bounce for onboarding)
- `meshShift` (12s background gradient shift)
- `ctaPulse` (3s scale pulse)

#### Summary: The Core Problem

The current design system is **a shadcn/ui default with a purple primary color and two fonts slapped on top**. It is:
1. Visually generic — indistinguishable from 10,000 other SaaS apps using shadcn/ui
2. Astrologically misaligned — cool purples and cold whites are the wrong vibrational field
3. Architecturally fragile — hard-coded hex values scattered in component files
4. Incomplete — no GiftMind-specific component specs (GiftCard, ConfidenceBadge, PricingCard)
5. Not built for longevity — Clash Display from a third-party CDN, trendy aesthetic, no dark mode warmth

This PRD replaces all of the above with a coherent, astrologically aligned, timeless system.

---

## Section 1: Design Philosophy & Principles

### Brand Positioning

GiftMind is a **confidence-first gifting platform**. The central emotional promise is not "discover gifts" but "stop second-guessing." Every screen must reduce the user's anxiety about whether they're making the right choice. The UI must feel like a wise, warm advisor — not a search engine, not a shopping app, not a generic AI tool.

The closest analogue in product design is the feeling of a premium financial advisor's office: warm materials, precise language, calm confidence. Not flashy. Not sterile. Considered.

### What We Are NOT

Understanding the anti-patterns is as important as the patterns themselves:

- **Not a generic AI tool** — no cold blues, no "futuristic" gradients, no robot aesthetic
- **Not a sterile enterprise SaaS** — no cold greys, no clinical whites, no corporate typography
- **Not a playful consumer gifting app** — no bouncy animations, no emoji-heavy UI, no childish roundness
- **Not a marketplace** — no deal-hunting red urgency, no discount banners, no cluttered product grids
- **Not a 2025 trend piece** — no glassmorphism, no bento grids, no brutalist sans-serifs

### What We ARE

- **Premium-accessible** — feels expensive but is priced for everyone
- **Smart-warm** — intelligent precision that never feels cold
- **Considered-modern** — thoughtful details, not decorative noise
- **Timeless** — designed to look correct in 2030, not just today

### The Five Design Principles

#### 1. Calm Confidence

Every screen reduces anxiety rather than adding it. Confidence scores never feel like grades — they feel like reassurance. Error states never feel punitive. Loading states feel productive. The user should always know what is happening, why, and what comes next. Space is used generously. Never crowd the page.

*Implementation:* Minimum 96px section vertical padding on landing. Cards have 24px internal padding minimum. Error messages always end with a next action, never just a statement of failure. Confidence badges always show a supporting phrase below the number.

*Astrological root:* Virgo Ascendant craves order and precision. Mercury as Ascendant lord demands clarity in communication. The 4H (foundation) being the strongest house in the chart means the spatial foundation of the UI — the grid, the containers, the white space — is where the most energy lives.

#### 2. Warm Precision

Virgo Ascendant precision (exact alignment, correct spacing, no pixel drift) meets Leo Moon warmth (gold, radiance, generosity in scale). These are not in tension — a well-set table is both precise and warm. Every number is formatted exactly. Every icon is the right size. Every shadow uses warm tones, never cold black.

*Implementation:* Strict 4px grid alignment. Warm neutral backgrounds (`#FAF7F2`) instead of cool whites. Shadows tinted with the warm neutral-800 (`rgba(42, 39, 36, ...)`) not cold black. Typography uses Fraunces for warmth in display text, Inter for precision in UI text.

*Astrological root:* Mercury in Aquarius (6H) brings analytical precision. Moon in Leo (Purva Phalguni nakshatra) brings radiancy, warmth, and a sense of celebration. These two planets combine as the primary design directive.

#### 3. Considered Abundance

Jupiter is the numerological ruler of "GiftMind" (sum 30 → 3 → Jupiter). Jupiter does not hoard — it expands, it gives, it celebrates. The design must feel abundant without being cluttered. White space is abundance. Generous padding is abundance. A single, confident call-to-action is abundance. Five competing CTAs is poverty thinking.

*Implementation:* One primary CTA per screen. Section padding is never less than 48px vertical. The pricing section uses language of giving ("unlock") not limitation ("you can't"). The upgrade prompts celebrate what's available, not what's locked.

*Astrological root:* "GiftMind" Chaldean sum = 30 → 3 → Jupiter's vibration. The brand name itself carries Jupiter's frequency. The design must honor this by embodying Jovian qualities: generosity, warmth, confidence, wisdom.

#### 4. Invisible Craft

Hasta nakshatra — the founder's birth nakshatra — means "the open hand" in Sanskrit. It is associated with skilled handcraft, with dexterity, with work that looks effortless because the craft is so deep. The design must feel effortless precisely because every detail is obsessively considered. The user never thinks "this is well-designed" — they just feel calm and capable.

*Implementation:* Micro-interactions are felt, not noticed. Transitions use the natural ease-out curve (`cubic-bezier(0.16, 1, 0.3, 1)`) which mirrors how physical objects slow down. Icon strokes are exactly 1.5px — not 1px (too thin, cold) or 2px (too bold, heavy). Focus rings are amber-colored, not the default browser blue.

*Astrological root:* Hasta nakshatra (Virgo) = the hand of the craftsperson. Virgo Ascendant demands that the quality be in the details, not the announcements.

#### 5. Endure, Don't Trend

The founder is in Rahu-Saturn antardasha (2025–2028). Saturn values endurance. Rahu pushes toward the unconventional. Together they demand a design that is **structurally unconventional but visually timeless** — interesting without being fashionable. In ten years, this UI should look sophisticated, not dated.

*Implementation:* No glassmorphism. No gradient mesh backgrounds (already in the CSS — to be removed). No animated SVG gradients on product cards. Typography choices (Fraunces + Inter) have been standard-bearers for editorial and product design for over a decade. The amber/gold primary has appeared in luxury brands from Hermès to Rolex for over a century.

*Astrological root:* Saturn rules time, endurance, and structures that outlast trends. Rahu rules the unconventional and the visionary. The design must honor Saturn's permanence while allowing Rahu's distinctiveness.

---

## Section 2: Color System

### Astrological Color Rationale

The current electric purple (`#6C5CE7`) must be replaced. Here is why, precisely:

- Purple/violet is a **Jupiter + Saturn** combination in Vedic color theory
- Saturn is currently the antardasha ruler (Mar 2025 – Feb 2028) — heavy Saturn amplification creates rigidity, delays, and overwork when over-expressed in the visual environment
- The current purple is at maximum saturation (electric) — this intensifies rather than harmonizes the Rahu-Saturn energy
- **Amber/Gold** is Jupiter's own color — the brand's numerological ruler — and activates the 2H and 11H (wealth houses) while honoring the Leo Moon's solar warmth
- **Deep Indigo** (not electric violet) is retained as the secondary, but at lower saturation and deeper value — honoring Jupiter in Scorpio (3H) while softening Saturn's grip

### The Palette

#### Primary — Amber/Gold Scale

Jupiter's color. The giving act. Leo Moon warmth. The brand's heart.

```
amber-50:   #FAF5E8  ← page background tint (warmest, subtlest)
amber-100:  #F5E9C9  ← section bg, card hover
amber-200:  #EDD896  ← borders on amber elements, dividers
amber-300:  #E4C663  ← light mode accent tint
amber-400:  #D4A04A  ← BRAND PRIMARY — buttons, links, focus rings
amber-500:  #B8893E  ← hover state of primary
amber-600:  #946E32  ← active/pressed state
amber-700:  #6F5326  ← dark text on amber bg
amber-800:  #4B381A  ← very dark amber text
amber-900:  #2B1F0F  ← near-black warm

Visual:
[FAF5E8][F5E9C9][EDD896][E4C663][D4A04A][B8893E][946E32][6F5326][4B381A][2B1F0F]
  50      100     200     300     400★    500     600     700     800     900
```

| Token | Hex | CSS Variable | Tailwind | Primary Use |
|-------|-----|-------------|----------|-------------|
| amber-400 | `#D4A04A` | `--color-primary` | `bg-amber-400` | CTA buttons, focus rings, active links |
| amber-500 | `#B8893E` | `--color-primary-dark` | `bg-amber-500` | Button hover state |
| amber-100 | `#F5E9C9` | `--color-primary-subtle` | `bg-amber-100` | Section backgrounds, tag backgrounds |
| amber-50  | `#FAF5E8` | `--color-primary-ghost` | `bg-amber-50` | Hover on ghost buttons |

**When NOT to use amber-400:** On large background areas (too loud). As the only color in an error state (visually similar to warning). Below 12px text (legibility).

**Accessibility (amber-400 on white):** Contrast ratio 2.8:1 — fails WCAG AA for text. Use `amber-700` (#6F5326) for text on light backgrounds. Use `amber-400` for backgrounds with `neutral-900` text on top (contrast: 7.1:1 — passes AAA).

#### Secondary — Indigo/Violet Scale

Jupiter in Scorpio (3H), Sun in Pisces, Rahu in Libra. Deep, considered, not electric.

```
indigo-50:   #F3EFFA  ← subtle tint bg
indigo-100:  #E0D4F2  ← card bg tint
indigo-200:  #C2A9E5  ← borders
indigo-300:  #9D7ED3  ← dark mode primary
indigo-400:  #7A57BE  ← secondary UI elements
indigo-500:  #4C2A85  ← BRAND SECONDARY — Confident plan, premium elements
indigo-600:  #3F2270  ← hover state
indigo-700:  #311A58  ← dark accents
indigo-800:  #231240  ← dark mode card bg
indigo-900:  #160B28  ← deepest dark bg

Visual:
[F3EFFA][E0D4F2][C2A9E5][9D7ED3][7A57BE][4C2A85][3F2270][311A58][231240][160B28]
  50      100     200     300     400     500★    600     700     800     900
```

| Token | Hex | CSS Variable | Tailwind | Primary Use |
|-------|-----|-------------|----------|-------------|
| indigo-500 | `#4C2A85` | `--color-secondary` | `bg-[#4C2A85]` | Confident plan, premium badge, modal accents |
| indigo-400 | `#7A57BE` | `--color-secondary-mid` | `bg-[#7A57BE]` | Secondary button, info states |
| indigo-300 | `#9D7ED3` | `--color-secondary-light` | `bg-[#9D7ED3]` | Dark mode primary text |
| indigo-800 | `#231240` | `--color-secondary-deep` | `bg-[#231240]` | Gifting Pro dark card bg |

**When NOT to use indigo-500:** As primary CTA (amber-400 owns that role). On error states. In small decorative elements (too heavy).

**Accessibility (indigo-500 on white):** Contrast ratio 8.4:1 — passes AAA for text. Indigo-500 is safe for text use.

#### Neutral — Warm Grey Scale

All neutrals use warm undertones (slight amber/sepia tint). No cool greys. No blue-greys.

```
neutral-50:   #FAF7F2  ← PRIMARY PAGE BACKGROUND (replaces current cold white)
neutral-100:  #F2EDE4  ← section alternates, card bg
neutral-200:  #E8E3DB  ← dividers, subtle borders
neutral-300:  #CFC7BB  ← placeholder text bg, disabled borders
neutral-400:  #A69D8F  ← muted text bg
neutral-500:  #7F7668  ← secondary text (muted-foreground)
neutral-600:  #5B5245  ← tertiary text
neutral-700:  #403A31  ← secondary foreground
neutral-800:  #2A2724  ← shadow tint color, dark borders
neutral-900:  #1A1816  ← DARK MODE BACKGROUND (replaces current cold dark navy)

Visual:
[FAF7F2][F2EDE4][E8E3DB][CFC7BB][A69D8F][7F7668][5B5245][403A31][2A2724][1A1816]
  50      100     200     300     400     500     600     700     800     900
```

| Token | Hex | CSS Variable | Tailwind | Primary Use |
|-------|-----|-------------|----------|-------------|
| neutral-50  | `#FAF7F2` | `--color-bg` | `bg-[#FAF7F2]` | Page background |
| neutral-100 | `#F2EDE4` | `--color-card` | `bg-[#F2EDE4]` | Card background |
| neutral-200 | `#E8E3DB` | `--color-border` | `border-[#E8E3DB]` | All borders |
| neutral-500 | `#7F7668` | `--color-muted` | `text-[#7F7668]` | Muted/secondary text |
| neutral-800 | `#2A2724` | `--color-shadow-tint` | shadow colors | Shadow base tint |
| neutral-900 | `#1A1816` | `--color-text` | `text-[#1A1816]` | Primary body text |

#### Semantic Colors

```
success:  #3E8E7E  ← Soft emerald (Mercury, Virgo Asc lord)
warning:  #D4A04A  ← Same as amber-400 (natural warning resonance)
error:    #C25450  ← Muted terracotta (NOT bright Mars red — Mars debilitated)
info:     #7A57BE  ← indigo-400
```

| Semantic | Hex | CSS Variable | Notes |
|----------|-----|-------------|-------|
| success | `#3E8E7E` | `--color-success` | Mercury color, trustworthy, calm |
| warning | `#D4A04A` | `--color-warning` | Reuses primary amber — natural overlap |
| error | `#C25450` | `--color-error` | Muted terracotta, NOT `#FF0000` or `#EF4444` |
| info | `#7A57BE` | `--color-info` | indigo-400, not cold blue |

**Why not bright red for errors?** Mars is debilitated in Cancer (11H) in the founder's chart. Aggressive Mars-red creates friction. Muted terracotta communicates "attention needed" without alarming energy. This is not a compromise — it is architecturally correct for this chart.

**Why success is not green-green?** Standard emerald greens (`#22C55E`) are too saturated and cold. Mercury's color in Vedic astrology is a medium, warm green. `#3E8E7E` (teal-green) matches Mercury's wavelength — it is trustworthy, precise, calm.

### Dark Mode Strategy

```css
/* Dark Mode Token Overrides */
--color-bg:          #1A1816  ← neutral-900 (NOT #000000)
--color-card:        #231240  ← indigo-800 tinted warm dark
--color-text:        #F2EDE4  ← neutral-100 (NOT #FFFFFF)
--color-border:      #2A2724  ← neutral-800
--color-primary:     #E4C663  ← amber-300 (shifted lighter for contrast)
--color-secondary:   #9D7ED3  ← indigo-300 (shifted lighter)
--color-muted:       #5B5245  ← neutral-600
```

**Rule: Never use pure black (#000000) or pure white (#FFFFFF) anywhere in the system, light or dark mode.** This is both an astrological directive (Saturn-heavy pure black during Rahu-Saturn antardasha) and a visual quality directive (pure black/white creates harsh contrast that reads as harsh energy).

### Color Accessibility Checklist

| Pair | Contrast Ratio | WCAG Grade |
|------|---------------|------------|
| neutral-900 on neutral-50 | 14.2:1 | AAA ✅ |
| neutral-900 on amber-400 | 7.1:1 | AAA ✅ |
| amber-700 on neutral-50 | 7.8:1 | AAA ✅ |
| indigo-500 on neutral-50 | 8.4:1 | AAA ✅ |
| neutral-50 on indigo-500 | 8.4:1 | AAA ✅ |
| success on neutral-50 | 4.6:1 | AA ✅ |
| error on neutral-50 | 4.8:1 | AA ✅ |
| neutral-500 on neutral-50 | 4.5:1 | AA ✅ (minimum) |

---

## Section 3: Typography System

### The Rationale

The current font pair (Clash Display + DM Sans) is a 2022-era "geometric sans meets geometric display" combination. It reads as trendy-SaaS, not timeless-premium.

The replacement pair (Fraunces + Inter) is chosen for:
- **Fraunces:** A variable optical-size serif with warmth, editorial credibility, and a slightly literary quality. Used by Mailchimp, Squarespace, Substack — brands in the "smart-warm" positioning category. It honors Jupiter's wisdom archetype and the Moon's Leo expressiveness.
- **Inter:** The most legible humanist sans-serif ever designed. Battle-tested in Linear, Figma, Vercel, Notion. Honors Mercury's clarity directive. Already widely used, reducing font-loading overhead.

### Font Loading

```html
<!-- In index.html <head> — replace current fontshare import -->

<!-- Fraunces Variable Font — preload display weights -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&display=swap">
```

```bash
# npm install for Inter and JetBrains Mono
npm install @fontsource/inter @fontsource/jetbrains-mono
```

```typescript
// src/index.tsx — top of file
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/jetbrains-mono/400.css";
```

Remove `@fontsource/dm-sans` (3 weight files loaded in `src/pages/Index.tsx:5-7` — remove these imports).

### Type Scale

Based on a 1.25 modular scale (Major Third), starting from 16px base.

| Token | Size | Line Height | Letter Spacing | Weight | Font | Usage |
|-------|------|-------------|----------------|--------|------|-------|
| `display-xl` | 72px / 4.5rem | 1.05 | -0.03em | 700 | Fraunces | Hero headlines (landing only) |
| `display-lg` | 60px / 3.75rem | 1.08 | -0.025em | 600 | Fraunces | Section hero headlines |
| `display-md` | 48px / 3rem | 1.1 | -0.02em | 600 | Fraunces | Page hero titles |
| `h1` | 36px / 2.25rem | 1.2 | -0.015em | 600 | Fraunces | Page titles |
| `h2` | 30px / 1.875rem | 1.25 | -0.01em | 600 | Fraunces | Section titles |
| `h3` | 24px / 1.5rem | 1.3 | -0.008em | 600 | Fraunces | Subsection, card headers |
| `h4` | 20px / 1.25rem | 1.35 | 0 | 600 | Inter | Component titles |
| `h5` | 18px / 1.125rem | 1.4 | 0 | 500 | Inter | Sub-labels, sidebar items |
| `body-lg` | 18px / 1.125rem | 1.65 | 0 | 400 | Inter | Lead paragraph, emphasis body |
| `body` | 16px / 1rem | 1.55 | 0 | 400 | Inter | Default body copy |
| `body-sm` | 14px / 0.875rem | 1.5 | 0 | 400 | Inter | Secondary text, captions |
| `caption` | 13px / 0.8125rem | 1.4 | 0.01em | 400 | Inter | Metadata, timestamps, labels |
| `micro` | 12px / 0.75rem | 1.4 | 0.02em | 500 | Inter | Badges, chips, plan labels |
| `code` | 14px / 0.875rem | 1.6 | 0 | 400 | JetBrains Mono | Code, confidence scores, numeric data |

### Typography Rules

**Rule 1 — Font role separation:** Fraunces is ONLY for display text and headings (h1–h3). Inter is ONLY for UI text (h4–h5, body, captions). Never mix in the same element.

**Rule 2 — No italics in UI:** Italics are reserved for editorial content (blog posts). Never use italic in buttons, labels, form fields, or navigation.

**Rule 3 — Line length:** Body text containers max-width `65ch` (~640px). Reading content never wider than `70ch`. Use `max-w-prose` (Tailwind `prose` plugin sets `65ch`).

**Rule 4 — Minimum size:** 12px (`micro`) is the absolute minimum. Never go below this. Labels under 12px fail accessibility.

**Rule 5 — Letter spacing direction:** Display text uses negative tracking (tighter). Body text uses zero or slight positive tracking. Micro/caption uses slightly positive tracking (improves small-text legibility).

**Rule 6 — Heading hierarchy respect:** Never skip heading levels (don't jump from h1 to h4). Screen readers depend on semantic hierarchy.

### Tailwind Typography Config

```typescript
// tailwind.config.ts — fontFamily and fontSize extensions
fontFamily: {
  display: ['Fraunces', 'ui-serif', 'Georgia', 'Cambria', 'serif'],
  sans:    ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
  mono:    ['"JetBrains Mono"', 'ui-monospace', '"Cascadia Code"', 'monospace'],
},
fontSize: {
  'display-xl': ['4.5rem',   { lineHeight: '1.05', letterSpacing: '-0.03em', fontWeight: '700' }],
  'display-lg': ['3.75rem',  { lineHeight: '1.08', letterSpacing: '-0.025em', fontWeight: '600' }],
  'display-md': ['3rem',     { lineHeight: '1.1',  letterSpacing: '-0.02em', fontWeight: '600' }],
  'h1':         ['2.25rem',  { lineHeight: '1.2',  letterSpacing: '-0.015em' }],
  'h2':         ['1.875rem', { lineHeight: '1.25', letterSpacing: '-0.01em' }],
  'h3':         ['1.5rem',   { lineHeight: '1.3',  letterSpacing: '-0.008em' }],
  'h4':         ['1.25rem',  { lineHeight: '1.35' }],
  'h5':         ['1.125rem', { lineHeight: '1.4'  }],
  'body-lg':    ['1.125rem', { lineHeight: '1.65' }],
  'body':       ['1rem',     { lineHeight: '1.55' }],
  'body-sm':    ['0.875rem', { lineHeight: '1.5'  }],
  'caption':    ['0.8125rem',{ lineHeight: '1.4',  letterSpacing: '0.01em' }],
  'micro':      ['0.75rem',  { lineHeight: '1.4',  letterSpacing: '0.02em', fontWeight: '500' }],
},
```

### Migration from Clash Display

```bash
# Files that use font-heading (= Clash Display) — these need font-display or font-sans
grep -rn "font-heading" src/ --include="*.tsx" --include="*.ts"
```

Replace every `font-heading` with `font-display` where the element is h1–h3 display text, or `font-sans font-semibold` where the element is h4+ or UI text that was incorrectly using display font.

Remove the fontshare import from `src/index.css:1` after confirming all Clash Display references are migrated.

---

## Section 4: Spacing & Layout

### Spacing Scale

Based on a 4px base grid. Values favoring Jupiter (3) and Mercury (5) multiples are annotated.

```
space-0:    0px
space-0.5:  2px     ← border offsets, micro-adjustments
space-1:    4px     ← icon gaps, tight labels
space-1.5:  6px     ← badge padding
space-2:    8px     ← standard element gap
space-3:    12px    ← ♃ Jupiter-3: chip padding, list item gap
space-4:    16px    ← standard block spacing
space-5:    20px    ← ☿ Mercury-5: form field spacing
space-6:    24px    ← ♃ 3×8: card internal padding, section divider
space-8:    32px    ← modal padding desktop
space-10:   40px    ← ☿ 5×8: form section spacing
space-12:   48px    ← ♃ 3×16: mobile section vertical padding
space-16:   64px    ← card grid gap desktop
space-20:   80px    ← ☿ 5×16: page section on mobile
space-24:   96px    ← ♃ standard section vertical padding desktop
space-32:   128px   ← hero padding, generous section breaks
```

**Avoid:** `space-7` (28px), `space-14` (56px), `space-28` (112px) — 7-multiples carry Ketu energy (dissolution, loss). Not prescriptive in every case but avoid as primary section spacings.

**Favor:** 3, 5, 6, 8, 12, 24 multipliers for section padding, card spacing, and component gaps.

### Container System

```typescript
// Standard container widths
const containers = {
  prose:     '640px',   // Reading: blog posts, legal pages
  narrow:    '768px',   // Forms, single-column pages (onboarding, auth)
  default:   '1024px',  // Most app pages (dashboard, gift flow)
  wide:      '1280px',  // Data-heavy pages (admin, analytics)
  full:      '1440px',  // Max landing page width
};
```

### Layout Primitives (TSX Components)

These six primitive components should be created in `src/components/layout/`:

```typescript
// src/components/layout/Stack.tsx
interface StackProps {
  gap?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; // 8, 12, 16, 24, 32px
  align?: 'start' | 'center' | 'end' | 'stretch';
  children: ReactNode;
  className?: string;
}
const gapMap = { xs: 'gap-2', sm: 'gap-3', md: 'gap-4', lg: 'gap-6', xl: 'gap-8' };
export const Stack = ({ gap = 'md', align = 'stretch', children, className }: StackProps) => (
  <div className={cn('flex flex-col', gapMap[gap], `items-${align}`, className)}>
    {children}
  </div>
);

// src/components/layout/Inline.tsx
interface InlineProps {
  gap?: 'xs' | 'sm' | 'md' | 'lg';
  align?: 'start' | 'center' | 'end';
  wrap?: boolean;
  children: ReactNode;
  className?: string;
}
export const Inline = ({ gap = 'sm', align = 'center', wrap = false, children, className }: InlineProps) => (
  <div className={cn('flex', gapMap[gap], `items-${align}`, wrap && 'flex-wrap', className)}>
    {children}
  </div>
);

// src/components/layout/Container.tsx
interface ContainerProps {
  size?: 'prose' | 'narrow' | 'default' | 'wide' | 'full';
  children: ReactNode;
  className?: string;
}
const sizeMap = {
  prose:   'max-w-[640px]',
  narrow:  'max-w-[768px]',
  default: 'max-w-[1024px]',
  wide:    'max-w-[1280px]',
  full:    'max-w-[1440px]',
};
export const Container = ({ size = 'default', children, className }: ContainerProps) => (
  <div className={cn('mx-auto w-full px-4 md:px-6 lg:px-8', sizeMap[size], className)}>
    {children}
  </div>
);

// src/components/layout/Section.tsx
interface SectionProps {
  size?: 'sm' | 'md' | 'lg'; // vertical padding: 48px, 96px, 128px
  bg?: 'default' | 'subtle' | 'amber' | 'dark';
  children: ReactNode;
  className?: string;
}
const bgMap = {
  default: 'bg-[#FAF7F2]',
  subtle:  'bg-[#F2EDE4]',
  amber:   'bg-[#FAF5E8]',
  dark:    'bg-[#1A1816] text-[#F2EDE4]',
};
const vPadMap = { sm: 'py-12 md:py-16', md: 'py-12 md:py-24', lg: 'py-16 md:py-32' };
export const Section = ({ size = 'md', bg = 'default', children, className }: SectionProps) => (
  <section className={cn(bgMap[bg], vPadMap[size], className)}>
    {children}
  </section>
);
```

### Grid System

```
Desktop: 12-column, 24px gap
Tablet:  8-column, 20px gap  
Mobile:  4-column, 16px gap

Container horizontal padding:
  Mobile:  16px (px-4)
  Tablet:  24px (px-6)
  Desktop: 32px (px-8)
```

**Grid philosophy:** Avoid 4-column equal layouts where 3-column or 5-column alternatives exist (Jupiter/Mercury numerology). The dashboard stat cards (3 cards) and pricing cards (4 plans) are existing exceptions — the 3-card stat row is correct; the 4-plan pricing row can be laid out as 3+1 (first 3 side by side, Pro below).

### Responsive Breakpoints

```typescript
// tailwind.config.ts — screens (standard Tailwind, keep as-is)
screens: {
  sm:  '640px',   // Large phones
  md:  '768px',   // Tablets
  lg:  '1024px',  // Small desktops
  xl:  '1280px',  // Standard desktops
  '2xl': '1536px', // Large monitors
}
```

### Touch Targets

All interactive elements must be ≥ 44×44px on mobile. This is both WCAG 2.5.5 and Mercury's precision directive — the right size for the right interaction. Use `min-h-[44px] min-w-[44px]` on mobile when elements would otherwise be smaller.

---

## Section 5: Component Library

### Radius & Shadow Foundation

Before specifying individual components, the global radius and shadow tokens:

```typescript
// tailwind.config.ts
borderRadius: {
  'none': '0',
  'sm':   '4px',   // badges, chips, very small elements
  'md':   '8px',   // buttons, inputs, form elements
  'lg':   '12px',  // cards, standard containers
  'xl':   '16px',  // modals, feature cards, large panels
  '2xl':  '24px',  // hero elements, big CTAs
  '3xl':  '32px',  // onboarding wizard card
  'full': '9999px', // avatars, pills, circular icons
},
boxShadow: {
  'xs':         '0 1px 2px rgba(42, 39, 36, 0.04)',
  'sm':         '0 2px 4px rgba(42, 39, 36, 0.06)',
  'md':         '0 4px 12px rgba(42, 39, 36, 0.08)',
  'lg':         '0 8px 24px rgba(42, 39, 36, 0.10)',
  'xl':         '0 16px 40px rgba(42, 39, 36, 0.12)',
  'glow-amber': '0 0 24px rgba(212, 160, 74, 0.25)',
  'glow-indigo':'0 0 24px rgba(76, 42, 133, 0.20)',
  'inner-sm':   'inset 0 1px 2px rgba(42, 39, 36, 0.06)',
},
```

Note: All shadows use `rgba(42, 39, 36, ...)` — the warm neutral-800 tint. Never `rgba(0,0,0,...)`. This is both astrologically correct (warm energy, not heavy black Saturn energy) and visually correct (warm shadows look natural on warm backgrounds).

---

### 5.1 Button

**Anatomy:** [icon?] label [icon?] — icon always 16px, left or right, never both.

```typescript
// CVA variant definition
const buttonVariants = cva(
  // Base: font, height, gap, radius, transitions
  `inline-flex items-center justify-center gap-2 whitespace-nowrap
   rounded-md font-sans font-medium text-body-sm
   transition-all duration-150 ease-out
   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A04A] focus-visible:ring-offset-2
   disabled:pointer-events-none disabled:opacity-40
   [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0`,
  {
    variants: {
      variant: {
        // Primary — amber-400 background, neutral-900 text
        primary:    'bg-[#D4A04A] text-[#1A1816] hover:bg-[#B8893E] active:bg-[#946E32] shadow-sm hover:shadow-md',
        // Secondary — indigo tinted border
        secondary:  'border-2 border-[#4C2A85] text-[#4C2A85] bg-transparent hover:bg-[#F3EFFA] active:bg-[#E0D4F2]',
        // Ghost — subtle hover
        ghost:      'text-[#403A31] hover:bg-[#F2EDE4] active:bg-[#E8E3DB]',
        // Destructive — muted terracotta
        destructive:'bg-[#C25450] text-[#FAF7F2] hover:bg-[#A8403D] active:bg-[#8E3533] shadow-sm',
        // Link — text only
        link:       'text-[#D4A04A] underline-offset-4 hover:underline p-0 h-auto',
        // Hero — amber gradient, glow
        hero:       'bg-gradient-to-r from-[#D4A04A] to-[#B8893E] text-[#1A1816] shadow-md hover:shadow-glow-amber hover:scale-[1.02] active:scale-[0.99]',
      },
      size: {
        sm:   'h-8 px-3 text-[0.8125rem] rounded-md',
        md:   'h-10 px-4 py-2 rounded-md',
        lg:   'h-12 px-6 text-body rounded-lg',
        xl:   'h-14 px-8 text-body-lg rounded-lg',
        icon: 'h-10 w-10 rounded-md',
        'icon-sm': 'h-8 w-8 rounded-md',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);
```

**States:** default → hover → active/pressed → focus → disabled.  
Focus ring: 2px solid `#D4A04A`, 2px offset. Never the browser default blue ring.  
Disabled: opacity 0.4, pointer-events-none. Never hidden.

**Do:** Use `primary` for the single most important action per screen. Use `ghost` for tertiary actions. Use `link` for inline navigation.  
**Don't:** Use more than 1 `primary` button per screen section. Never use `destructive` for cancel/close (use `ghost`).

**Accessibility:** All variants must have explicit `aria-label` when icon-only. The `link` variant must not be used for navigation that causes data loss (use `ghost` with a confirmation dialog instead).

---

### 5.2 Input

```typescript
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leading?: ReactNode; // icon or prefix text
  trailing?: ReactNode; // icon or suffix text
  state?: 'default' | 'error' | 'success' | 'disabled';
}
```

**Visual spec:**
```
height:         40px (h-10)
border-radius:  8px (rounded-md)
border:         1px solid #E8E3DB (neutral-200)
background:     #FAF7F2 (neutral-50)
font:           Inter 16px (body)
padding:        12px 16px (px-4 py-3)
focus:          border-[#D4A04A] + ring-2 ring-[#D4A04A]/20
error:          border-[#C25450] + ring-2 ring-[#C25450]/20
success:        border-[#3E8E7E] + ring-2 ring-[#3E8E7E]/20
disabled:       opacity-50, bg-neutral-100, cursor-not-allowed
placeholder:    #A69D8F (neutral-400)
```

**Label:** Always above input, never floating. `font-sans font-medium text-caption text-[#403A31]`. Required marker: amber `*` after label text.  
**Hint:** Below input, `text-caption text-[#7F7668]`.  
**Error:** Below hint (replaces it), `text-caption text-[#C25450]` with `⚠` prefix.

---

### 5.3 Textarea

Same spec as Input, with:
- `min-height: 96px` (6 lines), `resize: vertical`
- Character count if `maxLength` prop supplied: right-aligned caption below

---

### 5.4 Select / Combobox

Radix Select primitive, styled to match Input spec.  
Trigger height: 40px. Dropdown content: `border-[#E8E3DB] rounded-lg shadow-md bg-[#FAF7F2]`.  
Item hover: `bg-[#F2EDE4]`. Selected item checkmark: amber-400.

---

### 5.5 Checkbox

```
size:           18×18px (w-4.5 h-4.5)
border:         1.5px solid #CFC7BB (neutral-300)
border-radius:  4px (rounded-sm)
checked bg:     #D4A04A (amber-400)
checked icon:   white checkmark, 10px, 1.5px stroke
focus:          ring-2 ring-[#D4A04A]/30
label:          font-sans 14px, text-[#403A31], 8px gap from checkbox
```

---

### 5.6 Radio Group

Same visual spec as Checkbox. Circle instead of rounded square. Selected state: amber-400 filled circle inside neutral-200 ring.

---

### 5.7 Toggle / Switch

```
track (off):    #CFC7BB (neutral-300), 28px×16px, rounded-full
track (on):     #D4A04A (amber-400)
thumb:          white circle, 12px, shadow-xs, 2px inset
transition:     150ms ease-out
focus:          ring-2 ring-[#D4A04A]/30 on track
```

---

### 5.8 Card

Three variants:

```typescript
interface CardProps {
  variant?: 'default' | 'elevated' | 'bordered';
  padding?: 'sm' | 'md' | 'lg'; // 16, 24, 32px
}
```

```
default:    bg-[#FAF7F2] border border-[#E8E3DB] rounded-lg shadow-xs
elevated:   bg-[#FAF7F2] rounded-xl shadow-md hover:shadow-lg transition-shadow
bordered:   bg-[#FAF7F2] border-2 border-[#CFC7BB] rounded-lg
```

**Do:** Use `default` for standard content cards. Use `elevated` for cards that represent primary content blocks. Use `bordered` for selected/active state cards.  
**Don't:** Nest elevated cards inside elevated cards. Don't use pure white `#FFFFFF` as card background — always warm neutral.

---

### 5.9 Badge / Chip

```typescript
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border font-mono font-medium text-micro px-2.5 py-0.5 transition-colors',
  {
    variants: {
      variant: {
        default:    'bg-[#F2EDE4] border-[#E8E3DB] text-[#403A31]',
        success:    'bg-[#3E8E7E]/10 border-[#3E8E7E]/30 text-[#3E8E7E]',
        warning:    'bg-[#D4A04A]/10 border-[#D4A04A]/30 text-[#946E32]',
        error:      'bg-[#C25450]/10 border-[#C25450]/30 text-[#C25450]',
        primary:    'bg-[#D4A04A]/10 border-[#D4A04A]/30 text-[#6F5326]',
        secondary:  'bg-[#4C2A85]/10 border-[#4C2A85]/30 text-[#4C2A85]',
        locked:     'bg-[#F2EDE4] border-[#E8E3DB] text-[#A69D8F] opacity-60',
        dark:       'bg-[#2A2724] border-[#403A31] text-[#E8E3DB]',
      },
      size: {
        sm: 'text-[10px] px-2 py-0.5',
        md: 'text-[12px] px-2.5 py-0.5',
        lg: 'text-[13px] px-3 py-1',
      }
    },
    defaultVariants: { variant: 'default', size: 'md' },
  }
);
```

---

### 5.10 Avatar

```typescript
interface AvatarProps {
  src?: string;
  name?: string; // used for initials fallback
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; // 24, 32, 40, 56, 80px
  indicator?: 'online' | 'offline' | 'busy';
}
```

Initials computation: `name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)`.  
Initials background: deterministic color from name hash — picks from amber-100, indigo-100, success/10, or neutral-200. Never random (would flicker on re-render).  
Fallback icon: `User` from Lucide when name is also unavailable.

---

### 5.11 Modal / Dialog

```
max-width:    480px (default), 640px (wide), 360px (narrow/confirm)
border-radius:16px (rounded-xl)
padding:      32px desktop, 20px mobile
backdrop:     rgba(26, 24, 22, 0.5) — warm tinted, not cold black
animation:    scale 0.97→1 + fade-in, 250ms ease-out
header:       h4 Inter 600, close icon (X) top-right, 24px from edge
footer:       right-aligned actions, 16px gap between buttons
```

**Always:** Include a close button (X). Provide keyboard `Escape` dismissal. Trap focus inside modal. Return focus to trigger on close.  
**Never:** Use modal for confirmation of non-destructive actions (use inline toast instead). Never disable Escape dismissal.

---

### 5.12 Popover

Max-width 320px. `rounded-lg`, `shadow-lg`, `border border-[#E8E3DB]`, `bg-[#FAF7F2]`. Padding 16px. Arrow (caret) uses Radix positioning. Z-index 50.

---

### 5.13 Tooltip

Max-width 240px. `rounded-md`, `bg-[#2A2724]`, `text-[#F2EDE4]`, `text-caption`, padding `6px 10px`. Delay 300ms show, 0ms hide. Never put interactive content (links, buttons) inside tooltip — use Popover instead.

---

### 5.14 Toast / Notification

Using Sonner (already installed). Custom styling override:

```typescript
// src/lib/sonner-theme.ts
export const sonnerTheme = {
  style: {
    '--border-radius': '10px',
    '--background': '#FAF7F2',
    '--border-color': '#E8E3DB',
    '--text-color': '#1A1816',
    '--success-bg': 'rgba(62, 142, 126, 0.1)',
    '--success-border': 'rgba(62, 142, 126, 0.3)',
    '--success-text': '#3E8E7E',
    '--error-bg': 'rgba(194, 84, 80, 0.1)',
    '--error-border': 'rgba(194, 84, 80, 0.3)',
    '--error-text': '#C25450',
  }
};
```

Toast hierarchy: success (3s) → info (4s) → warning (5s) → error (persistent, must be dismissed).

---

### 5.15 Progress Bar

```typescript
interface ProgressBarProps {
  value: number;       // 0-100
  variant?: 'amber' | 'success' | 'indigo' | 'neutral';
  size?: 'sm' | 'md' | 'lg'; // 4px, 8px, 12px height
  animated?: boolean;  // true adds shimmer while incomplete
  label?: string;      // accessible label
}
```

Track: `bg-[#E8E3DB]` (neutral-200), rounded-full.  
Fill: amber-400 (default), success, indigo-500, or neutral-700.  
Animated fill: `transition-[width] duration-500 ease-out`.

---

### 5.16 Skeleton Loader

```typescript
// Base skeleton with shimmer animation
const Skeleton = ({ className }: { className?: string }) => (
  <div
    className={cn(
      'animate-shimmer rounded-md bg-gradient-to-r from-[#E8E3DB] via-[#F2EDE4] to-[#E8E3DB]',
      'bg-[length:200%_100%]',
      className
    )}
    aria-hidden="true"
  />
);

// Keyframe to add to tailwind.config.ts
'shimmer': {
  '0%':   { backgroundPosition: '200% 0' },
  '100%': { backgroundPosition: '-200% 0' },
}
// animation: 'shimmer': 'shimmer 1.5s linear infinite'
```

Use warm-tinted shimmer (`#E8E3DB` → `#F2EDE4`), not the default grey-blue shimmer.

---

### 5.17 Tabs

Underline variant (not pill). Active tab: `border-b-2 border-[#D4A04A] text-[#1A1816] font-medium`. Inactive: `text-[#7F7668] hover:text-[#403A31]`. Tab list bottom border: `border-b border-[#E8E3DB]`. Animated indicator: `transition-[left,width] duration-200 ease-out` using absolute positioned element.

---

### 5.18 Accordion

Radix base. `border-b border-[#E8E3DB]` between items (no outer border). Trigger: `py-4 font-sans font-medium text-body text-[#1A1816] hover:text-[#D4A04A]`. Chevron rotates 180° on open (existing `accordion-down` animation works).

---

### 5.19 Navigation Sidebar

Already built in `src/components/dashboard/DashboardLayout.tsx`. Migration checklist:
- Replace `bg-card` with `bg-[#FAF7F2]`
- Replace `bg-primary text-primary-foreground` (active item) with `bg-[#D4A04A]/10 text-[#6F5326] border-r-2 border-[#D4A04A]`
- Replace `border-r border-border` with `border-r border-[#E8E3DB]`
- Active link uses amber-left-border treatment, not filled amber background

---

### 5.20 Pricing Card (GiftMind-Specific)

Four variants — one per plan:

```typescript
interface PricingCardProps {
  plan: 'spark' | 'thoughtful' | 'confident' | 'gifting-pro';
  price: string;        // "$5.99"
  priceContext: string; // "per 10 sessions"
  features: string[];
  isRecommended?: boolean;
  onSelect: () => void;
}
```

**Spark (Free):**
```
bg: #FAF7F2, border: 1px solid #E8E3DB, no glow
label badge: neutral 'Free' 
CTA: ghost button "Start Free"
```

**Thoughtful ($2.99):**
```
bg: #FAF5E8 (amber-50), border: 1px solid #EDD896 (amber-200)
label badge: amber 'Popular Entry'
CTA: primary button "Get Thoughtful"
```

**Confident ($5.99) — Hero Tier:**
```
bg: #4C2A85 (indigo-500), text: #F2EDE4
border: 2px solid transparent, background-clip: padding-box
::before pseudo: linear-gradient(135deg, #D4A04A, #4C2A85) — gradient border
shadow: shadow-glow-indigo
label badge: amber-400 "Best Value" positioned top-right
price color: amber-300 (#E4C663) — bright on dark bg
CTA: hero button (amber gradient) "Get Confident"
```

**Gifting Pro ($14.99):**
```
bg: #1A1816 (neutral-900), text: #F2EDE4
border: 1px solid #403A31
Decorative: amber-300 thin line accent top edge
price color: amber-300
CTA: outline-on-dark "Get Gifting Pro"
```

**Layout:** 4 cards in a row on desktop, 1 column on mobile. Confident card is 4px taller than siblings (via padding-top/bottom 4px extra) — subtle elevation signal.

---

### 5.21 Recipient Card (GiftMind-Specific)

```typescript
interface RecipientCardProps {
  name: string;
  relationship?: string;
  avatarColor: string; // deterministic from name
  lastGiftDate?: string;
  giftCount: number;
  onSelect: () => void;
  onEdit: () => void;
}
```

```
Layout: horizontal, avatar (40px) + text block + action icons
bg: #FAF7F2, border: 1px solid #E8E3DB, rounded-lg
padding: 16px
avatar: rounded-full, initials, deterministic amber/indigo/success tints
hover: bg-[#F2EDE4] border-[#CFC7BB] transition-colors
name: font-sans font-medium text-body text-[#1A1816]
relationship: font-sans text-caption text-[#7F7668]
gift count: badge variant='default' (small, right side)
actions: Edit icon (ghost), visible on hover only
```

---

### 5.22 Gift Recommendation Card (GiftMind-Specific)

The most important card in the product. Currently ad-hoc styled in `src/components/gift-flow/GiftCard.tsx`. This must become a design-system component.

```typescript
interface GiftRecommendationCardProps {
  gift: GiftRecommendation;
  rank: 1 | 2 | 3;
  isBestMatch: boolean;
  confidenceScore: number; // 0-100
  onSelect: () => void;
  onFeedback?: (feedback: 'loved' | 'neutral' | 'dislike') => void;
}
```

```
Layout: vertical card, full-width within grid
bg: #FAF7F2
border: isBestMatch ? '2px solid #D4A04A' : '1px solid #E8E3DB'
border-radius: 12px (rounded-lg)
shadow: isBestMatch ? shadow-glow-amber : shadow-sm
padding: 24px

Header row:
  - ConfidenceBadge (see 5.23) — right side
  - "Best Match" amber pill — only if isBestMatch

Title: h3 Fraunces 600 text-[#1A1816] 24px
Why it works: body Inter 400 text-[#5B5245] 16px
Price anchor: font-mono font-medium text-[#1A1816]
Category chip: badge variant='default'

Product links: expandable section (accordion-style)
Cultural note: amber-50 bg, amber-600 text, rounded-lg, if present
```

---

### 5.23 Confidence Badge (GiftMind-Specific)

The primary brand differentiator — must be consistently designed across all surfaces.

```typescript
interface ConfidenceBadgeProps {
  score: number; // 0-100
  size?: 'sm' | 'md' | 'lg';
  animate?: boolean; // count up from 0 on first render
}
```

```
Score thresholds → visual treatment:
  90-100:  amber-400 bg, neutral-900 text, "Excellent match"  → shadow-glow-amber
  75-89:   indigo-400 bg, white text,     "Strong match"
  60-74:   neutral-200 bg, neutral-700 text, "Good match"
  <60:     neutral-200 bg, neutral-500 text, "Moderate match"

Size: md (default)
  Number: Fraunces 700, 28px, leading none
  "%": Inter 600, 16px, aligned to number baseline
  Label: Inter 400, caption, 10px below number
  Width: min 56px, centered

Animation (animate=true):
  On first render, count from 0 to score over 800ms, ease-out
  Use requestAnimationFrame, respect prefers-reduced-motion
```

```tsx
// Usage
<ConfidenceBadge score={92} animate />
// Renders: large amber badge, counts 0→92 on mount
```

---

### 5.24 Signal Check Result (GiftMind-Specific)

Premium feature. Distinct visual treatment.

```typescript
interface SignalCheckResultProps {
  score: number;       // 0-10
  summary: string;
  aspects: Array<{ label: string; positive: boolean; detail: string }>;
}
```

```
Container: 
  bg: linear-gradient(135deg, #FAF5E8, #F5E9C9)
  border: 1px solid #EDD896 (amber-200)
  border-radius: 12px
  padding: 24px
  shadow: shadow-glow-amber (subtle)

Header:
  Icon: Eye or Sparkles (amber-500, 24px)
  Label: "Signal Check™" font-sans font-semibold caption amber-700
  Score: large Fraunces 700 number, amber-600

Aspects list (max 5 — Mercury's number):
  ✓ positive: success color, check icon
  ✗ negative: error color, x icon
  font: body-sm Inter
```

---

## Section 6: Iconography

### Icon Library

**Primary:** Lucide React (already installed, v0.462.0). Do not introduce a second icon library.

```typescript
// Standard icon sizes — use these exactly
const ICON_SIZES = {
  xs:  12, // inline text icons, micro labels
  sm:  16, // default button icons, badge icons
  md:  20, // primary UI icons (nav, form leading icons)
  lg:  24, // card icons, feature icons
  xl:  32, // empty state icons
  hero: 48, // onboarding step icons, landing section icons
} as const;
```

**Stroke width:** All Lucide icons use `strokeWidth={1.5}` (not the default 2). This aligns with the Mercury/Virgo precision aesthetic — thin, exact lines. `strokeWidth={2}` reads as heavy during Rahu-Saturn; `strokeWidth={1}` reads as fragile.

```tsx
// Standard usage pattern
<Gift
  className="text-current" // inherits color
  size={20}                // use ICON_SIZES constants
  strokeWidth={1.5}        // always explicit
  aria-hidden="true"       // when decorative
/>

// Accessible usage (when icon conveys information)
<Gift
  size={20}
  strokeWidth={1.5}
  aria-label="Gift icon"
  role="img"
/>
```

### Icon Color Rules

- **In navigation:** `text-muted-foreground` (neutral-500) default, `text-[#D4A04A]` active
- **In buttons:** Always `currentColor` — inherits from button text color
- **Decorative accent icons:** amber-400 or indigo-400 explicitly set
- **Status icons:** Match semantic colors (success → `#3E8E7E`, error → `#C25450`, warning → `#D4A04A`)
- **Never:** Use multiple different-colored icons in the same navigation row

### Custom Icon Guidelines

When Lucide doesn't have exactly the right icon:

1. Design on 24×24 grid
2. 1.5px stroke, `round` linecap and linejoin
3. 2px minimum internal padding from edges
4. Export as SVG, inline in component (not as separate file for single-use icons)

**The Hasta Hand Motif:** Where appropriate, the open-hand gesture (Hasta nakshatra) can appear as a subtle decorative element in empty states, onboarding illustrations, and marketing surfaces. This is a custom SVG, not a Lucide icon. It consists of a simple line-art open hand, 1.5px stroke, amber-300 color. Never use it as a UI action icon — decorative only.

### Icon Don'ts

- Never use icon-only navigation items without a visible text label (or at minimum a tooltip)
- Never mix stroke widths within a single component (e.g., 1.5px and 2px in the same card)
- Never scale an icon with CSS `transform: scale()` — always use the `size` prop
- Never use emoji as icons in UI components — emoji renders inconsistently across OS

---

## Section 7: Motion & Animation

Motion in GiftMind communicates the joy of giving. Every transition should feel like unwrapping — anticipation, reveal, delight. The astrological alignment here is Jupiter (expansion, generosity) and Moon (fluid, emotional responsiveness). Animations are warm, slightly elastic, never mechanical.

### Guiding Principles

1. **Motion has meaning.** Every animation answers "why": entrance = arrival, exit = departure, pulse = urgency, spring = delight.
2. **Never animate for decoration alone.** If removing an animation degrades comprehension or feel, it belongs. If not, cut it.
3. **Respect reduced-motion.** All animations must have a `prefers-reduced-motion: reduce` fallback that substitutes an instant opacity or no transition.
4. **Warmth over precision.** Easings have a slight ease-out bias — like a gift being set down gently, not snapped into place.

### Duration Scale

| Token | Value | Use Case |
|-------|-------|----------|
| `duration-instant` | 0ms | State changes without visual feedback (aria, focus management) |
| `duration-fast` | 100ms | Micro-interactions: checkbox check, toggle click, hover state |
| `duration-normal` | 200ms | Standard UI transitions: dropdowns, tooltips, button press |
| `duration-moderate` | 300ms | Page element entrances, card reveals, modal overlays |
| `duration-slow` | 500ms | Full-screen transitions, onboarding step changes |
| `duration-deliberate` | 800ms | Confidence badge count-up, success state reveals |
| `duration-ceremonial` | 1200ms | Confetti entrance, plan upgrade celebration, first recommendation reveal |

In CSS/Tailwind, these map to:

```css
--duration-instant:    0ms;
--duration-fast:       100ms;
--duration-normal:     200ms;
--duration-moderate:   300ms;
--duration-slow:       500ms;
--duration-deliberate: 800ms;
--duration-ceremonial: 1200ms;
```

### Easing Curves

| Name | Curve | Use Case |
|------|-------|----------|
| `ease-snappy` | `cubic-bezier(0.4, 0, 0.2, 1)` | UI state changes, hover effects |
| `ease-out-warm` | `cubic-bezier(0.0, 0, 0.2, 1)` | Entrances — starts fast, settles gently |
| `ease-in-warm` | `cubic-bezier(0.4, 0, 1, 1)` | Exits — starts slow, accelerates out |
| `ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Delightful reveals — slight overshoot, Jupiter energy |
| `ease-ceremonial` | `cubic-bezier(0.16, 1, 0.3, 1)` | Celebration moments — long tail ease-out |

```css
--ease-snappy:     cubic-bezier(0.4, 0, 0.2, 1);
--ease-out-warm:   cubic-bezier(0.0, 0, 0.2, 1);
--ease-in-warm:    cubic-bezier(0.4, 0, 1, 1);
--ease-spring:     cubic-bezier(0.34, 1.56, 0.64, 1);
--ease-ceremonial: cubic-bezier(0.16, 1, 0.3, 1);
```

### Animation Patterns

#### Entrance Animations

All entrances default to `fade-up`: opacity 0→1 + translateY 8px→0. This 8px distance is intentional (Jupiter's 3×3 spacing unit). Never use `fade-down` for content — downward motion implies dismissal.

```css
@keyframes fade-up {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-up {
  animation: fade-up var(--duration-moderate) var(--ease-out-warm) forwards;
}
```

For staggered list items (recipients list, gift cards grid), apply an `animation-delay` of `50ms * index` — cap at 5 items, beyond that render instantly.

```tsx
// Usage pattern for staggered entrances
items.slice(0, 5).map((item, i) => (
  <div
    key={item.id}
    className="animate-fade-up"
    style={{ animationDelay: `${i * 50}ms`, opacity: 0 }}
  >
    {/* content */}
  </div>
))
```

#### Gift Card Reveal

When the first recommendation arrives, the gift card should perform a "reveal":

```css
@keyframes gift-reveal {
  0%   { opacity: 0; transform: scale(0.95) translateY(12px); }
  60%  { opacity: 1; transform: scale(1.02) translateY(-2px); }
  100% { transform: scale(1) translateY(0); }
}

.animate-gift-reveal {
  animation: gift-reveal var(--duration-slow) var(--ease-spring) forwards;
}
```

This mimics the physical act of lifting the lid off a gift box — slight overshoot on scale, then settles.

#### Confidence Badge Count-Up

The confidence score badge always animates from 0 to the actual score when first rendered. This is not decorative — it creates the sensation of calculation completing in real time.

```typescript
// useCountUp.ts
import { useEffect, useRef, useState } from 'react';

export function useCountUp(target: number, duration = 800, delay = 0) {
  const [value, setValue] = useState(0);
  const startTime = useRef<number | null>(null);
  const rafId = useRef<number>();

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) { setValue(target); return; }

    const timeout = setTimeout(() => {
      const animate = (timestamp: number) => {
        if (!startTime.current) startTime.current = timestamp;
        const elapsed = timestamp - startTime.current;
        const progress = Math.min(elapsed / duration, 1);
        // Ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        setValue(Math.round(eased * target));
        if (progress < 1) rafId.current = requestAnimationFrame(animate);
      };
      rafId.current = requestAnimationFrame(animate);
    }, delay);

    return () => {
      clearTimeout(timeout);
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [target, duration, delay]);

  return value;
}
```

#### Loading States

Loading indicators use a warm amber pulse rather than a generic grey shimmer. The skeleton component should pulse amber-50 → amber-100 → amber-50 in a 1.5s loop.

```css
@keyframes skeleton-pulse {
  0%, 100% { background-color: hsl(var(--color-amber-50)); }
  50%       { background-color: hsl(var(--color-amber-100)); }
}

.skeleton {
  animation: skeleton-pulse 1.5s var(--ease-snappy) infinite;
  border-radius: var(--radius-sm);
}
```

For the recommendation engine specifically: use a staggered 3-bar wave (not a spinner) to communicate "thinking":

```css
@keyframes thinking-wave {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30%           { transform: translateY(-6px); opacity: 1; }
}

.thinking-dot:nth-child(1) { animation-delay: 0ms; }
.thinking-dot:nth-child(2) { animation-delay: 150ms; }
.thinking-dot:nth-child(3) { animation-delay: 300ms; }
```

#### Celebration Moments

Three celebration tiers:

| Tier | Trigger | Animation |
|------|---------|-----------|
| **Micro** | Checkbox check, toggle on | Single `ease-spring` scale pulse on icon (0.8→1.15→1.0) |
| **Standard** | Gift sent, recipient added | Green check mark with `gift-reveal` + toast notification |
| **Ceremonial** | First ever recommendation, plan upgrade, onboarding complete | Full canvas confetti (amber + indigo palette) + page element fade-up |

Confetti configuration for ceremonial moments:

```typescript
import confetti from 'canvas-confetti';

export function fireGiftConfetti() {
  confetti({
    particleCount: 120,
    spread: 70,
    origin: { y: 0.6 },
    colors: ['#D4A04A', '#F5C842', '#4C2A85', '#7A57BE', '#FAF5E8'],
    disableForReducedMotion: true,
  });
}
```

### Page Transition Strategy

GiftMind is a React SPA. Page transitions are achieved with a simple fade:

```css
.page-enter {
  opacity: 0;
  transform: translateY(4px);
}

.page-enter-active {
  opacity: 1;
  transform: translateY(0);
  transition: opacity var(--duration-moderate) var(--ease-out-warm),
              transform var(--duration-moderate) var(--ease-out-warm);
}

.page-exit {
  opacity: 1;
}

.page-exit-active {
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-in-warm);
}
```

Exit is faster (100ms) than entrance (300ms) — this creates the natural feel of one experience closing and another opening.

### Reduced Motion

Every animation component must check `prefers-reduced-motion`:

```typescript
// Utility hook
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return reduced;
}
```

In Tailwind, use `motion-safe:` and `motion-reduce:` variants everywhere animation is applied:

```html
<div class="motion-safe:animate-fade-up motion-reduce:opacity-100">
```

---

## Section 8: Accessibility

GiftMind targets WCAG 2.1 AA compliance for all public and authenticated surfaces. This section defines the specific requirements, not general principles.

### Color Contrast Targets

All text must meet these ratios (measured with `#FAF7F2` light background and `#1A1816` dark-mode background):

| Text Type | Minimum Ratio | Tokens |
|-----------|--------------|--------|
| Normal body text (< 18px) | 4.5:1 | `neutral-700` on `neutral-50` |
| Large text (≥ 18px or ≥ 14px bold) | 3:1 | `neutral-600` on `neutral-50` |
| UI components (borders, icons in context) | 3:1 | `neutral-400` min |
| Error text | 4.5:1 | `#C25450` on `#FAF7F2` = 4.8:1 ✓ |
| Warning text | 4.5:1 | `#B8892E` (darker warning) on `#FAF7F2` = 4.6:1 ✓ |
| Primary amber on white | 3:1 minimum (large only) | `#D4A04A` on `#FAF7F2` = 2.9:1 — **FAIL for body text** |

**Critical note:** The primary amber `#D4A04A` does not pass 4.5:1 contrast on a light background. It is therefore:
- Suitable for: large display text (≥ 18px), decorative elements, icons paired with a label, active navigation indicators
- **Not suitable for:** body text, paragraph text, button labels on white backgrounds, or any text under 18px regular weight

For button labels on amber backgrounds: use `#2B1F0F` (amber-900) as the label color, which achieves 8.1:1 contrast. For text links that must appear amber, ensure minimum 14px bold (3:1 passes at that size).

### Dark Mode Contrast

In dark mode (`#1A1816` background):

| Foreground | Background | Ratio | Pass |
|-----------|-----------|-------|------|
| `neutral-50` (#FAF7F2) | `neutral-950` (#1A1816) | 16.2:1 | ✓ AA + AAA |
| `amber-300` (#F5C842) | `neutral-950` | 11.4:1 | ✓ |
| `amber-400` (#D4A04A) | `neutral-950` | 6.3:1 | ✓ AA |
| `neutral-400` (#8A7E70) | `neutral-950` | 4.6:1 | ✓ AA |
| `indigo-300` (#9B7FD4) | `neutral-950` | 5.2:1 | ✓ AA |

Dark mode has more flexibility with amber — the brand color passes at all text sizes in dark mode.

### Focus Management

Focus indicators must be visible on all interactive elements. The default browser outline is removed and replaced with a consistent warm amber ring:

```css
/* Global focus-visible ring */
:focus-visible {
  outline: 2px solid #D4A04A;
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

/* For elements on amber backgrounds, use dark ring */
.bg-primary :focus-visible,
.bg-amber-400 :focus-visible {
  outline-color: #2B1F0F;
}
```

In Tailwind, this is applied via a plugin or by adding to the base layer:

```typescript
// tailwind.config.ts — addBase
{
  '*:focus-visible': {
    outline: '2px solid #D4A04A',
    outlineOffset: '2px',
  },
}
```

Never use `outline: none` or `outline: 0` without providing an equivalent visual indicator. The `focus:ring-*` Tailwind utilities may be used as alternatives.

### Keyboard Navigation

All interactive elements must be reachable via Tab in a logical document order. Specific requirements:

| Component | Keyboard Behavior |
|-----------|-----------------|
| Modal / Sheet | Tab trap within modal; Escape closes; first focusable element receives focus on open |
| Dropdown Menu | Arrow keys navigate items; Escape closes; Tab closes and moves to next element |
| Tabs | Arrow keys switch between tabs; Home/End for first/last |
| Popover (Credit Pill) | Escape closes; focus returns to trigger |
| Onboarding Wizard | Tab moves forward; Shift+Tab backward; Enter submits current step |
| Gift Card | Space/Enter activates "View Gift" action |

Radix UI primitives already handle most of this correctly. The implementation obligation is:
1. Never override Radix's keyboard handlers
2. Provide `aria-label` on icon-only buttons
3. Ensure custom components (non-Radix) implement the patterns above

### Screen Reader Requirements

Every interactive element must have an accessible name. Patterns:

```tsx
/* Icon-only button */
<Button variant="ghost" aria-label="Close modal">
  <X size={16} aria-hidden="true" />
</Button>

/* Progress bar */
<Progress
  value={75}
  aria-label="Profile completion"
  aria-valuenow={75}
  aria-valuemin={0}
  aria-valuemax={100}
/>

/* Confidence badge */
<div role="status" aria-label={`${score}% confidence score`}>
  {animatedValue}%
</div>

/* Loading states */
<div role="status" aria-live="polite" aria-label="Loading gift recommendations">
  <span className="sr-only">Generating personalized gift ideas...</span>
  {/* visual loader */}
</div>
```

### Form Accessibility

All form inputs must have:
- A visible `<label>` associated via `htmlFor` / `id` (not just placeholder text)
- Error messages connected via `aria-describedby`
- Required fields marked with `aria-required="true"` (not just visual asterisk)

```tsx
<div>
  <Label htmlFor="email">Email address</Label>
  <Input
    id="email"
    type="email"
    aria-required="true"
    aria-describedby={emailError ? "email-error" : undefined}
    aria-invalid={!!emailError}
  />
  {emailError && (
    <p id="email-error" role="alert" className="text-sm text-error mt-1">
      {emailError}
    </p>
  )}
</div>
```

### Touch Target Sizes

All interactive elements must have a minimum 44×44px touch target on mobile:

```css
/* Applied globally to small interactive elements */
.touch-target {
  min-height: 44px;
  min-width: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
```

The bottom navigation icons on mobile already satisfy this — each icon occupies a `px-3 py-1` zone. Verify 44px height is maintained if padding is adjusted.

### Images and Media

- Decorative images: `alt=""`
- Informational images (e.g. product images in gift cards): descriptive `alt` text: `alt="Leather journal from Moleskine — $32"`
- The Hasta hand SVG decorative motif: `aria-hidden="true"`
- Avatar images: `alt="{name}'s profile photo"` or `alt=""` if the name is also shown as text nearby

### Accessibility Audit Checklist

Before each release, run:

1. `axe-core` automated scan — zero critical/serious violations
2. Manual keyboard navigation: Tab through every page in order
3. Screen reader test with VoiceOver (macOS) on at least: Landing, Signup, Dashboard, Gift Flow, Credits
4. Color contrast check: use Stark or Polypane for all new color pairings
5. Zoom to 200% in browser — no content clipped or overlapping

---

## Section 9: Brand Application Patterns

This section defines exactly how the design system assembles into recognizable, recurring UI patterns that are specific to GiftMind's product. These are not generic component specs — they are the brand's visual language applied to real product surfaces.

### The Confidence Badge

The most distinctive visual element in the product. Appears on every gift recommendation card.

```
┌─────────────┐
│   92%       │  ← amber-400 text, Fraunces bold
│  confident  │  ← neutral-500 label, Inter 11px
└─────────────┘
  rounded-full amber-50 bg, amber-200 border
```

**Score tiers and visual treatment:**

| Score | Background | Text Color | Border | Glow |
|-------|-----------|-----------|--------|------|
| 90-100 | amber-50 | amber-700 | amber-200 | `shadow-[0_0_8px_rgba(212,160,74,0.3)]` |
| 75-89 | indigo-50 | indigo-700 | indigo-200 | none |
| 60-74 | neutral-100 | neutral-600 | neutral-200 | none |
| < 60 | neutral-100 | neutral-400 | neutral-200 | none |

The amber glow on 90+ scores is a deliberate signal: this recommendation is genuinely excellent. The glow should be subtle — perceptible only when you notice it, not aggressively radiating.

**TypeScript component spec:**

```tsx
interface ConfidenceBadgeProps {
  score: number;          // 0-100
  size?: 'sm' | 'md' | 'lg';
  animate?: boolean;      // count-up from 0 on mount, default true
  showLabel?: boolean;    // show "confident" label, default true
}

const sizeMap = {
  sm: { badge: 'px-2 py-0.5 text-xs',  score: 'text-sm font-bold'  },
  md: { badge: 'px-3 py-1   text-xs',  score: 'text-base font-bold' },
  lg: { badge: 'px-4 py-1.5 text-sm',  score: 'text-xl font-bold'  },
};

// Score is displayed as integer percent, always animated via useCountUp
// Border-radius: rounded-full (pill shape — Jupiter softness)
// Font for number: Fraunces (heading font — confidence is a brand statement)
// Font for label: Inter (body font — descriptive text)
```

### Signal Check Result

Displayed inside the gift recommendation card, showing the underlying signals that drove the suggestion.

```
┌──────────────────────────────────┐
│ ✓ Shared love of hiking          │  ← success-600 check, neutral-700 text
│ ✓ Birthday in 12 days            │  ← success-600 check, neutral-700 text
│ ~ No prior gifts recorded        │  ← neutral-400 dash, neutral-400 text
└──────────────────────────────────┘
```

Three signal states: confirmed (`✓` amber-600), inferred (`~` neutral-400), absent (`—` neutral-300). Never show red/error for absent signals — absence is neutral information, not a failure.

### Empty States

Empty states follow the Hasta principle: an open, inviting hand — ready to give. Never show a generic "nothing here" message.

**Pattern for all empty states:**

```
[Hasta hand SVG or contextual icon — amber-300, 48px]

[Heading — Fraunces, 18px, neutral-800]
"No recipients yet"

[Body — Inter, 14px, neutral-500, max-w-xs centered]
"Add the people you want to gift. GiftMind will
remember what matters to each of them."

[Primary CTA button]
"Add your first person"
```

Empty state copy guidelines:
- Heading: state the situation, not the absence ("No recipients yet" not "You haven't added anyone")
- Body: explain the value awaiting, not the task to do
- CTA: action-oriented, specific, never "Click here" or "Get started"

**Empty state contexts:**

| Page | Heading | Body | CTA |
|------|---------|------|-----|
| My People (no recipients) | "No recipients yet" | "Add the people you gift. GiftMind learns their preferences over time." | "Add someone" |
| Gift History (no history) | "No gift history yet" | "Once you find and send gifts, they'll appear here." | "Find a gift" |
| Dashboard (new user) | "Welcome to GiftMind" | "Let's start by adding someone you'd like to gift." | "Add your first person" |
| Credits (zero balance) | "You're out of credits" | "Top up to keep gifting with confidence." | "View plans" |

### Loading States

The recommendation engine can take 8-15 seconds. This is the most critical loading state in the product — users must feel progress, not anxiety.

**7-node progress visualization:**

```
Analyzing Priya...          ●●●○○○○   3 of 7
─────────────────────────────────────────────
✓ Understanding recipient
✓ Cultural context
● Searching past gifts...
○ Generating ideas
○ Checking budget
○ Personalizing
○ Formatting
```

The progress bar uses amber-400 fill, neutral-100 track. Completed nodes show amber check icons. The current node pulses at 1.5s interval. Future nodes show neutral-300 circles.

**Micro-copy during loading (rotates every 3 seconds):**

```
"Thinking about what Priya would love..."
"Checking cultural context..."
"Considering your budget..."
"Almost ready — personalizing picks..."
```

These messages are shown in `text-sm text-muted-foreground italic` (Inter italic, neutral-400).

### Success States

Three tiers of success visual treatment:

**Tier 1 — Micro success** (checkbox, toggle):
- Icon swaps to checkmark
- `ease-spring` scale animation (0.8 → 1.15 → 1.0)
- Duration: 200ms
- Color: success `#3E8E7E`

**Tier 2 — Action success** (gift saved, person added):
- Sonner toast: amber icon, neutral-800 title, body text
- No confetti
- Duration: 4 seconds, no close button needed

**Tier 3 — Milestone success** (first recommendation, plan upgrade, onboarding complete):
- Canvas confetti (amber + indigo palette)
- Full-page or modal success state with Fraunces heading
- Warm message: "You're all set." / "Your first gift idea is ready."
- Always include a clear next action

**Sonner toast configuration:**

```typescript
// Standard action toast
toast.success("Gift saved", {
  description: "Added to Priya's gift history",
  duration: 4000,
  icon: <Gift size={16} className="text-amber-500" />,
});

// Milestone toast (used sparingly)
toast.success("Welcome to GiftMind! 🎁", {
  description: "Your 3 free credits are ready to use.",
  duration: 6000,
});
```

### Upgrade Prompts

When a user hits a credit limit or plan restriction, upgrade prompts appear. These must feel like an invitation, not a paywall.

**In-context upgrade nudge (inline, not modal):**

```
┌──────────────────────────────────────┐
│  🪙  You're out of credits            │
│                                      │
│  Upgrade to keep the ideas coming.   │
│  Plans start at $4.99/month.         │
│                                      │
│  [View Plans]  [Not now]             │
└──────────────────────────────────────┘
```

Visual spec:
- Background: `amber-50`
- Border: `amber-200` 1px
- Border-radius: `radius-lg` (12px)
- Padding: 16px (Jupiter spacing)
- Icon: amber-400
- "View Plans": primary button, amber-400 background
- "Not now": ghost button, neutral-500 text

**Never:** Use red/error colors for upgrade prompts. Credits running low is not an error — it's an opportunity.

### Price Display

Plan prices always display with:
- Amount in Fraunces bold (heading font) at `text-3xl`
- Currency symbol at `text-xl` same weight, vertically aligned to top of amount
- Period at `text-sm` Inter normal, neutral-500

```
 $4.99
      /mo
```

Crossed-out original price for discounted tiers:
- Use `line-through` decoration, neutral-400 color
- New price in amber-600

Annual pricing shows the monthly equivalent with a `text-xs` badge reading "Billed annually" in indigo-50 background.

---

## Section 10: Plan Visual Hierarchy

The four plans — Spark, Thoughtful, Confident, Gifting Pro — must be visually distinguishable at a glance while sharing the same design language.

### Plan Identity Map

| Plan | Visual Metaphor | Primary Color | Icon | Border Style |
|------|----------------|--------------|------|-------------|
| **Spark** | A single candle — modest, warm | `neutral-300` | `Flame` or `Sparkles` | Standard border-border |
| **Thoughtful** | A wrapped gift — considered | `amber-400` | `Gift` | Amber border, amber-50 bg |
| **Confident** | A rising star — assured | `indigo-400` | `Star` or `TrendingUp` | Indigo border, indigo-50 bg |
| **Gifting Pro** | A crown — mastery | Gradient: amber→indigo | `Crown` | Gradient border, gradient-mesh bg |

### PricingCard Component Spec

**Base layout:**

```
┌────────────────────────────────┐
│ [Plan icon]  Plan Name         │  ← icon 20px, name Fraunces 600 18px
│ [Plan tagline]                 │  ← Inter 13px neutral-500
│                                │
│  $X.XX                         │  ← Fraunces bold 36px
│       /month                   │  ← Inter 13px neutral-400
│                                │
│  ─────────────────────────     │  ← divider border-border
│                                │
│  ✓ Feature one                 │  ← Inter 14px, check amber-500
│  ✓ Feature two                 │
│  ✓ Feature three               │
│  — Feature four (greyed out)   │  ← dash neutral-300, text neutral-300
│                                │
│  [Select Plan]                 │  ← full-width button
└────────────────────────────────┘
```

**Spark (free tier):**

```tsx
// Styling
className="border border-border bg-card rounded-xl p-6"
// Button
<Button variant="outline" className="w-full">Get started free</Button>
// No badge
```

**Thoughtful (most popular for individuals):**

```tsx
// Styling
className="border-2 border-amber-300 bg-amber-50/50 rounded-xl p-6 relative"
// Badge
<div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-amber-400 text-amber-900 text-xs font-semibold rounded-full">
  Most Popular
</div>
// Button
<Button variant="hero" className="w-full">Get Thoughtful</Button>
```

**Confident:**

```tsx
// Styling
className="border-2 border-indigo-300 bg-indigo-50/50 rounded-xl p-6"
// Button
<Button className="w-full bg-indigo-500 hover:bg-indigo-600 text-white">Get Confident</Button>
```

**Gifting Pro:**

```tsx
// Styling
className="border-2 border-transparent bg-gradient-to-br from-amber-50 to-indigo-50 rounded-xl p-6 relative"
// Gradient border via pseudo-element technique
style={{
  background: 'linear-gradient(white, white) padding-box, linear-gradient(135deg, #D4A04A, #4C2A85) border-box',
  border: '2px solid transparent',
}}
// Badge
<div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gradient-to-r from-amber-400 to-indigo-500 text-white text-xs font-semibold rounded-full">
  Best Value
</div>
// Button — gradient hero
<Button variant="hero" className="w-full">Go Pro</Button>
```

### Current Plan Indicator

When the user is on the credits page or plan selector, their active plan should be marked with a `✓ Current Plan` badge rather than the selection button:

```tsx
{isCurrentPlan ? (
  <div className="w-full py-2 text-center text-sm font-medium text-amber-600 bg-amber-50 rounded-lg border border-amber-200">
    ✓ Current Plan
  </div>
) : (
  <Button ...>{cta}</Button>
)}
```

### Upgrade Path Visual Cue

When a feature is locked to a higher tier, show it greyed out with a lock icon and a micro-upgrade prompt rather than hiding it entirely. This is the "visible aspiration" pattern:

```tsx
<div className="opacity-40 pointer-events-none select-none relative">
  {/* locked feature content */}
  <div className="absolute inset-0 flex items-center justify-center">
    <div className="bg-white/90 rounded-lg px-3 py-1.5 flex items-center gap-1.5 text-xs font-medium text-neutral-600">
      <Lock size={12} />
      Thoughtful plan
    </div>
  </div>
</div>
```

### Plan Comparison Table

On the credits/upgrade page, a table renders all four plans side by side. Visual rules:
- Highlighted column (most popular or current plan) has amber-50 background across all rows
- Feature rows alternate neutral-50 / white for scanability
- Feature checkmarks: `text-amber-500` ✓ for included, `text-neutral-300` — for excluded
- Sticky header row with plan names on scroll (position: sticky, top: 0)

---

## Section 11: Astrological Touchpoints

This section documents where and how the founder's Vedic natal chart informs specific visual and interaction decisions. These are not arbitrary aesthetic preferences — each choice has an astrological rationale that should be preserved as the design system evolves.

### Foundation: The Natal Chart

The design alignment is based on the following placements (Vedic/Jyotish, sidereal):

| Graha | Sign | House | Influence |
|-------|------|-------|-----------|
| Jupiter (Guru) | Sagittarius | 1st | Identity, optimism, expansion — **primary brand energy** |
| Moon (Chandra) | Taurus | 6th | Emotional groundedness, beauty, sensory pleasure |
| Mercury (Budha) | Scorpio | 12th | Precision, analysis, depth of perception |
| Lagna (Ascendant) | Sagittarius | — | Jovial, philosophical, generous — the public face |
| Hasta Nakshatra | Virgo | — | The gifted hand, craft, dexterity |

### Jupiter: Primary Brand Color

Jupiter governs gold, amber, saffron, and the warmth of abundance. The shift from electric purple (`#6C5CE7`) to amber (`#D4A04A`) is a direct astrological correction. Electric purple is associated with Rahu (confusion, illusion, disruptive innovation) — this was an accidental misalignment. Amber/gold is Jupiter's color: trustworthy, generous, auspicious.

**Where Jupiter energy appears:**
- Primary CTA buttons — amber background communicates "this action brings abundance"
- Credit pill in the nav — 🪙 coin emoji + amber coloring
- Confidence badges at 90%+ — the highest confidence is a Jovial pronouncement
- Celebration moments — amber confetti particles
- Active navigation state — amber indicates "you are here, this is auspicious"

### Moon: Warm Neutrals and Tactile Quality

Moon in Taurus governs the senses, beauty, and tactile pleasure. This manifests as:
- All neutrals carry a warm sepia/earth undertone (never cool blue-grey)
- Backgrounds suggest parchment, not pure white
- Shadows use warm sepia tint (`rgba(42, 39, 36, ...)`) not black
- Cards have subtle amber-tinted borders in light mode

The Moon is also about memory — appropriate for a product that "remembers" what people love. The gift history feature and recipient profiles are Moon-governed UI surfaces. These should be especially warm and humanistic in tone.

**Moon-aligned components:**
- Recipient cards — soft warm background, no harsh borders
- Gift history timeline — gentle amber accents, not clinical rows
- Profile page — warmest treatment in the entire app

### Mercury/Virgo: Precision and Clarity

Mercury rules analysis, communication, and precision. Hasta nakshatra (the gifted hand) is in Virgo. This governs:
- **Typography precision:** 1.5px icon stroke width (not 2px = too bold for Mercury's refinement)
- **Data tables:** Clean, minimal, high information density without visual noise
- **Form inputs:** Mercury demands clarity — labels must be visible, validation immediate, errors specific
- **Signal check results:** The analytical breakdown of why a gift was recommended is Mercury's domain — treat it with intellectual precision

**Mercury-aligned components:**
- Input fields — minimal, precise, clear error states
- Signal check breakdown — analytical list format, small text, high density
- Node progress display during recommendation — clinical progress reporting
- All data tables (gift history, referral stats)

### The Hasta Hand Motif

Hasta nakshatra is symbolized by the open, giving hand. It governs craft, skill, and generosity. This is the deepest symbolic anchor of the brand: GiftMind is literally "the gifted hand."

**Usage guidelines:**

The Hasta SVG is a minimalist line-art open hand facing upward:
- Stroke: 1.5px, amber-300 (`#F5C842`)
- No fill
- Size: 48px in empty states, 24px in decorative contexts
- The hand faces upward and open — receiving as much as giving
- Never closed, never pointing

```svg
<!-- Hasta hand SVG spec — simplified line art -->
<svg width="48" height="48" viewBox="0 0 48 48" fill="none"
     xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <!-- Palm base -->
  <path d="M12 28 C12 36 36 36 36 28 L36 20 Q36 16 32 16 L32 12 Q32 8 28 8 
           Q24 8 24 12 L24 10 Q24 6 20 6 Q16 6 16 10 L16 12 Q12 12 12 16 Z"
        stroke="#F5C842" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

**Where it appears:**
1. Empty states — below the heading, above the CTA
2. Onboarding step 1 welcome illustration
3. Email headers (transactional emails)
4. The favicon / app icon can incorporate a subtle hand motif
5. Marketing materials (outside the scope of this PRD)

**Where it does NOT appear:**
- As a UI action icon
- In data-dense views (gift history table, settings)
- On error states (a giving hand should not mark failures)

### Spacing Numerology

Jupiter (3) and Mercury (5) govern the spacing system. The base unit is 4px, but the preferred rhythm favors multiples of 3 and 5:

- `3px` — micro borders, thin dividers
- `6px` — tight internal padding (badges, chips)
- `12px` — standard component padding
- `15px` — Mercury's preferred inner spacing for form elements
- `18px` — Jupiter's standard (3×6)
- `24px` — section padding, card padding
- `30px` — Mercury-5 (5×6) — comfortable breathing room
- `36px` — Jupiter-abundant (3×12) — generous section spacing
- `48px` — section headers, hero padding
- `60px` — Mercury-large (5×12) — feature section separation
- `72px` — Jupiter-max — only for landing page hero sections

**Avoid:** 4px as a prominent multiple, 28px, 56px (Saturn/Ketu influence — restriction, delay). These are fine as internal component values but should not be used for section-level rhythm.

### Auspicious vs. Cautionary Color Uses

**Auspicious (use freely):**
- Amber for primary actions, highlights, celebrations
- Indigo for secondary actions, AI/intelligence contexts, depth
- Warm neutrals for all backgrounds and text
- Emerald/teal for success states

**Cautionary (use purposefully):**
- Red (`#C25450`) — only for genuine errors and destructive actions, never for warnings
- Cool greys — avoid as dominant; only in explicit dark/secondary contexts
- Pure black or pure white — replace with `neutral-950` and `neutral-50`
- Electric purple (`#6C5CE7`) — this is the old primary; replace on sight, as it is Rahu-aligned

**Absolutely forbidden:**
- Fluorescent or neon colors — antithetical to Jupiter's dignified abundance
- Gradients that combine warm and cool in jarring ways (e.g., amber to teal)
- Any color that feels "tech startup" or "gamified" — GiftMind is warm and humanistic

---

## Section 12: Design Tokens — Full Implementation

This section provides the complete, production-ready code for implementing the design system. Copy these blocks verbatim.

### `tailwind.config.ts` (full replacement)

```typescript
import type { Config } from "tailwindcss";
import { fontFamily } from "tailwindcss/defaultTheme";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      fontFamily: {
        heading: ["Fraunces", "Georgia", "serif"],
        body:    ["Inter", ...fontFamily.sans],
        mono:    ["JetBrains Mono", ...fontFamily.mono],
      },
      colors: {
        // Semantic tokens (CSS variable references)
        border:     "hsl(var(--border))",
        input:      "hsl(var(--input))",
        ring:       "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT:    "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT:    "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT:    "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT:    "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT:    "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT:    "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT:    "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        error:   "hsl(var(--error))",
        // Raw palette scales (for direct use in components)
        amber: {
          50:  "#FAF5E8",
          100: "#F5E9C8",
          200: "#EDD490",
          300: "#F5C842",
          400: "#D4A04A",
          500: "#B8852F",
          600: "#96681E",
          700: "#7A5215",
          800: "#573A0E",
          900: "#3D2809",
          950: "#2B1F0F",
        },
        indigo: {
          50:  "#F3EFFA",
          100: "#E2D8F5",
          200: "#C4B1EB",
          300: "#9B7FD4",
          400: "#7A57BE",
          500: "#5E3DA0",
          600: "#4C2A85",
          700: "#3C1F6B",
          800: "#2A1450",
          900: "#1C0C38",
          950: "#160B28",
        },
        neutral: {
          50:  "#FAF7F2",
          100: "#F0EBE1",
          200: "#DDD4C5",
          300: "#C8BBAA",
          400: "#A89A87",
          500: "#8A7E70",
          600: "#6E6358",
          700: "#544A40",
          800: "#3C342A",
          900: "#2A231A",
          950: "#1A1816",
        },
      },
      borderRadius: {
        none: "0px",
        sm:   "4px",
        md:   "8px",
        lg:   "12px",
        xl:   "16px",
        "2xl": "24px",
        full: "9999px",
        DEFAULT: "8px",
      },
      boxShadow: {
        sm:    "0 1px 2px rgba(42, 39, 36, 0.06)",
        md:    "0 4px 8px rgba(42, 39, 36, 0.08), 0 2px 4px rgba(42, 39, 36, 0.06)",
        lg:    "0 8px 16px rgba(42, 39, 36, 0.10), 0 4px 8px rgba(42, 39, 36, 0.06)",
        xl:    "0 16px 32px rgba(42, 39, 36, 0.12), 0 8px 16px rgba(42, 39, 36, 0.08)",
        "glow-amber": "0 0 12px rgba(212, 160, 74, 0.35)",
        "glow-indigo": "0 0 12px rgba(76, 42, 133, 0.25)",
        "card":   "0 2px 8px rgba(42, 39, 36, 0.08)",
        "card-hover": "0 6px 20px rgba(42, 39, 36, 0.12)",
        none:  "none",
      },
      fontSize: {
        "display-xl": ["4.5rem",  { lineHeight: "1.05", letterSpacing: "-0.03em", fontWeight: "700" }],
        "display-lg": ["3.75rem", { lineHeight: "1.08", letterSpacing: "-0.02em", fontWeight: "700" }],
        "display-md": ["3rem",    { lineHeight: "1.10", letterSpacing: "-0.02em", fontWeight: "700" }],
        "display-sm": ["2.25rem", { lineHeight: "1.15", letterSpacing: "-0.01em", fontWeight: "600" }],
        "heading-xl": ["1.875rem",{ lineHeight: "1.25", letterSpacing: "-0.01em", fontWeight: "600" }],
        "heading-lg": ["1.5rem",  { lineHeight: "1.30", letterSpacing: "0em",     fontWeight: "600" }],
        "heading-md": ["1.25rem", { lineHeight: "1.40", letterSpacing: "0em",     fontWeight: "600" }],
        "heading-sm": ["1.125rem",{ lineHeight: "1.45", letterSpacing: "0em",     fontWeight: "600" }],
        "body-lg":    ["1.0625rem",{ lineHeight: "1.70", letterSpacing: "0em",    fontWeight: "400" }],
        "body-md":    ["0.9375rem",{ lineHeight: "1.65", letterSpacing: "0em",    fontWeight: "400" }],
        "body-sm":    ["0.875rem", { lineHeight: "1.60", letterSpacing: "0em",    fontWeight: "400" }],
        "caption":    ["0.8125rem",{ lineHeight: "1.50", letterSpacing: "0.01em", fontWeight: "400" }],
        "micro":      ["0.75rem",  { lineHeight: "1.45", letterSpacing: "0.02em", fontWeight: "500" }],
      },
      spacing: {
        "18": "4.5rem",
        "30": "7.5rem",
        "36": "9rem",
      },
      transitionTimingFunction: {
        "snappy":     "cubic-bezier(0.4, 0, 0.2, 1)",
        "out-warm":   "cubic-bezier(0.0, 0, 0.2, 1)",
        "in-warm":    "cubic-bezier(0.4, 0, 1, 1)",
        "spring":     "cubic-bezier(0.34, 1.56, 0.64, 1)",
        "ceremonial": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      transitionDuration: {
        "fast":       "100ms",
        "normal":     "200ms",
        "moderate":   "300ms",
        "slow":       "500ms",
        "deliberate": "800ms",
        "ceremonial": "1200ms",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to:   { opacity: "1", transform: "translateY(0)"   },
        },
        "fade-in": {
          from: { opacity: "0" },
          to:   { opacity: "1" },
        },
        "gift-reveal": {
          "0%":   { opacity: "0",  transform: "scale(0.95) translateY(12px)" },
          "60%":  { opacity: "1",  transform: "scale(1.02) translateY(-2px)"  },
          "100%": { transform: "scale(1)   translateY(0)"                     },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.9)" },
          to:   { opacity: "1", transform: "scale(1)"   },
        },
        "skeleton-pulse": {
          "0%, 100%": { backgroundColor: "hsl(42 60% 96%)"  },
          "50%":       { backgroundColor: "hsl(42 60% 90%)"  },
        },
        "thinking-wave": {
          "0%, 60%, 100%": { transform: "translateY(0)",   opacity: "0.4" },
          "30%":           { transform: "translateY(-6px)", opacity: "1"  },
        },
        "accordion-down": {
          from: { height: "0" },
          to:   { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to:   { height: "0" },
        },
        "shake": {
          "0%, 100%": { transform: "translateX(0)"    },
          "10%, 50%, 90%": { transform: "translateX(-4px)" },
          "30%, 70%":      { transform: "translateX(4px)"  },
        },
      },
      animation: {
        "fade-up":       "fade-up 300ms var(--ease-out-warm, cubic-bezier(0,0,0.2,1)) forwards",
        "fade-in":       "fade-in 200ms ease-out forwards",
        "gift-reveal":   "gift-reveal 500ms cubic-bezier(0.34,1.56,0.64,1) forwards",
        "scale-in":      "scale-in 200ms cubic-bezier(0.34,1.56,0.64,1) forwards",
        "skeleton":      "skeleton-pulse 1.5s ease-in-out infinite",
        "thinking":      "thinking-wave 1.4s ease-in-out infinite",
        "accordion-down": "accordion-down 200ms ease-out",
        "accordion-up":   "accordion-up 200ms ease-out",
        "shake":         "shake 500ms ease-in-out",
        "pulse":         "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
```

### `src/index.css` (full replacement)

```css
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&display=swap');
@import '@fontsource-variable/inter';
@import '@fontsource/jetbrains-mono/400.css';
@import '@fontsource/jetbrains-mono/700.css';

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* ── Background & Foreground ── */
    --background:          42 33% 97%;    /* #FAF7F2  warm parchment */
    --foreground:          30 16% 14%;    /* #231F1A  warm dark brown */

    /* ── Card ── */
    --card:                42 25% 99%;    /* #FDFCFA  very warm white */
    --card-foreground:     30 16% 14%;

    /* ── Popover ── */
    --popover:             42 25% 99%;
    --popover-foreground:  30 16% 14%;

    /* ── Primary — Jupiter Amber ── */
    --primary:             36 57% 57%;    /* #D4A04A */
    --primary-foreground:  36 57% 12%;    /* #2B1F0F  amber-950 */

    /* ── Secondary — Indigo ── */
    --secondary:           42 30% 93%;    /* #EDE8DF  warm light grey */
    --secondary-foreground: 30 16% 30%;   /* #4A3F36 */

    /* ── Muted ── */
    --muted:               42 20% 92%;    /* #ECE7DE */
    --muted-foreground:    30 12% 44%;    /* #7A6E64 */

    /* ── Accent ── */
    --accent:              42 20% 92%;    /* same as muted — use for subtle highlights */
    --accent-foreground:   30 16% 14%;

    /* ── Destructive ── */
    --destructive:         1 48% 54%;     /* #C25450 */
    --destructive-foreground: 0 0% 100%;

    /* ── Border & Input ── */
    --border:              36 24% 86%;    /* #DDD4C5  warm beige border */
    --input:               36 24% 86%;
    --ring:                36 57% 57%;    /* amber — focus ring */

    /* ── Semantic ── */
    --success:             166 39% 40%;   /* #3E8E7E  teal-green */
    --warning:             36 57% 57%;    /* #D4A04A  same as primary */
    --error:               1 48% 54%;     /* #C25450 */

    /* ── Radius ── */
    --radius:              0.5rem;        /* 8px base */
    --radius-sm:           0.25rem;       /* 4px */
    --radius-md:           0.5rem;        /* 8px */
    --radius-lg:           0.75rem;       /* 12px */
    --radius-xl:           1rem;          /* 16px */
    --radius-2xl:          1.5rem;        /* 24px */
  }

  .dark {
    --background:          30 8% 11%;     /* #1A1816  warm near-black */
    --foreground:          42 33% 97%;    /* #FAF7F2  warm near-white */

    --card:                30 10% 14%;    /* #221F1C */
    --card-foreground:     42 33% 97%;

    --popover:             30 10% 14%;
    --popover-foreground:  42 33% 97%;

    --primary:             38 88% 61%;    /* #F5C842  brighter amber in dark */
    --primary-foreground:  30 16% 8%;     /* #150F0A */

    --secondary:           30 10% 20%;    /* #362F29 */
    --secondary-foreground: 42 33% 85%;   /* #D9D1C5 */

    --muted:               30 10% 20%;
    --muted-foreground:    30 12% 55%;    /* #9A8E82 */

    --accent:              30 10% 20%;
    --accent-foreground:   42 33% 97%;

    --destructive:         1 50% 45%;     /* darker red in dark mode */
    --destructive-foreground: 0 0% 100%;

    --border:              30 10% 22%;    /* #3A332D */
    --input:               30 10% 22%;
    --ring:                38 88% 61%;

    --success:             166 45% 45%;
    --warning:             38 88% 61%;
    --error:               1 50% 55%;
  }

  * {
    @apply border-border;
    box-sizing: border-box;
  }

  html {
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
  }

  body {
    @apply bg-background text-foreground;
    font-family: 'Inter', sans-serif;
    font-size: 15px;
    line-height: 1.6;
    font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
  }

  h1, h2, h3, h4, h5, h6 {
    font-family: 'Fraunces', Georgia, serif;
    font-feature-settings: normal;
  }

  :focus-visible {
    outline: 2px solid hsl(var(--ring));
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }
}

@layer utilities {
  /* Gradient utilities */
  .gradient-primary {
    background: linear-gradient(135deg, #D4A04A 0%, #B8852F 100%);
  }

  .gradient-hero {
    background: linear-gradient(135deg, #D4A04A 0%, #4C2A85 100%);
  }

  .gradient-mesh {
    background:
      radial-gradient(at 40% 20%, hsla(36, 57%, 57%, 0.15) 0px, transparent 50%),
      radial-gradient(at 80% 0%,  hsla(270, 52%, 34%, 0.12) 0px, transparent 50%),
      radial-gradient(at 0%  50%, hsla(36, 57%, 57%, 0.10) 0px, transparent 50%),
      hsl(var(--background));
  }

  /* Shadow utilities */
  .card-shadow {
    box-shadow: 0 2px 8px rgba(42, 39, 36, 0.08);
    transition: box-shadow 200ms ease;
  }

  .card-shadow:hover {
    box-shadow: 0 6px 20px rgba(42, 39, 36, 0.12);
  }

  /* Text utilities */
  .text-balance { text-wrap: balance; }

  /* Skeleton */
  .skeleton {
    @apply animate-skeleton rounded-md;
  }

  /* Focus ring override for amber-background elements */
  .bg-primary :focus-visible,
  .gradient-primary :focus-visible {
    outline-color: #2B1F0F;
  }

  /* Reduced motion overrides */
  @media (prefers-reduced-motion: reduce) {
    .animate-fade-up,
    .animate-gift-reveal,
    .animate-scale-in {
      animation: none;
      opacity: 1;
      transform: none;
    }

    .animate-skeleton {
      animation: none;
    }
  }
}
```

### Font Loading (index.html additions)

Add to `<head>` in `index.html` for optimal loading:

```html
<!-- Fraunces — variable font, all weights -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&display=swap" rel="stylesheet">
```

Install Inter and JetBrains Mono via npm:

```bash
npm install @fontsource-variable/inter @fontsource/jetbrains-mono
```

Import in `src/index.css` (already shown in the CSS block above).

### Button Component (CVA — production-ready)

```tsx
// src/components/ui/button.tsx
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { forwardRef } from "react";

const buttonVariants = cva(
  // Base: all buttons share these classes
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-body font-medium transition-all duration-normal ease-snappy rounded-md text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-amber-500 active:scale-[0.98]",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:scale-[0.98]",
        outline:
          "border border-border bg-transparent hover:bg-muted hover:text-foreground active:scale-[0.98]",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 active:scale-[0.98]",
        ghost:
          "hover:bg-muted hover:text-foreground",
        link:
          "text-primary underline-offset-4 hover:underline p-0 h-auto",
        hero:
          "gradient-primary text-amber-950 font-semibold shadow-md hover:shadow-lg hover:brightness-105 active:scale-[0.98]",
        "hero-outline":
          "border-2 border-primary text-primary bg-transparent hover:bg-primary/10 active:scale-[0.98]",
      },
      size: {
        sm:      "h-8  px-3   text-xs",
        default: "h-10 px-4   text-sm",
        lg:      "h-11 px-6   text-base",
        xl:      "h-13 px-8   text-lg",
        icon:    "h-9  w-9",
        "icon-sm": "h-7 w-7",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
```

---

## Section 13: Acceptance Criteria

This section defines the measurable conditions that determine when the design system is "done" and ready for production use. Each criterion is binary — pass or fail.

### Visual Correctness

- [ ] **Color tokens applied:** `#6C5CE7` does not appear in any component file; all primary references use `hsl(var(--primary))`
- [ ] **Hard-coded hex eliminated:** `FinalCTA.tsx` and `AuthLayout.tsx` no longer contain `#6C5CE7` or `#4834D4`
- [ ] **Fonts loaded:** `Fraunces` loads in ≤ 800ms on a fast 3G connection (LCP impact test)
- [ ] **Fonts applied:** No `font-heading` element renders in Clash Display; heading font is Fraunces
- [ ] **Shadow warmth:** No shadow uses `rgba(0, 0, 0, ...)` — all use `rgba(42, 39, 36, ...)`
- [ ] **Neutral warmth:** No neutral background uses a cool hue (`hsl(210 ...)` or `hsl(234 ...)`)
- [ ] **Icon stroke consistency:** All Lucide icons across the app use `strokeWidth={1.5}`

### Component Coverage

- [ ] **Button variants:** All 6 variants render correctly in both light and dark mode
- [ ] **ConfidenceBadge:** Score tiers (90-100, 75-89, 60-74, <60) each render with correct color treatment
- [ ] **ConfidenceBadge count-up:** Animation fires on first render; respects `prefers-reduced-motion`
- [ ] **PricingCard:** All 4 plan cards render; Thoughtful has "Most Popular" badge; Gifting Pro has gradient border
- [ ] **Empty states:** Dashboard, My People, Gift History, Credits — each has Hasta-aligned empty state with CTA
- [ ] **Skeleton:** Skeleton component uses amber pulse, not grey shimmer

### Accessibility

- [ ] **Contrast: primary on white:** Amber `#D4A04A` is never used for body text (< 18px regular) on `#FAF7F2`
- [ ] **Contrast: all body text:** All foreground/background text pairings pass 4.5:1 (automated scan)
- [ ] **Focus indicators:** No interactive element has `outline: none` without a visible replacement
- [ ] **Form labels:** All form inputs have associated `<label>` elements (not just placeholders)
- [ ] **Screen reader:** Zero critical `axe-core` violations on Landing, Signup, Dashboard, Gift Flow, Credits
- [ ] **Touch targets:** All interactive elements on mobile have ≥ 44×44px touch target
- [ ] **Reduced motion:** All animated components pass `prefers-reduced-motion: reduce` test (animations stop)

### Motion

- [ ] **Page entrance:** New pages animate in with `fade-up` 300ms ease-out-warm
- [ ] **Gift reveal:** First gift card in recommendation results uses `gift-reveal` animation
- [ ] **Celebration:** Plan upgrade triggers confetti with amber + indigo palette
- [ ] **Loading wave:** Recommendation loading shows 3-dot thinking wave, not spinner

### Typography

- [ ] **Scale applied:** `h1` through `h4` tags and `.font-heading` classes render in Fraunces
- [ ] **Body text:** All paragraph text, form labels, and UI labels render in Inter
- [ ] **Optical size:** `Fraunces` uses optical size axis for headings (9–144 range declared in font-face)
- [ ] **Line height:** Body text line-height is 1.6 (not default 1.5 or 1.4)

### Dark Mode

- [ ] **Theme toggle:** Dark mode applies correct warm dark tokens (not Tailwind defaults)
- [ ] **No cold greys in dark:** Dark mode neutrals use `hsl(30 ...)` warm tones
- [ ] **Amber readable in dark:** Primary amber `#F5C842` (brighter dark-mode variant) passes 4.5:1 on dark background

### Performance

- [ ] **Font LCP:** Fraunces headline visible within 1.2s on fast 3G (preload link or Google Fonts swap)
- [ ] **Inter FOUT:** No flash of unstyled text for Inter body (font-display: swap acceptable, font-display: block not acceptable)
- [ ] **Bundle:** Adding Inter and JetBrains Mono via `@fontsource` does not increase JS bundle (they are CSS-only imports, not JS)
