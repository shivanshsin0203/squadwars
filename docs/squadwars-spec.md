# SquadWars — Implementation Specification

> **Living spec for the 2-week solo MVP.** Hand this to Claude Code to plan and execute. Everything in §12 "Locked decisions" is settled — do not relitigate. Open questions for the implementer are listed in §13.

---

## 1. Product overview

**SquadWars** is a free-to-play, browser-based football auction game.

**Core loop (≈90 seconds per match):**
1. Player picks a formation.
2. Live English-style auction against an AI manager — players come up one at a time, bid up, highest wins.
3. Drag-drop the winnings into formation slots, see real chemistry.
4. Deterministic result revealed as a head-to-head category showdown + AI-written match report.
5. Every match produces a shareable card + (fast-follow) a "who'd win?" public poll.

**Audience:** football fans, FUT / EA-FC players, casual web gamers. India primary, globally playable. Currency shown as Euro.

**Goals (in priority order):**
1. Portfolio centerpiece for job applications.
2. Viral distribution via shareable result cards.
3. Architectural foundation that supports multiplayer (v2) without rewrites.

**Timeline:** **2 weeks** for solo-vs-AI launch. Multiplayer is v2, gated on launch response.

---

## 2. Tech stack (final)

| Layer | Choice | Why |
|---|---|---|
| Frontend framework | Next.js 15 (App Router) on Vercel | Server Components, `opengraph-image.tsx` for per-match share cards, streaming Suspense for the AI report |
| Backend API | Hono on Cloudflare Workers | ~5ms cold starts, edge-native, TypeScript + Zod first-class |
| Active match state | Cloudflare Durable Objects | One DO instance per match (`AuctionMatch` class). Holds queue, current lot, AI plan, squads, bid log in memory with built-in persistence. Destroyed after match completes. |
| Completed match storage | Neon Postgres + Drizzle ORM | Stores one `match_results` row per finished match. Active-match tables (`matches`, `match_lots`) from earlier drafts are gone — that state lives and dies in the DO. |
| Auth | Auth.js (NextAuth v5) | "Own auth" — open-source code in repo, no vendor account. Deferred to fast-follow |
| LLM | DeepSeek v4 via Vercel AI SDK | Two uses: (1) async cap planning per lot transition, off the critical bid path; (2) post-match report. Never inside the synchronous bid loop. |
| Validation | Zod | Shared schemas between client and server |
| Player data | Bundled `players.json` | Static, read-only, 300 records (30 GK / 90 DEF / 90 MID / 90 ATT), jumbled across categories |
| Player photos | `/public/players/<id>.webp` | Static assets served by Vercel CDN |
| Object storage | None for v1 | R2 only if user-uploaded content arrives later |

**Day-one setup priorities:** CORS between Vercel frontend and Cloudflare Workers backend, shared types package (`packages/shared/` with Zod schemas consumed by both ends), env vars wired in both deploys, Vercel spending alerts enabled, **paid Workers plan enabled (Durable Objects require it)**.

---

## 3. Architecture — the keystone

One principle governs everything:

> **The auction is a pure reducer `(state, action) => newState` that knows nothing about its action source.** The reducer lives inside a Durable Object (one per match), wrapped in an `AuctionMatch` class. In v1, an AI bidder (server-side) emits actions. In v2, a second human emits actions through the same reducer. Same game logic, different transport. The keystone is now *server-located*, not client-located.

### State location

There is exactly one source of truth for an in-flight match: the **Durable Object instance for that match**. The frontend never holds the queue, the cap, or the bid log — it holds a *projection* of the current lot for rendering. Workers are stateless processors; the DO is the persistent runtime.

- **Active match → DO** (in-memory, auto-persisted by DO storage API).
- **Completed match → one row in Postgres**, written when the match ends.
- DO calls `storage.deleteAll()` after the Postgres write succeeds.
- **No Redis.** No active-match tables in Postgres. Single source of truth, single writer.

### Trust boundary

Everything that affects outcome lives server-side. The client is a renderer + a UX-only timer.

- **Player queue** — DO-only knowledge. Never sent to the client.
- **AI cap & AI bid amount** — DO-only knowledge. Client only sees AI bids *after they're placed*.
- **Lot timer (authoritative)** — DO tracks `lotStartedAt` + extensions, returns `expiresAt` timestamps to the client.
- **Lot resolution** — server decides the winner via reconciliation at `/lot-end`. Client cannot lie about who won.
- **Scoring** — server-only, run inside the DO on `/result`.

### What the client does

