# SquadWars · Architecture

This is the **how it actually fits together** document. The original product brief lives in [`squadwars-spec.md`](./squadwars-spec.md). The visual / design system lives in [`client/design.md`](../client/design.md). This file sits between them — what we built, where it lives, and why.

If you're new here, read this top-to-bottom. If you're hunting a specific subsystem, the section headings are the index.

---

## 1. Product in one paragraph

SquadWars is a 1v1 live football auction game. You and an AI bidder take turns at the rostrum across 33–35 lots — real footballers, real OVRs, real market values — with a €1B treasury each. You pick a tactical shape (4-3-3, 4-4-2, 3-5-2, 5-3-2, 3-4-3, 4-2-3-1) before kick-off; the shape decides the queue composition and the starting XI you're trying to fill. The side with the higher XI average OVR at full time wins. The AI's bidding is steered by DeepSeek (`deepseek-chat`) wrapped in a server-side strategy layer that prevents budget hoarding, enforces XI completion, and stays cheap (~$0.01 / match at current cache hit rates).

---

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Server runtime | Node 22 + Hono | Hono is Cloudflare Workers-native; this lets the entire server move to a Worker + Durable Object later with **only** the `store.ts` and the listener replaced. The match logic doesn't change. |
| Server build | `tsx watch --env-file=.env` | No build step in dev. Hot-reload picks up edits in ~300ms. |
| Type system | TypeScript strict, ESM-only (`"type": "module"`, `.js` suffixes on relative imports) | ESM is what Workers will need too. |
| LLM | DeepSeek `deepseek-chat` via the OpenAI SDK (`baseURL: "https://api.deepseek.com"`) | Cheap (~$0.14 per 1M cache-miss input tokens, $0.0028 cache-hit), strong JSON-mode adherence, and the prompt cache is reliable across same-system-prompt calls. |
| Client framework | Next.js 16.2.9 (App Router, Turbopack) | The auction loop is a client component that mounts once and stays mounted; Next does the routing chrome. |
| Client UI | React 19.2.4, hand-rolled inline `<style>` token blocks | We deliberately do NOT use Tailwind or a UI library — the design system in `client/design.md` is opinionated enough that a generic kit would dilute it. |
| Concurrency | In-memory promise chain mutex per matchId (`store.withLock`) | Models Durable Objects' single-threaded-per-ID semantics. |
| Persistence | None today — the `Map` in `store.ts` is the world. | When we move to DO, `Map` becomes DO storage; everything else stays. |

---

## 3. Repository layout

```
bestsquad/
├── docs/                                ← you are here
│   ├── architecture.md                  ← this doc
│   └── squadwars-spec.md                ← original product spec
├── client/
│   ├── design.md                        ← canonical design system
│   ├── AGENTS.md                        ← reminder to read Next 16 docs (breaking changes vs training data)
│   ├── app/
│   │   ├── page.tsx                     ← /        landing (brand wordmark + START GAME)
│   │   ├── setup/page.tsx               ← /setup   Chalkboard (formation picker)
│   │   └── auctionroom/[slug]/
│   │       ├── page.tsx                 ← Next.js wrapper that reads slug param
│   │       └── AuctionRoom.tsx          ← /auctionroom/:id   the main game (~2000 LOC)
│   ├── lib/
│   │   ├── types.ts                     ← MatchStateDTO / LotStateDTO / Player (mirror of server wire types)
│   │   └── format.ts                    ← fmtMoney, fmtCountdown
│   └── .agents/skills/frontend-design/SKILL.md  ← upstream design philosophy
├── server/
│   ├── players.json                     ← 300-player pool (30 GK / 90 DEF / 90 MID / 90 ATT)
│   ├── src/
│   │   ├── index.ts                     ← Hono bootstrap + CORS
│   │   ├── config.ts                    ← single source of truth for tunables + FORMATIONS map
│   │   ├── types.ts                     ← domain types + wire DTOs
│   │   ├── store.ts                     ← Map<matchId, AuctionMatch> + withLock mutex
│   │   ├── routes/
│   │   │   ├── health.ts
│   │   │   ├── auctionroom.ts
│   │   │   └── match.ts                 ← all 7 match endpoints
│   │   ├── match/
│   │   │   ├── AuctionMatch.ts          ← the class — one instance per match
│   │   │   ├── playerPool.ts            ← module-scope 300-player pool + buildQueue(formation)
│   │   │   └── ai.ts                    ← computeAiBidAmount + computeHeuristicCap (fallback when LLM fails)
│   │   ├── llm/
│   │   │   └── deepseek.ts              ← system prompt + planCaps + validatePlan (all server-side floors)
│   │   └── scratch/                     ← node-runnable diagnostic scripts (npx tsx src/scratch/*.ts)
│   └── tsconfig.json
├── playthrough.mjs / playthrough-v2.log  ← manual end-to-end scripts (legacy)
└── README.md
```

---

## 4. Game flow

```
   ┌─────────────────┐    click START GAME    ┌─────────────────┐
   │  /  Landing     │ ─────────────────────▶ │  /setup         │
   │ brand wordmark  │                        │  Chalkboard     │
   │ START GAME btn  │                        │ formation picker│
   └─────────────────┘                        └────────┬────────┘
                                                       │ pick shape
                                                       │ TAKE TO THE FLOOR
                                                       ▼
                                              ┌─────────────────────┐
                                              │ POST /api/match     │
                                              │ { formation }       │
                                              │ → seedForwardPlan() │  (sync LLM call for lots 1–2)
                                              │ → returns matchId   │
                                              └────────┬────────────┘
                                                       │ router.push
                                                       ▼
                                              ┌─────────────────────────────────┐
                                              │ /auctionroom/:id  AuctionRoom   │
                                              │ ─────────────────────────────── │
                                              │ GET /state                      │
                                              │ POST /start  → lot 1 opens      │
                                              │ ─────────────────────────────── │
                                              │ loop until lot N:               │
                                              │   • user bids   POST /bid       │
                                              │   • AI fires    POST /ai-fire   │ (client setTimeout)
                                              │   • timer hits  POST /lot-end   │ (recon shot + advance)
                                              │ ─────────────────────────────── │
                                              │ status=complete → CompleteView  │
                                              └─────────────────────────────────┘
```

