# SquadWars · Design System

The canonical design reference. Every new page, component, or screen flows from here. When you change a token, update this file. When you add a pattern, document it.

Base principles come from `client/.agents/skills/frontend-design/SKILL.md` — read that first if you haven't. This document is the **project's specific answer** to that brief.

The first rendered implementation of this system is `client/app/auctionroom/[slug]/AuctionRoom.tsx`. New work should match its idioms before innovating.

---

## 1. Subject & philosophy

SquadWars is a real-time 1v1 football auction. The world is **broadcast football meets the auction house**: stadium floodlights, scout dossiers, the chalk lines on the pitch, the gavel. Every UI choice descends from that vocabulary, not from a generic dashboard library.

The page is loud where the game is loud (the countdown, the bid-holder banner, the dossier hero) and quiet everywhere else. **Spend boldness in one place per screen.**

### Three defaults we explicitly reject

These read as AI-generated regardless of subject. Do not use them:

1. Warm cream background (~#F4F1EA) + high-contrast serif display + terracotta accent.
2. Near-black background + a single bright acid-green or vermilion accent. *This was our first draft of AuctionRoom. Rejected. Do not regress.*
3. Broadsheet hairline rules + zero border-radius + dense newspaper columns.

If you find yourself reaching for any of these, stop and re-ground in the subject.

---

## 2. Palette

The palette is **role-mapped, not vibes-mapped**. Each colour means something specific. Never use a role colour for "general accent."

```css
/* surfaces — meaningful stack, do not invent more layers */
--ink:        #0B1018;   /* page background; slight blue-purple chroma, NEVER pure black */
--surface-1:  #131A24;   /* card */
--surface-2:  #0F1620;   /* sunken / inset (inputs, list rows) */
--surface-3:  #1A2230;   /* elevated chip / button rest */

/* role accents */
--chalk:        #F2EDE0; /* YOU — pitch chalk-line, warm off-white */
--floodlight:   #FFB627; /* AI / OPPOSITION — sodium-vapour lamp amber */
--whistle:      #E63946; /* TIME-CRITICAL / DANGER — referee red */
--keeper-blue:  #6FB1FF; /* DEF (and GK secondary) — cool stadium blue */

/* text */
--text:   #EFEFEF;
--muted:  #9099A8;
--dim:    #5C6573;

/* hairlines — never use solid greys for borders */
--hairline:         rgba(255, 255, 255, 0.06);
--hairline-strong:  rgba(255, 255, 255, 0.10);

/* soft tints — for hover, glow backgrounds, category washes */
--chalk-soft:        rgba(242, 237, 224, 0.10);
--floodlight-soft:   rgba(255, 182, 39, 0.12);
--whistle-soft:      rgba(230, 57, 70, 0.16);
--keeper-blue-soft:  rgba(111, 177, 255, 0.12);
```

### Category mapping (player positions)

Every category gets a single accent. This is load-bearing — it's how the user reads the dossier and the dressing-room cards at a glance.

| Category | Accent       |
|---------:|--------------|
| ATT      | whistle      |
| MID      | floodlight   |
| DEF      | keeper-blue  |
| GK       | chalk        |

### Hard rules

- **YOU is always chalk. AI is always floodlight.** Never swap. This is the most load-bearing decision in the system. Wherever you display user-vs-AI data, this mapping must hold.
- **Whistle is reserved for danger.** Low-time countdown, validation errors, "going once". Don't dilute by using it as a generic accent.
- **Page background is `--ink`**, augmented by two faint radial gradients — floodlight ~3.5% alpha at top-left, chalk ~2.5% alpha at bottom-right. Don't add more.
- **No pure black, no pure white, no fully saturated primary green or pure blue.**

---

## 3. Typography

Three faces, three roles. **Do not introduce a fourth.**

```
Display:  Saira Condensed   (500 / 700 / 800)   — eyebrows, badges, big numerals, signage
Body:     Inter             (400 / 500 / 600 / 700) — UI prose, paragraph text
Mono:     JetBrains Mono    (500 / 700)         — prices, codes, tabular data
```

Loaded via `@import` in the inline tokens block of `AuctionRoom.tsx`. Reuse the same `@import` in new pages.

### Where each face goes

- **Saira Condensed** is the personality of the brand. Use it for everything with *signage* energy: section labels, position chips, the countdown, player names, headlines. Almost always UPPERCASE with 0.10–0.22em tracking.
- **Inter** is the workhorse. Body copy, helper text, descriptions, paragraph blocks.
- **JetBrains Mono** is for numerals you want to read across rows: bid prices, budgets, lot indices, ago-times, player IDs. Always with `font-variant-numeric: tabular-nums` (the `.sw-mono` class handles this).

### Type scale

| Role                              | Size  | Weight | Tracking      | Face    |
|-----------------------------------|------:|-------:|--------------:|---------|
| Hero numeral (countdown)          | 84px  | 800    | -0.01em       | Display |
| Big mono price                    | 44px  | 700    | -0.02em       | Mono    |
| Player name (dossier)             | 28px  | 800    | 0.005em       | Display |
| Section heading (complete view)   | 22px  | 800    | 0.02em        | Display |
| Position primary chip             | 14px  | 800    | 0.16em        | Display |
| Display body label                | 13–15px | 700  | 0.10–0.22em   | Display |
| Body prose                        | 12–14px | 400/500 | normal     | Body    |
| Mono medium                       | 13–16px | 700  | -0.01em       | Mono    |
| Eyebrow                           | 10px  | 700    | 0.22em        | Display |
| Micro mono                        | 10–11px | 500  | 0.04–0.08em   | Mono    |

### Eyebrow rule

Section labels use the `sw-eyebrow` class — 10px UPPERCASE, tracked 0.22em, `--muted`. This is the broadcast lower-third register. **Apply per card**, not per region.

`sw-eyebrow-dim` (with `--dim`) is the quiet variant — for secondary labels within a card (`ALSO PLAYS`, `BY COUNTRY`, `BY CLUB`).

---

## 4. Layout

### Full-viewport grids

Pages fill the viewport. The Auction Room is a 3-column `display: grid` sized to `calc(100vh - 70px)`:

```css
grid-template-columns: minmax(260px, 1fr) minmax(520px, 2.05fr) minmax(290px, 1.05fr);
```

Collapses to single column below 1180px.

**Future pages should be full-bleed by default.** Reserve `max-width` centering for read-top-to-bottom content (the Complete view does this).

### Card column stacking

Each column is a `.sw-col` — `display: flex; flex-direction: column; gap: 10px; min-width: 0; min-height: 0`. The `min-*: 0` rule is critical so flex children with internal scroll behave correctly.

The Auction Room follows this shape:

```
LEFT (treasury rail)        CENTRE (the floor)              RIGHT (squad)
─────────────────────       ─────────────────────────       ─────────────────────
Treasury                    Countdown clock (signature)     Highest Bid Board
Ledger                      Dossier + Bid Console           Dressing Room (cards)
Chemistry
```

Top elements are smaller / fixed-ish. Bottom elements `flex: 1` and contain a `.sw-scroll` when their content can overflow.

### Spacing scale

```
gap-tight:           3px, 4px       — within a tightly-packed row (pip row, chip cluster)
gap-row:             5px, 6px, 8px  — between row siblings (ledger rows, list items)
gap-card:            10px, 12px     — between cards in a column
padding-card-tight:  8–10px         — inside chips, side pills
padding-card:        12–14px        — inside .sw-card
```

### Border radius

Stick to the scale. Don't introduce 15, 20, 999.

```
4–6 px  — chips, small chips
6–8 px  — inputs, small cards (signed-player cards, bid-holder banner)
10–12 px — main cards (.sw-card), top bar
```

---

## 5. Component vocabulary

These are the reusable building blocks. Add to this list when you introduce a new one — don't fork into one-offs.

### `.sw-card`

The container. 14px padding, 12px border-radius, `--surface-1` background, `--hairline` border.

```html
<div class="sw-card">
  <span class="sw-tick-tl" /><span class="sw-tick-tr" />
  <span class="sw-tick-bl" /><span class="sw-tick-br" />
  <div class="sw-corner-mark">PAGE 2 · YOU</div>
  <div class="sw-eyebrow">Section label</div>
  ...content...
</div>
```

### Corner ticks (`sw-tick-tl/tr/bl/br`)

Four 10px L-brackets in `--hairline-strong`, one per corner. They're the unifying broadcast detail that makes any card feel like part of the system. **Add them to every new card.** Cost: 4 empty `<span>`s.

### `.sw-corner-mark`

Optional 10px mono catalogue label in the top-right of a card (`EXCHEQUER · L01`, `PAGE 2 · YOU`, `FORMATION · 4-3-3`). Used to add an auction-catalogue / dossier feel. Always factual, never decorative. If it doesn't say something *true* about the card's contents, leave it out.

### `.sw-eyebrow`

The 10px display-type section label sitting at the top of every card. UPPERCASE, 0.22em tracking, `--muted`. Pairs with `sw-eyebrow-dim` for quieter (sub-section) contexts.

### `.sw-chip`

11px display-type tag in `--surface-3`, 1px hairline border, UPPERCASE, 0.10em tracking. Use for small alternates, micro-tags. **Dashed-outline variant** is for alt/secondary info (see ALSO PLAYS strip in the dossier).

### `.sw-btn` / `.sw-btn-bid`

- `.sw-btn` is utility — `+1M`, `+5M`, `+10M`, `← home`, etc. Display type, UPPERCASE, 0.10em tracking, `--surface-3` rest, brightens on hover.
- `.sw-btn-bid` is the commit button: chalk fill, ink text, weighty drop-shadow, 0.18em tracking. **At most one bid-style button per screen.** Don't dilute the commit signal.

### `.sw-bar` / `.sw-bar-fill`

3–6px tracks. Fill is either a solid colour or a 2-stop linear gradient (`chalk → off-white`, `whistle → red-pink`, etc.). Use for stat bars, progress bars, countdown timer fill.

### `.sw-num` / `.sw-mono`

Tabular-numeric utility classes. `.sw-num` enables `font-variant-numeric: tabular-nums`. `.sw-mono` does the same and switches to JetBrains Mono.

### Pip row

A horizontal row of N small filled rectangles, one per slot (e.g. 4 for Defence, 3 for Attack). Filled left-to-right as slots fill. **Only use for sequence-bearing groups** — never for decoration. See `DressingRoom` for the canonical implementation.

### Accent stripe

A 2–6px vertical bar on the LEFT edge of a card or row, in the role colour. Signals ownership: chalk = you, floodlight = AI, category colour = player's position. Used in the bid-holder banner, signed-player cards, dressing-room section headers, chemistry cluster rows. Cheap, effective, ubiquitous.

### `.sw-live-dot`

7px pulsing dot. Used to signal "live", "now", "stoppage". Inherits the colour you set on it via `background` + `boxShadow`. Pair with a `sw-eyebrow` text label next to it.

### `.sw-sunken`

A `--surface-2` panel with a `--hairline` border, 8px radius. Use for *inset* content within a card (the You / AI pills in Treasury, the input field).

---

## 6. Established patterns

### The three-state pattern (YOU / AI / NONE)

Any ownership indicator uses **distinct visual treatment per state**, not just colour. The triplet:

| State | Fill                | Text  | Border       | Marker                   |
|-------|---------------------|-------|--------------|--------------------------|
| YOU   | chalk solid         | ink   | none         | solid ink dot            |
| AI    | floodlight solid    | ink   | none         | solid ink dot            |
| NONE  | transparent surface-2 | muted | dashed hairline | dashed outlined ring   |

Implemented in: the bid-holder banner (above +1/+5/+10), the HighestBidBoard. Whenever you build a new ownership indicator, replicate this triplet — don't just swap colour.

### Signature element per screen

Each major screen has **one** signature: a single oversized, animated, identity-carrying element. The Auction Room's signature is the **split-flap countdown clock**. The Home / Chalkboard's signature is the **chalk-line pitch with markers that re-chalk themselves when you switch formation**. Everything else stays quiet around it.

When designing a new page, decide what its signature is in the design plan *before* writing CSS. Examples for future screens:
- **Match Result**: a huge full-time scoreboard with two side-by-side squad columns flipping in player by player.

### The Landing pattern (`/`)

The very first screen. A doorway, not a control panel. The hero is the brand wordmark.

**Wordmark composition.** Two-color: `SQUAD` in `--chalk`, `WARS` in `--floodlight`. Saira Condensed weight 800, font-size clamped `clamp(72px, 13vw, 168px)`, line-height 0.86 so the two halves of the lockup feel like one mass, letter-spacing tightened to `-0.005em`. A soft floodlight `text-shadow: 0 0 32px rgba(255, 182, 39, 0.10)` reads as ambient stadium glow — not a drop-shadow effect, not a glow filter that "bounces."

**Page rhythm.** Top: tiny catalog stamp (`SQUADWARS · MATCHDAY 01 · PRE-GAME`) + backend status — broadcast lower-third minimal. Middle: wordmark, tagline, one paragraph of body copy, the START button. Bottom: a single-line spec strip with `TREASURY · QUEUE · ON THE BLOCK · STARTING XI · SHAPES` as label/value pairs, hairline-divided from above. **Five facts about the game, no more.** Don't list features.

**Entrance choreography.** Stagger the hero block in over 700ms total:
- Wordmark: `sw-wordmark-in` 0ms — clip-path reveal top-to-bottom + 14px upward translate.
- Tagline: 200ms `sw-fade-in`.
- Body paragraph: 300ms `sw-fade-in`.
- Commit row: 400ms `sw-fade-in`.

One orchestrated moment, not five. After that the page is still.

**The only commit.** A single chalk `sw-btn-bid` reading `▶ START GAME` with a slightly larger drop-shadow than auction-page bids (`0 10px 30px rgba(242, 237, 224, 0.22)`) — it's the page's only weight. Helper text right of it stays in `--font-mono` `--dim` so it can't compete. Clicking navigates to `/setup` (the Chalkboard). No formation choice on this page — that decision belongs to the Chalkboard.

**Backend offline.** If `/health` 404s, the button still renders but explains itself before navigating — the landing should never push the user into a flow it can't deliver. Set the error in `--whistle-soft` adjacent to the button.

### The Chalkboard pattern (Pre-match / `/setup`)

The home page is a tactics chalkboard, not a marketing landing. The hero is the pitch.

**Vertical pitch SVG.** ViewBox `0 0 100 140`. Own goal at the bottom (y ≈ 92), opposition box at the top (y ≈ 15). Lines: outer rectangle, halfway line at y=70, center circle r=11 at (50,70), top + bottom penalty + goal areas, four corner arcs, three faint spots. Stroke `--chalk-soft` 0.35 units for the soft lines, `rgba(242,237,224,0.18)` 0.4 for the touchlines (slightly brighter perimeter). Goal lines get the strong stroke too.

**Player markers** (one per XI slot — sums to 11):
- Filled chalk circle r=3.8 in viewBox units.
- Stroke = category accent (whistle for ATT, floodlight for MID, keeper-blue for DEF, chalk for GK).
- Outer 0.8-stroke "halo" ring at r+1.2 with 30% opacity in the same accent — gives each marker the floodlit glow.
- Inside, single uppercase letter G / D / M / A (`--font-display`, weight 800, size r × 1.25) in `--ink`. Position implied by pitch coordinates; the letter codes the category, not the position role.

**The re-chalk animation.** When the user picks a different formation, the SVG is keyed on `formation.name` so React remounts the markers. Each `<g>` runs a `sw-chalk-on` keyframe — `opacity 0 → 1`, `transform scale 0.4 → 1` over 460ms cubic-bezier. **Stagger order: GK first (0ms), then DEF (80ms), then MID (220ms), then ATT (360ms)** — a coach setting the team up from the back. Within a category, +40ms per marker index. Total cascade ≈ 700ms. **One animation, one moment** — the comparison between formations IS the morph.

**Mini-pitches in tiles.** Same SVG, smaller. No letters inside markers, no halos. When a tile is selected (chalk fill, ink text), the marker circles invert to `--ink` fill with no stroke — they read as ink on chalk, matching the inverted tile state. When unselected, normal chalk fill + category-accent stroke.

**Tile state pattern** (extension of the three-state ownership rule):
- Selected: chalk fill, ink text, solid chalk border, soft chalk-glow shadow.
- Hover: surface-1 background, solid `--chalk-soft` border (upgrade from dashed).
- Rest: surface-1 background, **dashed** `--hairline-strong` border — encodes "pickable / not yet picked", consistent with dashed = empty/quiet elsewhere.

**Tile label** uses a two-line stack: formation number (`4-3-3`) in mono 11px, then tactical identity (`THE ORTHODOXY`) in display 9px tracked 0.20em. Number is the *what*, identity is the *why*.

### Numbering that means something

Numbering devices (`LOT 03 / 33`, `#287469` on a dossier corner mark) are only used when the underlying data is sequential or referential. Never as decoration. If a section has a `01 / 02 / 03` strip, the strip must encode real order.

### Dashed outline = empty / placeholder / quiet

Dashed borders consistently mean *absent* or *secondary*: `OPEN slot` cards in Dressing Room, alt-position chips in the dossier, the `NO BIDS YET` banner. **Don't use dashed borders for anything else.**

### Category-coloured primary, ghost-outlined secondary

When showing a primary thing and its alternatives (primary position vs. alt positions, primary club vs. previous clubs), the **primary is bold + filled in its category accent**, the **alternates are demoted to dashed ghost chips**. Strong hierarchy at a glance.

### Bright pedestal for transparent imagery

FC25 player photos are transparent PNGs. On dark surfaces they look "buried" — the dark backing shows through their transparent backgrounds. Fix: use a bright radial-gradient pedestal:

```css
background: radial-gradient(circle at 50% 35%, #FFFFFF 0%, var(--chalk) 45%, #DCD7C8 100%);
box-shadow:
  0 6px 18px rgba(0, 0, 0, 0.45),
  0 0 0 1px rgba(0, 0, 0, 0.25),
  inset 0 0 0 1px rgba(255, 255, 255, 0.4);
```

Apply this whenever you put a transparent player image on a dark or tinted surface.

---

## 7. Motion

Two animations carry the system. **Do not add a third unless it replaces one of these.**

```css
/* sw-flap — split-flap reveal, used on every changing digit */
@keyframes sw-flap-down {
  0%   { transform: rotateX(-90deg); opacity: 0; }
  60%  { opacity: 1; }
  100% { transform: rotateX(0deg);   opacity: 1; }
}

/* sw-tick-in — entrance for new list items, banners, bids, cards */
@keyframes sw-tick-in {
  0%   { transform: translateY(-12px); opacity: 0; clip-path: inset(0 0 100% 0); }
  100% { transform: translateY(0);     opacity: 1; clip-path: inset(0 0 0% 0); }
}
```

Plus one ambient:

```css
/* sw-pulse — used on live dots */
@keyframes sw-pulse {
  0%, 100% { opacity: 0.35; transform: scale(0.9); }
  50%      { opacity: 1;    transform: scale(1.15); }
}
```

Reaching for `bounce`, `spin`, `wobble`, `flip-card-3d`, parallax, etc. is the wrong default. Orchestrate one moment, don't scatter effects.

### Re-keying for entrance

To re-fire `sw-tick-in` when a value changes, set `key={state-value}` on the React element. Examples:
- The HighestBidBoard price re-keys on `${state}-${lot.currentBid}` so it slide-flashes on each bid.
- The bid-holder banner re-keys on `${highBidder}-${currentBid}`.

---

## 8. Voice & vernacular

Words are design material. Use the football auction lexicon, not generic UI labels:

| Generic         | SquadWars                              |
|-----------------|----------------------------------------|
| Wallet / Budget | Treasury, Exchequer                    |
| Your buys / Roster | Dressing Room, Squad                |
| Player profile  | Dossier, Scout report                  |
| Time remaining  | On the block · Going once · Stoppage   |
| Won the lot     | Took it · Gavel                        |
| Auction ended   | Full Time                              |
| Opposing player | Opposition                             |
| Opening bid     | Floor set by the house                 |
| Highest bid     | Hammer price                           |
| Spending detail | Ledger · Treasury detail               |
| Squad synergy   | Chemistry · Brewing                    |
| Bid (verb)      | Lodge bid                              |
| Pre-match setup | Chalk the line · Pick your shape       |
| Start match     | Take to the floor                      |
| Formation name  | Shape · Identity (e.g. THE ORTHODOXY)  |

### Voice rules

- **Active voice always.** Buttons name the action: `Lodge bid`, not `Submit`.
- **Status reads like a broadcaster**: `You lead` / `AI leading` / `Going once`. Not `User is winning`.
- **Errors don't apologise.** They explain what happened in the interface's voice and how to fix it.
- **Empty states invite action.** `no links forming yet · sign players from a shared nation or club` — not `No data.`

---

## 9. Anti-patterns

Things observed in early drafts that we deleted. Don't bring them back.

- **Neon green (#22FF88) as the primary accent.** This is the AI-default dark+neon look. Chalk is our YOU colour, period.
- **Country flag emoji or club crests** as inline imagery. We use bolder text typography instead — chalk display type for the club, tracked uppercase chalk for the country. Revisit only with a legal asset source.
- **Generic "you / them" labels with grey/grey colour.** YOU = chalk, AI = floodlight. Even in dense data views.
- **Card-on-card-on-card nesting beyond 2 levels.** Surface stack is meaningful (`ink → surface-1 → surface-2 → surface-3`). More layers = visual mud.
- **More than one bid-style button per screen.** The chalk-filled commit is the signature action. If you need a second priority action, use a `.sw-btn` (utility), not another bid-style.
- **Visible scrollbars inside cards.** Always `scrollbar-width: none` + `::-webkit-scrollbar { display: none }` on `.sw-scroll`.
- **Mixing border-radius values.** Stick to 4 / 6 / 8 / 10 / 12 / 14.
- **Border-only buttons** (transparent fill + 1px border) — they look weak against `--ink`. Always fill `.sw-btn` with `--surface-3`.
- **Drop-shadowed cards with bouncy hover lifts.** Cards are static. Motion is reserved for actually-changing content.
- **A second display font** for emphasis. Saira Condensed handles every level of emphasis via weight + tracking.
- **Decorative numerals or status badges** that don't reflect real underlying data.

---

## 10. Checklist before merging a new page or component

- [ ] Did I ground in the SquadWars subject (broadcast / auction / pitch) instead of reaching for a generic dashboard default?
- [ ] Did I pick ONE signature element and let everything else stay quiet?
- [ ] Are colours role-mapped (chalk = you, floodlight = AI, whistle = danger, category accents for ATT/MID/DEF/GK), not vibes-mapped?
- [ ] Did I use Saira Condensed for display + Inter for body + JetBrains Mono for tabular data — and nothing else?
- [ ] Is there a `sw-eyebrow` on every card?
- [ ] Are corner ticks on every card?
- [ ] Do internal scroll regions use `.sw-scroll` (hidden bars)?
- [ ] Do ownership indicators use the full three-state pattern (fill + border + marker), not just a colour swap?
- [ ] Are dashed borders reserved for empty / alt / quiet?
- [ ] Are transparent player images on a bright radial-gradient pedestal?
- [ ] Did I avoid the three rejected defaults (cream-serif-terracotta, dark-acid-green, broadsheet-hairlines)?
- [ ] Are buttons in active voice, named for the action they perform?
- [ ] Did I update this file with any new tokens, patterns, or vocabulary I introduced?

---

## Reference

- **Skill** (philosophy): `client/.agents/skills/frontend-design/SKILL.md`
- **Live implementations**:
  - Landing (`/`): `client/app/page.tsx`
  - Chalkboard / formation picker (`/setup`): `client/app/setup/page.tsx`
  - Auction Room (`/auctionroom/[slug]`): `client/app/auctionroom/[slug]/AuctionRoom.tsx`
- **Inline token block**: the `const tokens` template literal at the top of `AuctionRoom.tsx` (and the parallel one in `page.tsx`). Copy this whole block into any new top-level component that needs the system.