- Renders state snapshots returned from the API.
- Sends user bid actions.
- Runs a `setTimeout` that triggers `/ai-fire` at the moment the server told it to. This is UX-layer only — if the client never fires, server reconciliation handles it at `/lot-end` (see §5).
- Renders the lot countdown locally from the server-provided `expiresAt`.
- Optimistically renders the user's own bids; AI bids only appear when the server confirms them.

### Event serialization (now server-side, inside the DO)

A DO is single-threaded by design. Concurrent requests for the same match queue and execute one at a time. The reducer processes each one to completion before the next runs. This kills the entire class of "what if user click and AI fire arrive together?" bugs at the platform level — Cloudflare guarantees it.

### Transport

Plain HTTP. No WebSocket, no SSE, no polling. Four endpoints (see §7). Each frontend timer cycle costs at most one round-trip; honest play is ~8 round-trips per lot. Server-side timers (DO Alarms) are explicitly **out of scope for v1** — the frontend-trigger + lot-close-reconciliation pattern covers the meaningful cheat surface.

---

## 4. Game mechanics

### Pre-auction

- Player picks a formation. v1 ships with **4-3-3, 4-2-3-1, 3-5-2** (more in fast-follow).
- Formation is committed before the first lot — it's a fixed scaffold for the entire auction.

### Auction rules

- English-style ascending; one player on the block; real-time timer.
- **Free buy** — player can win any player regardless of position needs. Overstock buys earn no value but are not blocked (used strategically to drain opponent budget).
- **No "next-up" preview** — every lot is a surprise. Queue is server-held; clients see only the current player.
- **Anti-snipe soft close:** any bid within the last 5 seconds extends the timer by 5 seconds. Lot only sells after a quiet gap.
- **Round count:** ~22 lots per match (11 needed + small surplus for overstock dynamics). Tunable.
- **Starting budget:** ₹200M default (tunable).

### Auction room screen elements

- **Header (3 cells):** You (budget, count bought) | timer + round/total | AI (budget, count bought). AI's *squad* is **not** shown; only its budget and count.
- **Center (player on block):** photo, name, position, club, country, position-specific stats, chemistry delta badge (`+7 chem` or `-3 chem`), current bid + holder, bid controls (`+1M`, `+5M`, custom, big primary bid button).
- **Right panel (your buys):** 4 buckets — Attack X/3, Midfield X/3, Defence X/4, Goalkeeper X/1 — with player chips. Need indicator is amber when incomplete, neon green when full.
- **Bottom bar:** recent sales ticker (`AI won K. De Bruyne · ₹51M`) + `₹39M avg left per slot` readout.
- **"Going once / going twice / sold"** beat with audio + visual pulse in the final seconds.

### Position-specific stats shown

- Attacker: PAC, SHO, DRI, PHY
- Midfielder: PAS, DRI, PHY, PAC
- Defender: DEF, PHY, PAC, HEA
- Goalkeeper: DIV, HAN, REF, KIC

### Chemistry model (locked)

**Definition:** Each player has an individual chemistry score (0–100). Team chemistry is the **average** of per-player contributions.

**Per-player contribution drivers:**
- **Club links** — players sharing a club boost each other (weighted high)
- **Country links** — players sharing nationality boost each other (weighted high)
- **Position-fit penalty** — out-of-position players drop their *own* chemistry, dragging the team average

**Why average (not sum):** so deltas can be both positive AND negative. Adding a well-linked player pulls the average up (+); adding a loner drags it down (−). This makes the `-3 chem` case meaningful.

**Position-fit is folded into chemistry — NO separate "squad points" system.** One number, two things to optimize.

### Chemistry visibility (suspense + soft signal)

- **Overall chemistry is hidden during the auction** — preserves the reveal at squad-building.
- **Per-player +/- chem delta is shown on the player-on-block card** — link-only calculation, positions assumed ideal. This is the "soft signal" middle ground: skilled players can draft toward links; the final number is still a surprise.
- **Auction delta = link-only chemistry contribution.** Final chemistry at XI-building can resolve lower because position-fit penalties apply when slots are assigned. That gap is the surviving suspense (`auction promised 82, XI resolved to 74`).

### Squad-building screen

- Drag-drop bought players into formation slots.
- **Multi-position players** (e.g. LW/ST, LCM/CM): each player has `primary_position` + `positions[]` (eligible list). Placing in primary = full value; eligible-but-not-primary = small penalty + soft caution; not-in-list = big penalty + hard caution.
- **Bench:** overstock buys sit here, earn no value, can be swapped in for tactical XI tweaks.
- **Chemistry meter** (now revealed): big 0–100 number with breakdown ("links 82 · position −8 → 74"). Animates as players are swapped.
- **Confirm button:** "Lock XI & play match" — submits final XI + bench to server for scoring.