### The lot loop in detail

For each lot, the server is authoritative on every transition:

1. **`POST /start`** — `AuctionMatch.startLot()` reads `forwardPlan.get(playerId)` (LLM's cap, populated async) or falls back to `computeHeuristicCap`. Sets `lot.cap` (server-secret), `expiresAt = now + 20s`, opens with `currentBid = player.value_eur` (the floor set by the house). Schedules a `pendingAiPlan` for somewhere in 1.2–4.7s. Returns `MatchStateDTO` (no cap).
2. **User bids** — `POST /bid { lotIndex, amount }`. Server validates: integer, > 0, >= currentBid + €1M, <= user.budget. Appends to `bidLog`, sets `highBidder = "user"`. Cancels the pending AI plan and schedules a fresh one. If bid lands within last 5s, extends `expiresAt` by 7s (anti-snipe).
3. **AI fires** — client's `setTimeout(() => POST /ai-fire, delayMs)` triggers. Server recomputes the AI bid **right now** (never trusts a client-sent amount): if `currentBid + €1M > cap`, AI walks (returns `aiBid: null`). Otherwise bids `currentBid + €1M`.
4. **Lot ends** — client posts `POST /lot-end` when the countdown hits 0 (with a 1s server tolerance for clock skew). If `highBidder !== "ai"` and AI's cap still allows it, server fires a **reconciliation shot** — one guaranteed bid at the close so a user blocking `/ai-fire` cannot cheat the AI out of winning. Resolves the winner, debits the winner's budget, advances `lotIndex`, opens the next lot, and kicks off async LLM planning for the lookahead.

All four endpoints go through `withLock(matchId, ...)` so concurrent requests for the same match serialize.

### Where current-lot state lives

The entire "what's being bid on right now" state is one nullable field on the match instance:

```
AuctionMatch (in store.ts's matches Map, keyed by matchId)
  └── lotState: LotState | null
        ├── lotIndex        which lot in the queue
        ├── player          the Player up for auction
        ├── startedAt       server timestamp the lot opened
        ├── expiresAt       server timestamp the lot ends (mutable — anti-snipe pushes it forward)
        ├── cap             AI's max — SERVER SECRET, never sent to client
        ├── currentBid      the live price right now
        ├── highBidder      "user" | "ai" | null
        ├── bidLog          BidEntry[] — every bid this lot, append-only
        └── pendingAiPlan   AiPlanState | null — the AI's next scheduled fire
```

`lotState` is `null` before lot 1 opens, `null` between lots, and `null` again after `endLot` runs. Between `startLot` and `endLot` it carries the live auction state. Every bid mutates it in place. Once the lot ends, the winning side's `bought[]` grows by one and `lotState` is wiped — no per-lot history is retained on the match instance beyond `lotIndex` advancing.

The lot OPENS at `currentBid = player.value_eur` (the market value, the "floor set by the house") but with `highBidder = null`. Nobody is winning until someone beats the floor by at least `MIN_INCREMENT`. This is what makes the UNSOLD outcome possible — a lot can expire with `currentBid = value_eur` and `highBidder = null` if neither side ever bid.

### The four bid scenarios

**Scenario A — nobody bids.**
AI's `pendingAiPlan` ticks down on the client. Client posts `/ai-fire`. Server recomputes `computeAiBidAmount({ currentBid: value_eur, cap })`:
- Cap reaches `value_eur + €1M` → AI bids, sets `highBidder = "ai"`, clears the plan. No new plan scheduled (the AI is winning and doesn't bid against itself).
- Cap below the floor → AI walks. `pendingAiPlan.status = "cancelled"`, `currentBid` / `highBidder` unchanged. Lot just keeps counting down with `highBidder = null`.

**Scenario B — user bids first.**
`userBid` validates (`checkValidBid`: positive integer, `≥ currentBid + €1M`, `≤ userBudget`). Appends to `bidLog`, sets `highBidder = "user"`. Calls `extendTimerIfLate(now)` (anti-snipe). Then the subtle part: **cancels the pending AI plan and schedules a fresh one** — `pendingAiPlan.status = "cancelled"`, then `scheduleAiBid()` mints a new `nanoid(8)` planId with a new random delay. The previous plan was timed against the previous `currentBid`; the user has just raised the floor, so the AI needs to reconsider against the new currentBid at fire time.

**Scenario C — user and AI trade bids.**
A and B alternating. Each user bid triggers a fresh AI plan; each AI bid (winning) clears its plan without scheduling a new one. The `bidLog` accumulates the full ordered history of `{ t, by, amount }` entries. The UI's bid-holder banner reads `currentBid` + `highBidder` straight off the DTO.

**Scenario D — the cheat: user blocks `/ai-fire`.**
User posts a bid, then drops every subsequent `/ai-fire` request (browser extension, intercepting proxy, devtools). The AI never gets a chance to counter in-flight. The defense is not real-time — it's the **reconciliation shot at `endLot`**.

### endLot — winner resolution in detail

Triggered by `POST /lot-end` from the client when the countdown hits 0. Four steps:

1. **Tolerance check** — `now < expiresAt - LOT_END_TOLERANCE_MS` → 425 Too Early (1s slack).
2. **Reconciliation shot** — if `highBidder !== "ai"` AND `computeAiBidAmount` returns a non-null amount AND it passes `checkValidBid`, push one final AI bid into `bidLog` at `t = expiresAt - 1`. Sets `highBidder = "ai"`. This is the entire defense against Scenario D — the user can drop every in-flight `/ai-fire` but cannot prevent the close-shot.
3. **Resolve winner**:

   | `highBidder` after recon | Outcome |
   |---|---|
   | `"user"` | User wins. `userBudget -= price`. Player pushed to `userBought`. |
   | `"ai"` | AI wins. `aiBudget -= price`. Player pushed to `aiBought`. |
   | `null` | **UNSOLD.** Nobody bid AND AI's cap was below opening + €1M. Player consumed from queue but added to no roster. |

4. **Advance** — `lotIndex++`, `lotState = null`. If `lotIndex >= queue.length`, flip `status = "complete"` and fire-and-forget `kickoffAiSquadPlanning()` (the LLM call that picks AI's final XI/bench from `aiBought` while the user is dragging players in SquadBuilder). Otherwise call `startLot()` recursively — the next lot opens before `endLot` returns — and fire-and-forget `kickoffAsyncCapPlanning()` for the new lookahead caps.

The HTTP response embeds the new `lotState` (or `null` if complete) plus a `lotResult: { winner, price, reconShotFired, matchComplete }` so the client can flash the post-lot banner without an extra round-trip.

---

## 5. Server architecture

### 5.1 `AuctionMatch` (the DO-emulation class)

One instance per matchId. Discipline:

1. One instance per `matchId` — `Map` identity (or DO id when migrated).
2. All mutation goes through **methods**. Routes never touch fields directly.
3. Every mutating method ends with `persist()` — today a no-op; under DO it becomes `await state.storage.put(...)`.
4. Internal types (`LotState.cap`, `AiPlanState.dueAt`) are **secrets**. Always return via `toClientDTO()` / `toClientLotDTO()` — never spread the instance into a response.
5. Every method logs `[MATCH:methodName] id=<matchId> ...` so the live log is greppable.

### 5.2 Routes (`server/src/routes/match.ts`)

| Method | Path | Purpose | Returns |
|---|---|---|---|
| POST | `/api/match` | Create match. Validates formation against `FORMATIONS` enum. Blocks on `seedForwardPlan()` (LLM call) so lot 1 opens with a real cap. | `{ matchId, formation, status, lotsTotal, llmSeeded }` |
| GET | `/api/match/:id/state` | Read-only snapshot. | `MatchStateDTO` |
| POST | `/api/match/:id/start` | Open lot 1 (called once on auction mount). | `MatchStateDTO` |
| POST | `/api/match/:id/bid` | User bid. Body validated to **positive integer** in raw euros. | `MatchStateDTO` |
| POST | `/api/match/:id/ai-fire` | Client's setTimeout-fired AI bid trigger. Idempotent against stale planIds. | `MatchStateDTO` |
| POST | `/api/match/:id/lot-end` | Resolve current lot + advance. 425 (Too Early) if before `expiresAt - 1s`. | `MatchStateDTO & { lotResult }` |
| GET | `/api/match/:id/debug` | **Test only.** Exposes AI's full bought list (normally hidden during the auction per spec §4). Gated by `DEBUG_KEY` env header in production; in dev it's open. | full debug dump |

Every handler follows the same discipline: `validate input → withLock → look up match → call ONE method → return DTO`.

### 5.3 Per-match concurrency (`store.ts`)

`withLock(matchId, fn)` maintains a promise chain per matchId. Each new call appends to the chain; the original caller still sees rejections via the returned promise, but the next caller starts from a fresh `Promise.resolve()` so a thrown handler doesn't poison the queue. Different matchIds run in parallel — there's no global lock.

### 5.4 Player pool + queue (`server/src/match/playerPool.ts`)

The 300-player pool loads once at module import — `players.json` is the entire universe. Each `AuctionMatch` only holds its own 33–35 player queue; the pool stays in module scope (will be a bundled asset in the eventual DO).

`buildQueue(formation)` reads `FORMATIONS[formation].queue` and draws that many from each category, then shuffles everything together so categories appear in a random order. The bucket counts (per formation):

| Formation | GK | DEF | MID | ATT | Total |
|---:|---:|---:|---:|---:|---:|
| 4-3-3 | 3 | 12 | 9 | 10 | **34** |
| 4-4-2 | 3 | 11 | 11 | 10 | **35** |
| 3-5-2 | 3 | 9 | 13 | 10 | **35** |
| 5-3-2 | 3 | 13 | 9 | 10 | **35** |
| 3-4-3 | 3 | 9 | 12 | 10 | **34** |
| 4-2-3-1 | 3 | 11 | 11 | 10 | **35** |

Sizing rule: `GK = 3 fixed; outfield = max(7, formationCount × 3); ATT floored to 10 across the board to keep striker drama high regardless of shape; total trimmed to ≤ 35 by removing from the largest bucket.`

### 5.5 Match-level tunables (`server/src/config.ts`)

```ts
STARTING_BUDGET          = €1,000,000,000   // per side
LOT_DURATION_MS          = 20,000           // 20s on the block
ANTI_SNIPE_MS            = 7,000            // bid in last 5s → +7s
ANTI_SNIPE_TRIGGER_MS    = 5,000
LOT_END_TOLERANCE_MS     = 1,000            // clock-skew slack
AI_DELAY_MIN_MS          = 1,200
AI_DELAY_MAX_MS          = 4,700
AI_DELAY_SAFETY_MS       = 1,200            // never schedule within last 1.2s
MIN_INCREMENT            = €1,000,000       // flat €1M per bid
HEURISTIC_CAP_DIVISOR    = 80               // cap = floor(OVR² / 80) for fallback
HEURISTIC_CAP_BUDGET_FRACTION = 0.8         // clamp every cap to 80% of AI budget left
MATCH_ID_LENGTH          = 10               // nanoid length for URL slugs (~58 bits)
```

### 5.6 Timer model

The server has **zero background timers for the auction loop.** Every state transition happens because an HTTP request came in. The client is the heartbeat. This is what makes the engine end-to-end testable in `scratch/simulate.ts` by just rewriting `expiresAt` and calling methods directly.

**Four timers run in the client.** Two are game-critical, two are pure UI cosmetics.

| Timer | Where | Purpose | Server validates |
|---|---|---|---|
| `setTimeout(setBidError(null), 2500)` | `AuctionRoom.tsx:334` | Hide "bid rejected" toast | n/a |
| `setTimeout(setLastResult(null), 4000)` | `AuctionRoom.tsx:367` | Hide post-lot result banner | n/a |
| `setTimeout(fireAi, plan.delayMs)` | `AuctionRoom.tsx:383` | Trigger `/ai-fire` when the random AI delay elapses | `planId` nonce match + `plan.status === "pending"` + `lotState` open + `checkValidBid` |
| `setInterval(tick, 200)` | `AuctionRoom.tsx:406` | Re-render countdown + trigger `/lot-end` once when `msLeft <= 0` | `now >= expiresAt - LOT_END_TOLERANCE_MS` |

**The AI-fire timer is server-driven, client-executed.** The server picks a random delay in `[AI_DELAY_MIN_MS, AI_DELAY_MAX_MS]` (1.2–4.7s), clamped to leave `AI_DELAY_SAFETY_MS` (1.2s) before expiry. It mints a `planId = nanoid(8)` (~47 bits of entropy) and stores `pendingAiPlan = { planId, dueAt, status: "pending" }` on the lot. The DTO ships `{ planId, delayMs }` — relative time, absolute `dueAt` stripped. The client schedules `setTimeout(delayMs)` and POSTs `/ai-fire` when it elapses, with the planId as proof of identity.

**Cleanup is declarative, not imperative.** The `useEffect` at `AuctionRoom.tsx:378-387` has `state?.lotState?.aiPlan?.planId` in its dep array and returns `() => clearTimeout(t)`. When the user bids, the server cancels the old plan and issues a new planId in the response. React sees the dep change, runs the old effect's cleanup (killing the stale timer), and runs the body again with the new planId. **No explicit `clearTimeout` call is wired to the bid action** — the planId rotation drives the cleanup through React. The countdown ticker uses the same pattern (`expiresAt` is in its dep array).

**Anti-snipe is server-side.** When a bid lands inside `ANTI_SNIPE_TRIGGER_MS` (5s) of expiry, `extendTimerIfLate` mutates `lot.expiresAt += ANTI_SNIPE_MS` (7s). The client never extends anything — it just renders against the new `expiresAt` on the next 200ms tick, and the countdown visibly jumps up. The constant `7000` does not appear anywhere in client code. The same `useEffect` cleanup pattern handles the new `expiresAt` value.

**Timer vulnerability assessment:**

| Threat | Outcome | Defense |
|---|---|---|
| Client never posts `/ai-fire` | AI gets one swing at lot close anyway | Reconciliation shot at `endLot` |
| Client posts `/ai-fire` early (before `delayMs` elapses) | AI bids sooner; amount and cap are unchanged. Not exploitable. | (intentionally not gated — early fire is a no-op or minor self-harm) |
| Client replays a `planId` | Rejected with "plan fired/cancelled" | `plan.status !== "pending"` check |
| Client forges a `planId` | Rejected with "stale planId" | `plan.planId !== planId` check |
| Cross-tab race on `/ai-fire` | First fire wins via `withLock`; second hits status check | `withLock` mutex + status check |
| Client tampers `Date.now()` to end lot early | Rejected with 425 | Server-side `now >= expiresAt - 1000` check |
| Knowing when AI will bid (`delayMs` leak) | Cap is hidden; bid sequence doesn't change walk threshold; user gains nothing | Not a vulnerability — `delayMs` and `dueAt` carry the same information, and neither matters without `cap` |
| Client clock skewed ahead of server clock | Lot stuck at 0:00 forever (UX bug, not security — see §11) | None today |

---

## 6. AI bidding system

The AI bidder is a **two-layer** thing:

```
┌────────────────────────────────────────────────────────────────┐
│ Layer 1 — Strategy (LLM)                                       │
│   DeepSeek decides CAPS for the next 2 lots, every lot.        │
│   "I am willing to pay up to €X for player Y."                 │
│   Called sync at /start (blocking), async after every /lot-end │
└─────────────────────────────┬──────────────────────────────────┘
                              │ caps map: playerId → max euros
                              ▼
┌────────────────────────────────────────────────────────────────┐
│ Layer 2 — Execution (pure code in ai.ts + AuctionMatch)        │
│   • computeAiBidAmount: if currentBid + €1M ≤ cap, bid it      │
│   • Otherwise walk                                              │
│   • Server runs reconciliation shot at lot-end                  │
│   The LLM NEVER decides WHEN to bid — only how high to chase.  │
└────────────────────────────────────────────────────────────────┘
```

### 6.1 LLM call envelope (`server/src/llm/deepseek.ts`)

- **Model**: `deepseek-chat` (not the reasoner)
- **Temperature**: `0.2` — decision/data-analysis band. Higher temps produced cross-match cap drift.
- **JSON mode**: `response_format: { type: "json_object" }`
- **Timeout**: 25s, hard (bumped from 12s after observing a cluster of tail-latency timeouts — 6/34 calls failed in one match). Failure → heuristic fallback fires, match never blocks.
- **Prompt cache discipline**: the system prompt is 100% **static text** (~7,500 tokens). All per-match data (formation, targets, deficits, hoarding, lookahead) goes in the **user** message as JSON. This is why cache-hit rate runs ~75–80% even across formations.

### 6.2 What goes into the user message

```ts
LlmCapRequest = {
  matchId, formation, aiBudgetLeft, userBudgetLeft, lotIndex, lotsTotal, lotsRemaining,
  toPlan: [...],                      // 2 players the LLM must cap
  upcomingContext: [...],             // 2 more for lookahead, no caps requested
  aiSquad: {
    counts, targets,                  // varies per formation
    xiStatus,                         // per-category "DEF: 2/4 — STILL NEED 2 STARTERS" strings (server-precomputed; LLM cannot miscount)
    unfilledXiSlots,                  // flat list
    xiComplete, benchCount, benchMinimum, benchTarget, benchNeeded, benchMandatoryGap,
    bought,                           // AI's own players (the LLM gets to see its own roster)
  },
  remainingByCategory,                // queue scarcity hints
  spendPressure: {
    fraction, expectedBudgetNow, hoardingExcess,
    verdict: "ON_PACE" | "HOARDING_MILD" | "HOARDING_SEVERE" | "OVER_PACE",
  },
  userActivity: { boughtCount, totalSpent, averagePrice, highestSinglePrice, recentWins },
  opponentSkill: "skilled",
}
```

### 6.3 What the LLM must return

```json
{
  "plan": [
    {
      "player_id": <int>,
      "cap": <int euros>,
      "xi_status_quote": "<exact byte-for-byte copy of aiSquad.xiStatus[player.category]>",
      "value_eur_seen": <int — exact copy of player.value_eur>,
      "reason": "<≤ 2 sentences>"
    }
  ]
}
```

The `xi_status_quote` is the single most important defense — it forces the LLM to physically read the deficit string before deciding, which kills the position-counting failure mode where the LLM hallucinated "MID at 3/3" while the server reported "2/3" and skipped a needed starter. Mismatch → entry discarded → heuristic fallback.

### 6.4 Server-side floors (validatePlan)

The LLM's caps are post-processed through a chain of floors before becoming the lot's `cap`. Each floor is a **safety net for a known LLM failure mode observed in prior matches**, applied in this order:

| Floor | Trigger | Action | Origin |
|---|---|---|---|
| `[SERVER-FLOORED]` | XI-deficit category, cap ≤ value_eur | Raise cap to `value_eur + €5M` | Otamendi lot 31 walk (match #4) |
| `[SEVERE-BOOST]` | `verdict === HOARDING_SEVERE` AND XI-deficit AND `lotsRemaining < 10` | Multiply cap by 1.5× | Kimmich walk-at-€75M failure |
| `[MUST-BUY]` | `sameCatDeficit >= sameCatRemaining` (last available at a deficit position) | Floor cap at `2.0 × value_eur` | LLM's "save for upcoming" rationalisation when there IS no upcoming |
| `[ENDGAME-FLOOR]` | XI-deficit AND `lotsRemaining ≤ 5` AND `aiBudget > €100M` | Floor cap at `aiBudget / unfilledXiSlots.length` | Persistent late-game skip-then-hoard pattern |
| `[BENCH-ELITE-FLOOR]` | `xiComplete` AND `OVR ≥ 85` AND `aiBudget > €100M` AND `lotsRemaining ≤ 10` | Floor cap at `value_eur × clamp(1.4, 1.4 + hoardingExcess / 500M, 3.0)` — multiplier scales with how much AI is hoarding | Match #10 lost Son at value+€200K |
| `[TERMINAL-DUMP]` | `lotsRemaining ≤ 3` AND `hoardingExcess > €100M` AND `OVR ≥ 80` | Floor cap at `0.8 × (aiBudget / lotsRemaining)` | Match #10's €411M unspent (slot-guard removed because AI overshot bench in #10) |
| `[BARGAIN-FLOOR]` | `cap === value_eur` AND `OVR ≥ 82` AND `aiBudget > €80M` | Multiply cap by 1.2× | Dani Olmo + Cubarsí walks at cap=value (match #9) |
| `clamp` (always last) | — | Cap at `0.8 × aiBudgetLeft` so AI never bids more than 80% of remaining budget on one lot. | Sanity ceiling |

Each floor logs its firing with `[LLM:validate] id=<matchId> ... [TAG]`. Grep the server log for `[BENCH-ELITE-FLOOR]` and you can see exactly when and why a cap was raised.

### 6.5 Prompt principles (system message)

The system prompt is a few thousand tokens of strategic guidance. Highlights:

- **§3 Priority order (strict)**: XI completion (1) → bench minimum 4 (2, same tier) → chemistry (3, tiebreaker only).
- **§3a Opening-price floor**: cap below value_eur = guaranteed walk. Forbidden on real players.
- **§3b Uncontested-elite rule**: if `userBudgetLeft < value_eur + €1M` and OVR ≥ 83, the user CANNOT bid → set cap ≥ value_eur to win for free.
- **§3c Spend pressure**: `HOARDING_SEVERE` → +30% caps. `HOARDING_MILD` → +15%. `OVER_PACE` → tighten.
- **§3d Walk-on-bargain ban**: cap exactly equal to value_eur is functionally cap=0. Use `value_eur + €5M` minimum.
- **§3e Post-XI-complete**: do NOT slow down. Spend rate after XI completion should match or exceed pre-XI. Hoarding €100M+ at full time is failure.

The prompt explicitly references **specific prior match failures by ID and lot number** as anti-patterns ("The Otamendi failure (lot 31 of match k6AchslaSi) cost the AI the entire match..."). The LLM uses these examples as concrete don'ts.

### 6.6 LLM economics

| Metric | Typical match (33–35 lots) |
|---|---|
| Calls | ~32 (sync seed + async after each lot) |
| Prompt tokens | ~250K |
| Cached prompt tokens | ~190K (75–80% hit rate) |
| Completion tokens | ~3K |
| Total cost | **~$0.008 per match** at current pricing |
| End-to-end latency | ~3s avg per call (timeout 12s) |

Per-call cost: `(promptMiss × 0.14 + promptHit × 0.0028 + completion × 0.28) / 1,000,000` USD.

---

## 7. Privacy / server-authoritative invariants

These are the **hard rules** the system enforces. Violating any of them is a bug.

| Invariant | Where enforced | Why |
|---|---|---|
| AI's per-lot cap never reaches the client. | `LotStateDTO` omits `cap`. `MatchStateDTO` builds via `toClientLotDTO()` which returns an explicit literal — no spread of `LotState`. | A leaked cap lets the user bid `cap - €1M` and steal every elite. |
| AI's bought roster hidden during the auction. | `MatchStateDTO.ai = { budget, boughtCount }` — names + categories never sent until `status === "complete"`. | Spec §4. Prevents user reading AI strategy mid-match. |
| Queue composition hidden during the auction. | AuctionRoom never references `state.queue` or per-category counts; only `lotsTotal` (a total). | The chalkboard `/setup` page is the **only** place per-category counts are shown — the info-icon popover spells this out. |
| AI plan timestamp hidden. | `AiPlanDTO = { planId, delayMs }`. The internal `dueAt` is converted to a relative `delayMs` on every emit. | A leaked `dueAt` lets the user wait exactly that long to bid. |
| Bid amounts validated server-side. | `AuctionMatch.checkValidBid` runs on every `/bid` AND every `/ai-fire`. | Client can claim anything; server is truth. |
| AI bid amount recomputed at fire time, never trusted from the client. | `aiFire(planId)` calls `computeAiBidAmount(currentBid, cap)` fresh — the client only sends a `planId`. | Defeats client-side amount spoofing. |
| Reconciliation shot at lot-end. | `endLot()` — if `highBidder !== "ai"` and `cap` still allows a bid, AI fires one guaranteed bid at `expiresAt - 1`. | Defeats clients that drop or delay `/ai-fire` to block the AI. |
| /debug gated in production. | `process.env.DEBUG_KEY` required as `X-Debug-Key` header. If unset and `NODE_ENV === "production"`, the endpoint 404s. | Spec §4 — debug endpoint reveals AI roster, must not be public. |

The cap-leak invariant has been **runtime-verified** end-to-end — `/state` response for a freshly opened lot returns exactly these 7 keys: `aiPlan, bidLog, currentBid, expiresAt, highBidder, lotIndex, player`. No `cap`, no `startedAt`, no `pendingAiPlan`.

---

## 8. Client architecture

### 8.1 Three routes, three signature elements

| Route | Component | Signature element (the one bold thing) |
|---|---|---|
| `/` | `client/app/page.tsx` | The wordmark — `SQUAD` in chalk, `WARS` in floodlight — clamp-sized hero with staggered top-to-bottom reveal. |
| `/setup` | `client/app/setup/page.tsx` | The **chalk pitch** — vertical SVG, player markers chalk themselves on in a GK→DEF→MID→ATT cascade when you switch formation. |
| `/auctionroom/:id` | `client/app/auctionroom/[slug]/AuctionRoom.tsx` | The **split-flap countdown clock** — 84px digits that flip when seconds tick. |

Each screen spends boldness in exactly one place; everything else stays quiet around it. This is the rule in `client/design.md` §6.

### 8.2 Design system — palette is role-mapped, not vibes-mapped

| Token | Role | Used for |
|---|---|---|
| `--chalk` `#F2EDE0` | YOU | User's bid, user's badge, the commit button. **Hard rule: YOU is always chalk.** |
| `--floodlight` `#FFB627` | AI / opposition | AI's bid, AI's badge, the floodlit glow. **Hard rule: AI is always floodlight.** |
| `--whistle` `#E63946` | Danger / time-critical | Low-time countdown, validation errors, "going once". **Reserved.** |
| `--keeper-blue` `#6FB1FF` | DEF / cool | Defender markers, secondary GK accent. |
| `--ink` `#0B1018` | Page background | Slight blue-purple chroma. **Never pure black.** |

Category accent mapping: ATT=whistle, MID=floodlight, DEF=keeper-blue, GK=chalk. This is how the dossier and dressing-room cards read at a glance.

### 8.3 Typography

Three faces, three roles. **A fourth is forbidden.**

- **Saira Condensed** — signage, eyebrows, headlines, position chips. The brand personality.
- **Inter** — body prose, helper text.
- **JetBrains Mono** — prices, lot indices, time codes. `font-variant-numeric: tabular-nums` always.

### 8.4 Component vocabulary

Every card uses `.sw-card` + four corner ticks (`sw-tick-tl/tr/bl/br`) + an eyebrow + an optional `.sw-corner-mark` catalogue label (`EXCHEQUER · L01`, `BOARD · B`, `DOSSIER · C`). The corner ticks are the unifying broadcast detail. Other reusable primitives: `.sw-eyebrow`, `.sw-chip`, `.sw-btn`, `.sw-btn-bid` (max ONE per screen — the commit), `.sw-bar` / `.sw-bar-fill`, `.sw-live-dot`, `.sw-sunken`.

Three established patterns:

1. **Three-state ownership** (YOU / AI / NONE) — distinct fill + border + marker per state, not just colour swap.
2. **Signature animation per screen** — one bold thing, everything else still.
3. **Dashed border = empty / placeholder / quiet** — never decoration.

Motion vocabulary is exactly 3 keyframes: `sw-flap-down` (digit flip), `sw-tick-in` (entrance), `sw-pulse` (ambient live dot). A fourth is forbidden unless it replaces one of these.

Full spec: [`client/design.md`](../client/design.md).

### 8.5 Formation propagation through the client

The client mirrors the server's per-formation data in two places:

1. `client/app/setup/page.tsx` has a `FORMATIONS[]` array with `targets`, `queue`, and **tactical marker coordinates** (one entry per XI slot — GK on the goal line at y=134, DEF along the box edge at y=108–115, MID across midfield at y=62–86 depending on shape, ATT pressed up to y=18–26).
2. `client/app/auctionroom/[slug]/AuctionRoom.tsx` has a `FORMATION_BUCKETS` lookup that maps the formation name to a `Bucket[]` with `{key, label, target}` per category. The DressingRoom and CompleteView read this via `bucketsFor(state.formation)` — both XI rendering and bench math are formation-aware.

These two mirrors and the server's `FORMATIONS` map in `config.ts` must stay in sync. When you add a formation, update all three.

---

## 9. Improvement journey

Eleven matches were played end-to-end during development; the AI strategy started losing badly and was tuned match-by-match into a winning system.

| Match | Outcome | Diagnosis | Fix landed for next match |
|---|---|---|---|
| 1–3 | losing | LLM hadn't been wired yet | Heuristic baseline |
| 4 | losing, €174M unspent | Kimmich walk at cap=€75M while user couldn't bid; spend-pressure signal not actioned | `[SEVERE-BOOST]` cap +30% under HOARDING_SEVERE; `[SERVER-FLOORED]` for XI-deficit value walks |
| 5–8 | losing, varying | LLM under-committing on elites | Prompt §3a–3c added; opponent-skill signal |
| 9 | losing, **€210M unspent**, lots 28 & 29 (Olmo, Cubarsí) walked at cap=value | Walk-on-bargain bug | Prompt §3d ban; `[BARGAIN-FLOOR]` server fallback; `[MUST-BUY]` 2.0× floor; `[ENDGAME-FLOOR]` per-slot dump |
| 10 | losing, **€411M unspent** (all-time high) | `BENCH-ELITE-FLOOR` 1.4× too weak under €373M hoard; `TERMINAL-DUMP` slot-guard misfired (AI overshot bench so "0 open slots") | Multiplier scaled with `hoardingExcess` (1.4–3.0×); slot guard removed from TERMINAL-DUMP; prompt §3e; temperature 0.2; integer bid validator |
| 11 | **AI WIN +1.09 OVR**, €173M unspent | First AI victory. 17 server-floor firings: SEVERE-BOOST ×5, BENCH-ELITE-FLOOR ×6 (mult 2.04–2.15×), TERMINAL-DUMP ×2. AI won Wirtz at €151.5M (cap €323M), Pacho at €84M (cap €171M), Carnesecchi at €47M (cap €148M). |

The complete failure ledger lives in the **prompt itself** — each principle in §3 cites the specific match-and-lot it was added to defend against. The system prompt is therefore both the AI's instructions AND the historical changelog.

---

## 10. Where to look when X breaks

| Symptom | Likely file |
|---|---|
| Match creation rejects a valid formation | `server/src/config.ts` — `FORMATIONS` map + `isValidFormation` |
| Queue has wrong category counts | `server/src/config.ts` — `FORMATIONS[name].queue` |
| AI walks on a player it should fight for | `server/src/llm/deepseek.ts` — `validatePlan` floors; grep server log for `[LLM:plan]` and `[LLM:validate]` entries on that player |
| AI sits on huge unspent budget at full time | `server/src/llm/deepseek.ts` — system prompt §3c/§3e + `[BENCH-ELITE-FLOOR]` + `[TERMINAL-DUMP]` |
| Client shows wrong dressing-room slots for a non-default formation | `client/app/auctionroom/[slug]/AuctionRoom.tsx` — `FORMATION_BUCKETS` lookup |
| Pitch markers in wrong positions | `client/app/setup/page.tsx` — `FORMATIONS[].markers` coords (viewBox 100×140, y near 134 = own goal) |
| Cap leaking to client | `server/src/match/AuctionMatch.ts` — `toClientLotDTO()` — must return explicit literal, never spread |
| /debug accessible without key | `server/src/routes/match.ts` — `DEBUG_KEY` env gating |
| LLM call costing too much | `server/src/llm/deepseek.ts` — check `prompt_cache_hit_tokens` in `[LLM:response]` log line. If <50%, the system prompt drifted (was made dynamic). |
| Two concurrent requests interleave | `server/src/store.ts` — `withLock` must wrap every match-mutating handler |

---

## 11. Open work / known gaps

| Area | State | Notes |
|---|---|---|
| Cloudflare DO migration | Not started | `store.ts` and `index.ts` are the only files that change. Match logic is portable. |
| Chemistry as a scoring multiplier | Mentioned in prompt as a tiebreaker, **not actually computed** anywhere in scoring. | Visual chemistry card in AuctionRoom is illustrative, not authoritative. |
| Match Result / Squad Builder page | Not built. The `CompleteView` shows a basic dump. | The signature element planned: a full-time scoreboard with two side-by-side squad columns flipping in player by player. |
| Persistence | None — server restart loses every match. | DO storage when we migrate. |
| Auth | None. The 10-char nanoid matchId IS the bearer token — anyone who learns it can POST `/result` on that player's behalf. Leaks via referer, history, screenshots, OG previews. | Issue a `Set-Cookie: HttpOnly; Secure; SameSite=Lax` on match-create, require it on every mutating route. Half a day's work; closes ~95% of the surface. |
| Match history / replay | Not stored. | The console log is the only record. |
| Mobile layout | Auction room and chalkboard collapse to single-column < 1180px / 1080px, but not deeply optimised. | Test before mobile launch. |
| Server-side lot-end timer | Not implemented. Lot advancement depends entirely on the client posting `/lot-end`. A user whose system clock is more than 1s ahead of the server sees the countdown hit 0:00, gets a 425 Too Early back, and the client's `endedLotsRef` Set prevents retry — lot frozen forever. Also: a closed browser tab leaves the match instance in memory indefinitely. | Move trigger to `setTimeout(LOT_DURATION_MS + slack)` inside `startLot` (and `state.storage.setAlarm` under DO). Closes the clock-skew UX bug AND the abandoned-match memory non-attack AND pre-shapes the DO migration. |
| `validatePlan` floor sediment | 7 named floors and growing; each new lost match tends to spawn one. Floors interact in ways that get harder to reason about. | Long-term lever: replace LLM cap pass with a deterministic cap function; reserve the LLM for prose. ~70% LLM cost cut, zero cap drift. Not a pre-launch task. |
| Soft validation in `validatePlan` | `xi_status_quote` and `value_eur_seen` are checked but warnings-only — the cap is still used on mismatch. | Either commit to hard-discard (lose ~5% of caps to heuristic) or drop the fields entirely. Pick one. |
| Client/server slot-table sync | `server/src/match/squadFormations.ts` and `client/app/squad-builder/SquadBuilder.tsx`'s `FORMATIONS` must agree on `id/pos/cat` byte-for-byte. No runtime check. | 20-line CI script that imports both and diffs them. |

---

## 12. Review findings & security audit

A design and security pass across the auction subsystem. Strengths first, then concerns in rough priority, then a defended-vs-vulnerable matrix.

### Strengths

- **DO-emulation discipline is consistent.** Every architectural choice in `AuctionMatch`, `store.ts`, and the DTO contracts maps cleanly to the Cloudflare DO migration: `Map` identity → `idFromName(id).get()`, `withLock` → DO's single-threaded-per-ID guarantee, `persist()` no-op → `state.storage.put`. The migration is a wrapper swap, not a rewrite.
- **Cheat defense is protocol-level, not bolted on.** The reconciliation shot, the `planId` nonce, recomputing the AI bid amount at fire-time (never trusting a client-sent value), and the lot-end tolerance check are all baked into the methods. `scratch/simulate.ts` Scenario B exists to prove the reconciliation shot defeats the `/ai-fire` block.
- **Server owns the state machine; client just renders it.** Three statuses (`in_progress`, `complete`, `result`), all transitions server-gated, all monotonic. Refresh-safe by construction. The client cannot skip a phase or fake "match over".
- **LLM is fully off the hot path.** The bid loop never `await`s an LLM call. Every layer assumes the LLM might fail and the heuristic must cover. `forwardPlan` is a cache; `resolveCapFor` falls back to the heuristic on miss. This is the right inversion for a real-time gameplay system that uses an LLM.
- **Math layer is pure functions.** `ai.ts` and `verdict.ts` have zero I/O, zero clock, zero class deps. This is why `simulate.ts` exercises the entire engine in under a second by mutating `expiresAt` and calling methods directly.
- **Cap-secrecy contract is enforced by smoke test.** Scenario D in `simulate.ts` does `"cap" in dtoLot` and `process.exit(1)` if the cap ever leaks. Catches regressions in `toClientLotDTO` automatically.

### Concerns (in priority)

**1. No authentication. matchId is the bearer token.**
There is no session, no signed cookie, no auth header on any of `/bid`, `/lot-end`, `/result`, `/ai-fire`. Anyone who learns a matchId can POST `/result` for that player and freeze their squad with an arbitrary XI. The only mitigation today is `MATCH_ID_LENGTH = 10`-character nanoid unguessability (~58 bits). Fine against random guessing, but matchIds leak through browser history, referer headers, screenshots, OG image previews, and analytics. **Fix:** issue a `Set-Cookie: HttpOnly; Secure; SameSite=Lax` on match-create, require it on every mutating route. Closes ~95% of this surface in half a day.

**2. Client-driven lot-end + 1s tolerance leaves a clock-skew UX bug.**
A legitimate user whose system clock is 2+s ahead of the server will see the countdown reach 0:00 early, POST `/lot-end`, get 425 Too Early, and have no retry because `endedLotsRef.current.has(lotIndex)` is already set. The lot freezes at 0:00 forever short of a reload. **Fix:** move the lot-end trigger to a server-side `setTimeout(LOT_DURATION_MS + slack)` in `startLot`. Same fix closes the abandoned-match memory non-attack and pre-shapes the DO migration. Half a day.

**3. `validatePlan` is becoming sediment.**
Seven named server-side floors, each with thresholds and a comment naming the past match it was lost to. This is the LLM telling you something: it is structurally bad at consistent numeric decisions, and the codebase keeps papering over that. Every new floor is technical debt — floors interact, and the next loss will spawn an eighth. The honest read: you have two LLM jobs glued into one — set caps (numeric, must be consistent) and write persona-flavored rationale (qualitative, LLM-natural). The first is fighting the model. Long-term lever: replace the LLM cap pass with a deterministic cap function that bakes xi-deficit, spend-pacing, and bench-elite logic directly into code; reserve the LLM for prose only.

**4. Soft validation is the worst of both worlds.**
`xi_status_quote` and `value_eur_seen` are checked in `validatePlan`, but warnings-only — the cap is still used on mismatch. Either commit (hard-discard, lose ~5% of caps to heuristic) or remove the fields entirely. The current state pays the token cost without using the signal.

**5. Single-process state, no janitor, no persistence.**
A Node restart loses every in-flight match. A user who walks away keeps a match object in memory forever (lot's `expiresAt` passes but nothing triggers `endLot` without the client). Neither is an attack, but they compound under launch traffic. DO migration solves both, but pre-DO you're running on Node.

**6. The system prompt is enormous.**
~200 lines of strategic rules, examples, named failure cases. LLMs don't get more reliable with more rules — they get more inconsistent because contradictory rules interact unpredictably. The fix to most of the rules is the server-side floor that already exists. Each prompt rule is a hint that the same enforcement belongs in code. Same root cause as concern #3.

**7. Client/server slot-table mirror has no runtime check.**
`server/src/match/squadFormations.ts` and `client/app/squad-builder/SquadBuilder.tsx` encode formations independently and must agree on `id/pos/cat` byte-for-byte. The doc comment warns "no runtime check that they match." A 20-line CI script that imports both and diffs them closes every future drift.

### Defended-vs-vulnerable matrix

| Threat | Defended? | Notes |
|---|---|---|
| Time spoofing the lot end (client clock fast) | yes | Server re-checks `expiresAt` against its own clock. 425 if early. |
| Replaying `/bid` or `/lot-end` for an old lot | yes | `lotState.lotIndex !== sent` → 409. |
| Replaying or forging a `planId` | yes | `nanoid(8)` ~47 bits + status-pending check. |
| Blocking `/ai-fire` (Scenario D) | yes | Reconciliation shot at `endLot`. |
| Submitting a player you didn't buy | yes | `validateUserSquad` checks every `playerId` against `userBought`. |
| Submitting a 12-player XI / duplicates | yes | Length check + seen-set guards. |
| Phase-skip `/result` from `in_progress` | yes | `if (status !== "complete") reject`. |
| Re-submitting `/result` to swap XI | yes | Idempotent — first submission cached. |
| Cap leakage to client | yes | `toClientLotDTO` returns explicit literal. Scenario D in `simulate.ts` enforces it. |
| Per-matchId race conditions | yes | `withLock` mutex serializes. |
| `/ai-fire` "fire early" (before delayMs) | n/a | Allowed by server but no-op or self-harm. Not exploitable. |
| matchId as bearer token | **no** | No auth. Concern #1. |
| Clock-skew UX bug | **no** | Concern #2. |
| Server restart loses match state | **no** | No persistence. Concern #5. |

### Recommended action — pre-launch

In priority order:

1. **Verify `MATCH_ID_LENGTH = 10` and `LOT_END_TOLERANCE_MS = 1000` are still the values you want.** Both are single-character config changes with security/UX consequences. Five-minute audit.
2. **Move lot-end trigger to a server-side timer.** Half a day. Closes the clock-skew bug AND the abandoned-match memory non-attack AND pre-shapes DO migration.
3. **Add a match-create `Set-Cookie` and require it on mutating routes.** Three hours. Closes the bearer-token risk.

Everything else is post-launch.

---

## 13. Document map

| Doc | Purpose | Audience |
|---|---|---|
| [`README.md`](../README.md) | Project root readme. | Anyone landing on the repo. |
| [`docs/squadwars-spec.md`](./squadwars-spec.md) | The original product spec — game rules, scoring, locked decisions, open questions. The "what the game is" reference. | Implementer / agent doing feature work. |
| [`docs/architecture.md`](./architecture.md) | **This file.** How the system is built. | Anyone touching code. |
| [`client/design.md`](../client/design.md) | Design system — palette, typography, components, motion, voice, anti-patterns. | Anyone touching the client. |
| [`client/AGENTS.md`](../client/AGENTS.md) | "Next.js 16 has breaking changes vs your training data — read the docs." | Anyone editing client code. |
| [`client/.agents/skills/frontend-design/SKILL.md`](../client/.agents/skills/frontend-design/SKILL.md) | Upstream design philosophy that `design.md` is the project-specific answer to. | Designer / agent picking aesthetic direction. |

When you change a token, update `client/design.md`. When you change architecture (route, type, invariant, floor), update this file. The spec is frozen unless game rules change.