### Result mechanism (locked — deterministic, NOT simulation)

The result is a deterministic function of both squads. **Five categories:**
1. **Attack** — aggregate of attackers' offensive stats
2. **Midfield** — aggregate of midfielders' all-round stats
3. **Defence** — aggregate of defenders' + GK defensive stats
4. **Chemistry** — final team chemistry (0–100)
5. **Budget efficiency** — overall rating per unit spend (rewards smart drafting)

**Verdict** = best of 5 categories (e.g. 3–2 win).

**Result screen reveal:**
- Verdict banner at top (animated)
- Five category rows animate in one at a time; each "lights up" the winner side
- AI-written match report streams in below (LLM call via Vercel AI SDK)
- Shareable match card at the bottom + (fast-follow) "Who'd win?" public poll button

**Why deterministic:** same squads → same verdict. Fair, replayable, no AI-as-judge feel-bad. The category reveal IS the simulation — it's animation over a stat showdown, not an event-driven match engine.

---

## 5. AI bidder (the heart of solo mode)

**Architectural principle: split valuation from execution.** The LLM does strategic thinking (caps) *asynchronously*, ahead of where bidding actually is. Heuristic code in the DO does tactical execution (when and how much to bid) *synchronously* using pre-baked caps. The LLM is never in the bid loop.

### Layer 1: LLM-driven valuation (caps)

The DO maintains a `forwardPlan` — a sliding window of upcoming caps:

```ts
forwardPlan: Map<playerId, cap>   // e.g. { p123: 65, p456: 80, p789: 0 }
```

**Inputs to each LLM call:**
- Next 3 players in the queue
- AI's current squad (positions filled, players bought)
- User's current squad
- Both budgets
- Current forward plan (so the LLM can revise its earlier thinking)

**Output:** a plan for **the next 2 lots ahead of where bidding is** — array of `{ player_id, cap }`. `cap = 0` means "skip this player." The LLM is also responsible for player premium, scarcity weighting, position need, and overall aggression — all the strategic judgement formerly hardcoded in the heuristic Layer 1 of earlier drafts.

**Timing — the sliding window:**

1. **Pre-match:** synchronous LLM call seeds the plan for lots 1, 2, 3 before bidding starts.
2. **Lot N starts:** snapshot `forwardPlan[currentPlayer.id]` into `LotState.cap`. Cap is now **frozen** for this lot — no mid-lot revisions.
3. **As lot N begins:** kick off **async** LLM call to plan for lots N+1, N+2 (refresh & extend forward plan).
4. **During lot N:** bidding proceeds against the frozen cap. Zero LLM calls during bidding.
5. **Async LLM call returns:** validate output, update `forwardPlan`. Lot N's cap is untouched (already snapshotted). Lots N+1, N+2 now have fresh caps.
6. **Lot N closes → lot N+1 begins:** repeat from step 2.

The lookahead means there is **always a cap ready** when a lot starts.

**Fallback if the async LLM call doesn't return in time:** heuristic cap = `Math.pow(player.overall, 2) / 80`, clamped to `0.8 × remaining_budget`. LLM updates supersede the fallback when they arrive. The LLM is enhancement; the auction never blocks on it.

**Output validation:** cap is a non-negative integer ≤ `0.8 × remaining_budget`; `player_id` matches the queued player. Failed validation → fall back to heuristic for that player.

### Layer 2: Heuristic bid execution (in the DO)

The bid decision is synchronous, sub-millisecond, and runs every time the AI fires:

```ts
// Fired when /ai-fire arrives (frontend trigger)
if (lotState.cap > lotState.currentBid) {
  amount = min(lotState.currentBid + minIncrement, lotState.cap);
  appendBid({ by: "ai", amount });
} else {
  walk();  // no new plan issued
}
```

That's the entire execution layer. No valuation, no scarcity, no strategic re-evaluation — those were the LLM's job, and the cap already reflects them.

### Timing the AI bid — frontend `setTimeout` triggers `/ai-fire`

The server controls *when* the AI bids by returning a `delayMs` in every response. The frontend's only job is to call `/ai-fire` when that timer fires.

- On lot start, server returns initial plan: `{ planId, delayMs }` (e.g. 2-4s to "open" the lot).
- Client sets `setTimeout(fireAi, delayMs)`.
- On `/ai-fire`, server confirms the plan is still `pending`, computes the bid amount **at fire-time** (against current state), and records it.
- On user bid, server cancels the pending plan, issues a new one with a new `delayMs`, returns it.
- `delayMs` is server-clamped to never exceed `expiresAt − safetyMargin`. AI cannot miss the close.

**Server picks the delay (not the client).** The delay encodes pacing intent — patient when the cap is generous, snappier when the timer is short. The client just honors the number.

**No bid amounts in plan responses.** The plan response carries only `{ planId, delayMs }`. The amount is computed when `/ai-fire` arrives. Nothing about the AI's intent leaks to the browser.

### Reconciliation at lot close (the cheat defense)

The frontend timer is trusted for UX only. If the user blocks `/ai-fire` via devtools, AI bids never fire during the lot. The server fixes this at lot close:

```ts
// On POST /lot-end:
if (lotState.cap > lotState.currentBid) {
  // "Lot-close shot" — AI takes its one guaranteed bid
  amount = min(lotState.currentBid + minIncrement, lotState.cap);
  appendBid({ by: "ai", amount, t: expiresAt - 1 });
}
resolveWinner();
```

The user can never win a lot below the AI's cap. The honest-play case (`/ai-fire` fired normally) leaves the lot-close shot a no-op; the cheat case results in AI winning for cheap. The cheater gains nothing.

### Difficulty

Single knob: change the LLM prompt's framing of `aggression` (e.g., "play conservatively — preserve budget" vs "play aggressively — chase elite players hard"). Ship **one tuned default** for launch ("moderate, slightly winnable"). Wins drive shares; an AI that crushes first-timers kills the viral loop. Easy/Hard selector is fast-follow.

---

## 6. Data model

### Players (`players.json`, bundled with code)

```ts
type Player = {
  id: number;
  name: string;
  positions: string[];          // e.g. ["ST", "CF"]
  primary_position: string;     // first in positions
  category: "GK" | "DEF" | "MID" | "ATT";   // derived from primary_position
  overall: number;
  club: string;
  country: string;
  value_eur: number;
  stats: { pac: number; sho: number; pas: number; dri: number; def: number; phy: number };
  photo_url: string;            // original sofifa CDN url
  photo_path: string;           // "/players/<id>.webp" (local resized copy)
};
```

**300 players, no tiers, FC 26 base cards only:**
- 30 goalkeepers
- 90 defenders
- 90 midfielders
- 90 attackers

Curated by `curate-players.ts`: reads `FC26_players.csv`, buckets by primary-position category, takes top N per category by `overall` (floor of 78), downloads sofifa photos, resizes to 600×600 WebP, writes `players.json`. The file is shuffled across categories so the order in the file already mixes positions — the auction queue can be drawn straight from it.

**Why no icons/legends:** FC 26 source CSV is base cards only — historical icons (Pelé, Maradona, etc.) aren't in it. Sourcing them is a separate dataset problem deferred past v1. Tier-based card styling and the gold-shimmer treatment can be reintroduced when an icons dataset exists.

**Auction queue per match:** 3 GK + 10 DEF + 10 MID + 10 ATT = **33 lots**, drawn from the pool and jumbled across categories. Variety pool ≈ 3× draw, so ~3 unique queues' worth of headroom before repetition.

**Real names and photos are used.** Decision is reversible — photos are just `/public` assets, swappable to stylized treatment later if needed.

### Durable Object state (lives during play, never written to Postgres)

```ts
class AuctionMatch {
  // Persisted automatically via DO storage between requests
  matchId: string;
  shareId: string;
  userId: string | null;
  formationUser: string;
  aiDifficulty: "moderate";              // single value for v1

  queue: Player[];                       // 33 players, fixed at match creation
  lotIndex: number;                      // cursor — never mutates the queue itself
  status: "in_progress" | "complete";

  user: { budget: number; bought: { lotIndex: number; player: Player; price: number }[] };
  ai:   { budget: number; bought: { lotIndex: number; player: Player; price: number }[] };

  forwardPlan: Map<playerId, cap>;       // LLM-produced caps for upcoming lots
  llmInFlight: boolean;
  llmLastSuccessAt: number;

  lotState: {                            // null between lots
    lotIndex: number;
    player: Player;
    startedAt: number;
    expiresAt: number;
    cap: number;                         // snapshotted from forwardPlan, frozen
    currentBid: number;
    highBidder: "user" | "ai" | null;
    bidLog: { t: number; by: "user" | "ai"; amount: number }[];
    pendingAiPlan: { planId: string; dueAt: number; status: "pending" | "fired" | "cancelled" } | null;
  } | null;
}
```

When the match completes, the DO writes a single `match_results` row to Postgres and calls `storage.deleteAll()`. **In that order** — Postgres write must succeed before the DO state is destroyed, or the match is lost.

### Postgres schema (via Drizzle)

```ts
// match_results — the ONLY active-match-adjacent table for v1
{
  id: uuid PK,
  share_id: string unique,
  user_id: string?,                       // nullable for anonymous play
  formation_user: string,
  user_squad: jsonb,                      // { xi: [{slot, player_id}], bench: [player_ids] }
  ai_squad: jsonb,
  user_chemistry: int,
  user_overall: int,
  ai_chemistry: int,
  ai_overall: int,
  category_scores: jsonb,                 // { attack: {you, ai, winner}, midfield, defence, chemistry, budget_eff }
  verdict: enum,                          // 'user_win' | 'ai_win' | 'draw'
  tally: string,                          // e.g. "3-2"
  ai_report_text: text,
  lot_log: jsonb,                         // compact: [{lot, player_id, winner, final_price}, ...33]
  created_at: timestamp
}

// poll_votes (fast-follow)
{
  share_id: string,
  vote: enum,                             // 'user' | 'ai'
  fingerprint: string,                    // anti-spam
  created_at: timestamp,
  PRIMARY KEY (share_id, fingerprint)
}

// users (fast-follow — Auth.js)
{
  id: uuid PK,
  username: string unique,
  email: string?,
  oauth_provider: string?,
  avatar_url: string?,
  created_at: timestamp,
  // denormalized stats for dashboard
  wins: int,
  losses: int,
  best_chemistry: int,
  favourite_formation: string,
  biggest_steal_player_id: int?
}

// daily_challenges (fast-follow)
{
  date: date PK,                          // YYYY-MM-DD
  seed: int,                              // deterministic seed for reproducible queue
  player_pool: jsonb,
  budget: int
}
```

**Gone from earlier drafts:** `matches` and `match_lots` tables. Active-match state lives in the DO; only the frozen result reaches Postgres. `lot_log` in `match_results` is the minimal audit trail (~2KB per match) that powers "biggest steal" features and dispute review later, without requiring a schema migration.

---

## 7. API surface (Hono on Cloudflare Workers → Durable Object)

All routes validate input with Zod. CORS configured for prod + preview Vercel domains. Worker routes are thin — they route by `:id` to the corresponding `AuctionMatch` DO and forward the request body. The DO method does the real work.

```
POST   /api/match
  body: { formation_user }
  side effects:
    - create new DO with fresh matchId
    - build queue (33 from jumbled players.json)
    - synchronous LLM call → seed forwardPlan for lots 1, 2, 3
    - open lot 1
  returns: {
    match_id, share_id,
    first_player, lot_index: 0,
    expires_at,           // server-authoritative lot timer
    ai_plan: { plan_id, delay_ms } | null
  }

POST   /api/match/:id/bid
  body: { lot_index, amount }
  validates: amount > currentBid + minIncrement, user has budget, lot_index matches
  side effects:
    - append to bidLog, update currentBid/highBidder
    - if timer < 5s: extend expires_at (anti-snipe)
    - cancel any pending AI plan, issue new one with new delay_ms
  returns: { current_bid, high_bidder, expires_at, ai_plan: { plan_id, delay_ms } | null }

POST   /api/match/:id/ai-fire
  body: { lot_index, plan_id }
  validates: plan_id matches a pending AI plan
  side effects:
    - compute AI bid amount NOW against current state
    - if cap > currentBid: append bid, mark plan "fired"
    - else AI walks (plan → "cancelled", no new plan)
  returns: { ai_bid: { amount } | null, current_bid, high_bidder, expires_at, ai_plan: { ... } | null }

POST   /api/match/:id/lot-end
  body: { lot_index }
  validates: expires_at has actually passed (1s tolerance)
  side effects:
    - reconciliation: if cap > currentBid, AI bids min(cap, currentBid + minIncrement)
    - resolve winner, deduct budget, push player into winner's bucket
    - advance lotIndex; if queue exhausted → status = "complete"
    - otherwise snapshot next lot's cap from forwardPlan into new lotState
    - kick off async LLM call to extend forwardPlan
  returns:
    if still in progress: { lot_index: n+1, player, expires_at, ai_plan }
    if complete:          { status: "auction_complete" }

POST   /api/match/:id/result
  body: { user_squad, user_bench }
  side effects:
    - validate squad against user.bought
    - run scoring engine → category_scores → verdict
    - generate AI report (streaming via Vercel AI SDK)
    - INSERT match_results row in Postgres
    - state.storage.deleteAll() — DO state destroyed
  returns: { result, share_id }

GET    /api/match/:shareId/public
  returns: result payload + AI report (read from Postgres)
  used by: share page + opengraph-image + (later) poll

POST   /api/match/:shareId/vote      (fast-follow)
  body: { vote, fingerprint }
  returns: { tally }

GET    /api/leaderboard/daily        (fast-follow)
GET    /api/profile/:username        (fast-follow)
POST   /api/auth/*                   (fast-follow — Auth.js)
```

**Plain HTTP throughout.** No WebSocket, no SSE. The frontend's `setTimeout` calls `/ai-fire` at the moment the server scheduled; reconciliation at `/lot-end` covers the case where the client doesn't.

---

## 8. Frontend routes (Next.js App Router)

```
/                        Landing page (SSG)
/play                    Anonymous match entrypoint
/play/auction            Auction room (client component, primary game UI)
/play/build              Squad-building screen (client component)
/play/result             Result screen (client + SSR for share-back)
/m/[shareId]             Public match share page (SSR + opengraph-image.tsx)
/u/[username]            Public profile page (fast-follow)
/leaderboard             Daily leaderboard (fast-follow)
/dashboard               User dashboard (login-gated, fast-follow)
/login                   Auth.js entry (fast-follow)
```

### `opengraph-image.tsx` for `/m/[shareId]`

- Renders dynamic per-match card via Next's `ImageResponse` (Satori).
- Cached aggressively (immutable per `share_id`).
- The viral lever — every shared link unfurls as a rich card on X / iMessage / WhatsApp / Slack.

---

## 9. Aesthetic & UI direction

> **Implementation note (current phase):** UI/UX is intentionally deferred. We are building backend + frontend wiring first with a deliberately bare placeholder UI (plain HTML, system fonts, no theming). The FUT dark + neon direction below is the **target** to apply once the full game loop is implemented end-to-end. Do not invest in styling, animation, or polish until the implementation milestones in §11 are complete; revisit this section then.

**FUT dark + neon** — premium sports-game energy.

- Base: near-black `#0A0E14`; elevated surfaces `#141B24`
- Primary accent (active bid, chemistry positive, wins, CTAs): neon green — start `#22FF88`, soften to `#3DD688` if too aggressive
- Warning amber: `#FFB020` (out-of-position, "going once")
- Danger red: `#FF3D5A` (timer < 5s, losses)
- Display font: condensed heavy sans (Druk Wide / Bebas Neue / Anton family) for headlines
- Body: Inter or Geist Sans
- Numbers / timers / scores: tabular-figures (`font-feature-settings: "tnum"`); digits must NOT jitter while counting
- Subtle neon glow on primary accents; ICON-tier cards have a gold holo shimmer on hover
- No retro / arcade / esports-twitch directions; no stock football photography

**Stitch attempt was discarded.** Design is done directly in code based on the wireframes from this conversation thread.

---

## 10. Performance, cost, and scaling

### Caching from day one (critical)

- `/m/[shareId]` share page → `revalidate: false` (immutable per share)
- `opengraph-image.tsx` → write the generated PNG to static storage after first render; serve as a static asset thereafter
- AI report → persist in `match_results.ai_report_text`; only the first render computes it
- `/api/match/:shareId/public` → CDN-cached with long TTL

A viral match getting 1M views costs roughly the same as one getting 100 — *if* caching is set up right.

### Cost ladder (rough INR-equivalent monthly)

- **0–10K matches/month:** free tiers across the stack. ~₹100 in DeepSeek API. Negligible.
- **10K–100K:** Vercel Pro overage maybe $30–80/month total. Manageable.
- **100K–1M:** $100–300/month on Vercel with good caching, double without. Threshold to start offloading.
- **1M+:** success problem; offload AI report generation to a Railway Node worker (~$5–10/month).

### Vercel spending alerts → enable day one.

### Migratability

Business logic (scoring engine, AI bidder, chemistry math, AI report prompt) lives in **pure TypeScript modules with zero Vercel- or Cloudflare-specific dependencies**. The day cost or scale forces a piece to a long-running Node worker, it's a re-wiring, not a rewrite. Same pattern as the reducer being transport-agnostic for v2 multiplayer.

---

## 11. Implementation order (14 days)

### Week 1 — core loop

| Day | Build |
|---|---|
| 1 | Project scaffolding: Next.js on Vercel, Hono Worker on Cloudflare with DO binding, Neon DB (results table only), Drizzle migrations, `packages/shared/` types package, CORS, Vercel spending alerts, paid Workers plan enabled |
| 2 | ✅ Player dataset already done — `players.json` (300 records, jumbled) + photos in `public/players/` |
| 3 | `AuctionMatch` DO: reducer (pure), bid execution heuristic (pure), chemistry math (pure) — all unit-tested in isolation. **Pivotal day** |
| 4 | LLM cap-planning: prompt template, DeepSeek call via Vercel AI SDK, output validation, heuristic fallback. Sliding-window orchestration inside the DO |
| 5 | HTTP endpoints wired up: `/match`, `/bid`, `/ai-fire`, `/lot-end`. Reconciliation tested with cheat-path integration tests |
| 6 | Auction room UI (client component) — visual timer from `expires_at`, optimistic user bids, `setTimeout` for `/ai-fire`, render AI bids from server responses |
| 7 | Squad-builder screen + drag-drop + position-fit cautions + scoring engine (chemistry with position penalty, 5 category aggregates, verdict) |

### Week 2 — result, share, polish

| Day | Build |
|---|---|
| 8 | Result screen + animated category-by-category reveal (Framer Motion) |
| 9 | AI report: prompt template, DeepSeek call via Vercel AI SDK, Suspense streaming, persistence |
| 10 | Match share page `/m/[shareId]` (SSR) + `opengraph-image.tsx` (dynamic PNG) |
| 11 | Landing page (long-scroll, FUT dark + neon, mobile-first) |
| 12 | Polish: animations, sound effects (going once / twice / sold), mobile responsive for auction room (bucket drawer), accessibility pass |
| 13 | Bug bash, cache headers everywhere, OG image regression test, deployment dry-runs |
| 14 | Launch + tweet thread + monitor spending alerts |

### Fast-follow (week 3+, post-launch)

- Auth.js integration + login flow
- Dashboard (match history, stats, biggest steal)
- Public profile pages
- Daily challenge + leaderboard
- "Who'd win?" public poll
- Easy / Hard difficulty selector
- More formations (4-2-3-1, 3-5-2, 5-3-2, 4-4-2…)

### v2 (gated on launch response)

- Multiplayer by adding WebSocket handlers to the same `AuctionMatch` DO. Cloudflare DOs have first-class WebSocket support including hibernation — no separate Node service required, no Socket.io on Railway/Fly.
- The auction reducer is **already server-side** (it lives in the DO in v1). The opponent slot accepts a WebSocket message source instead of the AI scheduler. Zero game-logic rewrite — pure re-wiring.

---

## 12. Locked design decisions (do not relitigate)

1. Free-buy auction; no positional locks during bidding.
2. No "next-up" preview.
3. Chemistry hidden during auction; per-player +/- delta badge shown on current card.
4. Chemistry = average of per-player contributions, 0–100, normalized.
5. Position-fit penalty folded into chemistry (no separate "squad points").
6. AI's squad NOT shown during auction (only its budget and bought count).
7. Result is deterministic — head-to-head category reveal. Never a simulation, never AI-as-judge.
8. AI generates a post-scoring match report; the LLM never arbitrates the verdict.
9. **AI bidder is split: LLM does valuation (caps, strategic judgement) asynchronously; heuristic code in the DO does bid execution (when, how much) synchronously. The LLM is never in the synchronous bid loop.**
10. **LLM is called twice per match minimum: (a) per lot transition for cap planning, async, off critical path; (b) once for the post-match report. Plus an initial synchronous call at match start to seed the forwardPlan.**
11. Real player names + photos used (IP risk acknowledged; reversible since photos are just `/public` assets).
12. Anonymous play primary; login features (dashboard, leaderboard, poll, daily challenge) are fast-follow.
13. Mobile-first landing; desktop-first auction room with mobile bucket drawer.
14. 2-week solo MVP; multiplayer is v2 gated on launch response.
15. **Stack: Next.js (Vercel) + Hono (Cloudflare Workers) + Cloudflare Durable Objects (active match) + Neon Postgres (completed matches only) + Drizzle + Auth.js (deferred) + DeepSeek via Vercel AI SDK.**
16. Player data is bundled JSON, not in DB. Photos are `/public` static assets.
17. **No Redis. No active-match tables in Postgres. DO is the single source of truth for in-flight matches.**
18. **Server-authoritative on everything that affects outcome: queue, AI cap, AI bid amount, lot timer, lot resolution, scoring. Client renders state snapshots; runs a UX-layer `setTimeout` to trigger `/ai-fire`; optimistically renders the user's own bids. Holds zero game logic.**
19. **Plain HTTP transport. No WebSocket, no SSE, no polling for v1.**
20. **Frontend `setTimeout` triggers AI bids; server-side reconciliation at `/lot-end` (lot-close shot) closes the cheat surface where the client blocks `/ai-fire`. Server-side timers (DO Alarms) are explicitly out of scope for v1.**
21. **DO writes `match_results` to Postgres on completion, then calls `storage.deleteAll()`. In that order. Active state is never archived; only the frozen result reaches durable storage.**
22. **Player dataset: 300 players (30 GK / 90 DEF / 90 MID / 90 ATT), FC 26 base cards only. No icons/legends tier in v1. Curated by `curate-players.ts`.**
23. **Auction queue: 3 GK + 10 DEF + 10 MID + 10 ATT = 33 lots, drawn from the jumbled pool, shuffled across categories so consecutive lots vary by position.**

---

## 13. Open questions for implementation

Things deliberately not pinned down — fill in during build, document the choice in a `decisions.md`:

- **LLM cap-planning prompt template** — the central question. Inputs (next 3 players, both squads, both budgets, current forwardPlan), output schema (`[{ player_id, cap }]`), system-prompt framing of aggression. Needs writing.
- **Heuristic fallback cap formula** for when the async LLM call doesn't return before its lot starts. Suggested starting point: `Math.pow(player.overall, 2) / 80`, clamped to `0.8 × remaining_budget`.
- **LLM output validation rules** — cap is integer, ≥ 0, ≤ `0.8 × remaining_budget`, `player_id` matches the queued player. Failed validation → fall back to heuristic for that player.
- **AI fire delay distribution** — server-picked random with strategic skew (snappier when cap is generous, more patient when the queue has comparable players coming, clamped to `expiresAt − safetyMargin`). Tune during play-testing.
- **Position-fit penalty magnitudes** (suggested: −3 chem for eligible-not-primary; −10 chem for not-in-list).
- **Category aggregate formulas** (starting points):
  - **Attack** = average of attackers' `(SHO + PAC + DRI) / 3`
  - **Midfield** = average of midfielders' `(PAS + DRI + PHY) / 3`
  - **Defence** = average of defenders' `(DEF + PHY) / 2` + GK's `(DIV + REF + HAN) / 3`
  - **Chemistry** = team chemistry directly
  - **Budget efficiency** = `team_overall × 100 / spend_as_pct_of_starting_budget`
- **Bid increment scaling** (suggested: flat ₹1M below ₹20M, ₹5M to ₹50M, percentage-based above).
- Anti-snipe extension duration (5s — already settled, kept here for reference).
- Starting budget (₹200M — already settled, kept here for reference).
- **AI report prompt template** — separate LLM use, post-match. Accepts the full structured match payload (formations, both squads, category scores, verdict) and outputs 3 short sentences max in sports-broadcast voice. Explain the result, don't speculate.

**Closed (resolved in this revision):**
- ~~`baseValue(rating)` curve~~ — moot. LLM owns valuation; heuristic curve survives only as a fallback.
- ~~`needMultiplier` curve, `scarcityFactor`~~ — moot. Folded into LLM's strategic context.
- ~~Difficulty parameter knobs~~ — replaced by single LLM-prompt aggression setting. One default for launch.
- ~~AI snipe-at-buzzer tactical behavior~~ — dropped. AI bid timing is just the server-picked delay clamped against `expiresAt`.
- ~~Reducer location~~ — server (inside the DO), not client.

---

## 14. Files already produced

- **`curate-players.ts`** — player dataset curator. Reads `FC26_players.csv`, buckets by primary-position category, takes top N per category (30/90/90/90, OVR ≥ 78 floor), downloads sofifa photos, resizes to 600×600 WebP, writes `players.json`. Tier/icons/legends logic removed — FC 26 CSV doesn't contain historical players.
- **`players.json`** — 300 players, categories `GK | DEF | MID | ATT`, with `value_eur` field, shuffled across categories. Ready to bundle.
- **`public/players/*.webp`** — ~300 photos, 600×600, ~30KB each. Local copies of sofifa headshots.
- **`FC26_players.csv`** — source dataset (sofifa-derived, 18,405 rows). Stays in the repo for re-curation.

Everything else is to be built from this spec.

---

## 15. Standing rules

- **Ship on deadline.** If anything runs late, cut features, never extend.
- **Build the engine portable.** Pure TS modules with no platform deps for: scoring, bid execution heuristic, chemistry math, AI report prompt, LLM cap-planning prompt. Only the DO wrapper (HTTP routing + persistence calls) is Cloudflare-specific. Moving off Cloudflare would mean rewriting the wrapper, not the game.
- **Cache before you launch, not after.** The viral surface must be cached on day one or one hot link will cost real money.
- **The auction reducer is the keystone.** Get it pure, transport-agnostic, and unit-tested before any UI or DO method consumes it. Everything else is a thin wrapper.
- **Frontend is a renderer.** No game logic on the client. The `setTimeout` for `/ai-fire` is a UX timer, not a decision. Server integrity does not depend on the client behaving honestly.
- **Two-phase finalize.** Postgres write before `storage.deleteAll()`. Always.

---

**End of spec.** Read §12 first when you sit down to plan. Then §11 (build order). Then everything else as needed.
