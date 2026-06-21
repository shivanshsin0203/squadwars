# SquadWars — Deployment Strategy & Handoff

> **Purpose.** A complete, self-contained record of where deployment stands and
> what's left, so a brand-new session (or a human) can pick up with zero prior
> context. Written 2026-06-20.
>
> **One-line status:** Frontend is **live** on Vercel at `https://squadwars.online`.
> Backend is **NOT deployed** anywhere yet — that's the remaining big task, and
> the target is **Cloudflare Workers + Durable Objects + KV**.

---

## 0. TL;DR status board

| Piece | Status | Host | Notes |
|---|---|---|---|
| Domain `squadwars.online` | ✅ live | registrar → Vercel | Acquired 2026-06-20. DNS pointed at Vercel, HTTPS auto-provisioned. |
| Frontend (Next.js 16 client) | ✅ deployed | Vercel (CLI) | Landing, SEO/OG, share pages all live & static-renderable without backend. |
| Backend (Hono server) | ❌ **NOT deployed** | — (local only) | In-memory Map store. Target = **Cloudflare Workers + DO + KV**. |
| End-to-end prod play-through | ❌ not yet possible | — | Blocked on backend deploy. This is the launch gate (see §7). |
| Cross-origin auth (cookie/CORS) in prod | ⚠️ needs config | backend env | Code is correct; needs prod env vars when backend ships (see §5.3, §6.2). |

**The single most important fact:** the backend holds **all match state in an
in-memory `Map`** (`server/src/store.ts`). It cannot go on Vercel/serverless —
it needs either a persistent process *or* Cloudflare Durable Objects. We're
going with **DO**.

---

## 1. Architecture & why hosting is split

```
                         https://squadwars.online
  ┌─────────────────────────────┐         ┌──────────────────────────────────┐
  │  FRONTEND  (Next.js 16)      │  HTTPS  │  BACKEND  (Hono)                  │
  │  Vercel                      │ ──────▶ │  TARGET: Cloudflare Workers + DO  │
  │  - Landing / SEO / OG        │  fetch  │  - one Durable Object per matchId │
  │  - /setup, /squad-builder    │ (creds) │  - KV for ancillary state         │
  │  - /auctionroom/[slug]       │ ◀────── │  - DeepSeek LLM calls (fetch)     │
  │  - /r/[token] share pages    │  cookie │                                   │
  └─────────────────────────────┘         └──────────────────────────────────┘
        NEXT_PUBLIC_BACKEND_URL  ───────────────▶  api.squadwars.online (planned)
```

- **Frontend → Vercel.** First-class Next.js host, zero-config, Git or CLI deploy.
- **Backend → Cloudflare Workers + DO.** Real-time 1v1 auction needs a single
  authoritative owner of each match's mutable state (budgets, current lot, bid
  log, AI plan). A Durable Object *is* exactly that: one single-threaded
  instance per `matchId`. KV covers the few things that don't belong in a DO.

**Why not Vercel for the backend?** Serverless functions don't keep a process
alive and don't share in-memory state between invocations. Every bid would hit
a cold function with an empty `Map`. Confirmed non-starter.

---

## 2. Domain & DNS (DONE)

- Domain: **`squadwars.online`** (bought 2026-06-20).
- Pointed at Vercel and serving the frontend over HTTPS (verified working by user).
- **Planned (not yet done):** a `api.squadwars.online` subdomain CNAME'd to the
  Cloudflare Worker once the backend deploys. Until then the frontend's
  `NEXT_PUBLIC_BACKEND_URL` can point straight at the `*.workers.dev` URL.

If DNS ever needs re-pointing: use the exact A/CNAME records Vercel shows under
*Project → Settings → Domains* (apex A record IP can change; don't hard-code).

---

## 3. Frontend — what's done

Deployed to **Vercel via the CLI**, run from inside `client/` (monorepo: `client/`
+ `server/` live in one repo; running `vercel` from `client/` makes it the
project root and never touches `server/`).

**Code state (all on `main`, currently uncommitted — see `git status`):**

| File | Change | Verified |
|---|---|---|
| `client/app/layout.tsx` | `SITE_URL` fallback → `https://squadwars.online` (`metadataBase`, OG, twitter) | ✅ |
| `client/app/sitemap.ts` | `SITE_URL` fallback → `squadwars.online` | ✅ |
| `client/app/robots.ts` | `SITE_URL` fallback → `squadwars.online` | ✅ |
| `client/app/r/[token]/page.tsx` | footer link text → `squadwars.online` | ✅ |
| `client/.gitignore` | `.vercel` ignored (created by `vercel link`) | ✅ |

**Backend URL is already env-driven** in all three call sites — no further change
needed:

```ts
// client/app/page.tsx:23, client/app/setup/page.tsx:11,
// client/app/auctionroom/[slug]/AuctionRoom.tsx:13
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8787";
```

So: local dev hits `localhost:8787`; prod uses whatever Vercel env says.

### 3.1 What renders WITHOUT a backend (why the site is useful already)

Landing (`/`), SEO (`robots.txt`, `sitemap.xml`), OG/Twitter cards, and the
stateless share pages (`/r/[token]`) are all static / URL-driven and work with
no server. Only the live game (`/setup` → `/auctionroom` → `/squad-builder` →
result) needs the backend. With the backend down, `/setup` shows a graceful
"backend offline" state (designed for, per `design.md` Landing pattern).

### 3.2 Vercel deploy commands (reference)

```powershell
cd C:\Users\HP\Desktop\bestsquad\client
npm i -g vercel          # once
vercel login             # once
vercel link              # once — links to the Vercel project; creates client/.vercel/
vercel                   # preview deploy (*.vercel.app)
vercel --prod            # promote to production (squadwars.online)
```

`NEXT_PUBLIC_*` vars are **inlined at build time** — set them *before* building,
and **redeploy** after any change.

### 3.3 Local-testing experiment that was TRIED and REVERTED (history)

To test the *deployed* frontend against a *local* backend, we briefly changed the
server to allow `https://squadwars.online` → `http://localhost:8787`. This needed
three things and was made to work via curl, then **reverted** (user decided to
test directly against the future production backend instead):

1. CORS allow-list (multiple origins) in `server/src/index.ts`.
2. `COOKIE_CROSS_SITE=1` gate → `SameSite=None; Secure` cookie in `session.ts`.
3. A **Private Network Access** preflight header (`Access-Control-Allow-Private-Network: true`)
   — Chrome blocks public-HTTPS → loopback without it.

**Current state: all three are reverted in code.** `server/src/index.ts` is back
to `origin: process.env.CORS_ORIGIN ?? "http://localhost:3000"` and `session.ts`
is back to `isProd()`-based cookie attributes. ⚠️ **Leftover:** `server/.env`
still contains a now-dead `COOKIE_CROSS_SITE=1` line (the code reading it was
reverted) — harmless, can be deleted. Lesson if we ever revisit: the robust
alternative to the PNA fight is a tunnel (`cloudflared tunnel --url
http://localhost:8787` or `ngrok`) giving an HTTPS URL, turning it into a normal
HTTPS↔HTTPS cross-site call.

### 3.4 Frontend — what's LEFT

- [ ] Commit the `squadwars.online` edits (currently uncommitted).
- [ ] Confirm Vercel **Production** env has `NEXT_PUBLIC_SITE_URL` and
      `NEXT_PUBLIC_BACKEND_URL` set (see §8), then `vercel --prod` to bake them in.
- [ ] Run the end-to-end smoke test (§7) once the backend is live.
- [ ] Deferred polish (non-blocking): per-page `<title>`s, keyboard-drag a11y,
      `favicon.ico` fallback, design-token centralization.

---

## 4. Backend — current state (local only)

- **Stack:** Hono `4.12.x` on Node via `@hono/node-server`. TypeScript, ESM.
- **Entry:** `server/src/index.ts` — `serve({ fetch: app.fetch, port })`.
- **Scripts:** `dev` = `tsx watch --env-file=.env src/index.ts`; `build` = `tsc`;
  `start` = `node dist/index.js`. Listens on `:8787`.
- **State:** in-memory `Map` (`server/src/store.ts`) + a per-`matchId` promise-chain
  mutex (`withLock`). **Dies on restart — all live matches lost.** Known/accepted
  pre-launch.
- **Routes:** `/health`, `/auctionroom`, `/api/match` (+ session-gated `/:id/*`).
- **Auth model:** `matchId` is a bearer token in the URL; bound at creation to an
  `sw_session` HttpOnly cookie. `/:id/*` requires the matching cookie or 403
  (`server/src/middleware/session.ts`).
- **AI:** DeepSeek via the `openai` SDK pointed at `https://api.deepseek.com`
  (`server/src/llm/deepseek.ts`, `squadBuilder.ts`). Key from `process.env.AI_KEY`.
  Falls back to heuristic caps if no key. **LLM cap planning is fire-and-forget**
  (`void this.runCapPlanning()`), the bid loop never blocks on it.
- **Rate limiting:** `hono-rate-limiter` with **MemoryStore**, keyed on
  `cf-connecting-ip` → `x-forwarded-for` → `local-dev`
  (`server/src/middleware/rateLimit.ts`). Skipped for localhost in dev.
- **Player data:** `server/players.json` (curated ~300 players) loaded once at
  module import via `fs.readFileSync` (`server/src/match/playerPool.ts`). The raw
  `FC26_players.csv` is gitignored; `players.json` is the build output it draws from.

### 4.1 The timing model — CRITICAL for the DO migration

**The client drives the clock, not the server.** The frontend runs the lot
`setTimeout` and calls the server at the edges:

- `POST /api/match/:id/ai-fire` — "my timer says the AI should consider bidding now"
- `POST /api/match/:id/lot-end`  — "my timer hit 0, resolve this lot"

The server **recomputes everything at request time** and never trusts client
values. There are **no server-side `setTimeout`/`setInterval` for game timing**
(the only `setTimeout`s in the codebase are the LLM request-timeout race and a
retry — not the game clock).

➡️ **Consequence: the DO migration needs NO Durable Object alarms for core
gameplay.** This removes the single hardest part of a typical DO migration. (An
alarm is only worth adding later as an optional safety net to auto-resolve a lot
if a client disconnects mid-match — a nice-to-have, not required.)

### 4.2 The code is already DO-shaped (by deliberate design)

Multiple files were written in anticipation of this migration — cite these so a
new session trusts the plan:

- `server/src/store.ts` header: *"Tomorrow (Cloudflare DO migration): the Map goes
  away and `getMatch(id)` becomes `env.MATCH.idFromName(id).get()`. The withLock
  wrapper goes away too — Durable Objects are single-threaded per ID by design."*
- `server/src/match/AuctionMatch.ts` header: one instance per `matchId`; all
  mutation through methods; **every mutating method ends with `persist()`**;
  internal secrets (`LotState.cap`, `AiPlanState.dueAt`) never leave via DTO.
- `AuctionMatch.persist()` (≈ line 1070) is a **deliberate no-op today**:
  *"Under DO: `await this.state.storage.put(...)`."*
- `server/src/match/playerPool.ts` header: *"If/when we move to a Durable Object,
  this file becomes a bundled asset import inside the worker."*
- `server/src/middleware/rateLimit.ts`: MemoryStore is swappable for a
  KV/Unstorage store with "no other code needs to change"; already reads
  `cf-connecting-ip`.

---

## 5 & 6. Cross-origin auth requirements for prod (applies to ANY backend host)

When frontend (`squadwars.online`) and backend (`api.squadwars.online` or
`*.workers.dev`) are on **different registrable domains**, the `sw_session`
cookie is **cross-site**. For it to be sent at all:

- Cookie must be **`SameSite=None; Secure`**. In code this is gated on
  `isProd()` (`NODE_ENV === "production"`), already implemented in
  `session.ts`. **So the backend MUST run with `NODE_ENV=production`.**
- CORS must echo the exact frontend origin + `Access-Control-Allow-Credentials:
  true`. Set **`CORS_ORIGIN=https://squadwars.online`** (the default is
  `localhost:3000`, which would break prod).
- Frontend already sends `credentials: "include"` on every call
  (`client/app/_lib/apiClient.ts`).

**If you skip these two env vars, match creation works but the first bid 403s
("session mismatch").** This is the classic launch-day break.

---

## 7. Backend target — Cloudflare Workers + Durable Objects + KV

### 7.1 Role of each piece

| Piece | Holds | Replaces |
|---|---|---|
| **Worker** (Hono app) | Stateless HTTP routing, CORS, session check, rate-limit, LLM fetch | `@hono/node-server` entry |
| **Durable Object** (`MATCH`) | One live `AuctionMatch` per `matchId` — budgets, queue, current lot, bid log, AI plan, LLM accounting | in-memory `Map` + `withLock` |
| **KV** | Ancillary, eventually-consistent data (see §7.4) | — |

The Hono `app` itself is portable — only the **entry point** changes
(`serve(...)` → `export default { fetch }`), and per-match calls get routed into
the DO.

### 7.2 Migration mapping (Node concept → Workers/DO)

| Today (Node) | Under Workers + DO |
|---|---|
| `serve({ fetch: app.fetch, port })` | `export default { fetch: app.fetch }` (+ `export class MatchDO`) |
| `matches.get(id)` (Map) | `env.MATCH.get(env.MATCH.idFromName(id))` → `stub.fetch(...)` |
| `withLock(id, fn)` | **delete it** — DO is single-threaded per id (use `blockConcurrencyWhile` only for init) |
| `AuctionMatch` fields in memory | DO instance fields, hydrated from `state.storage` on first access |
| `persist()` no-op | `await this.state.storage.put("match", this.serialize())` |
| `process.env.AI_KEY` at module scope | `env.AI_KEY` binding threaded into the DO (see gotcha §7.3.1) |
| `fs.readFileSync("players.json")` | `import players from "../../players.json"` (Workers bundles JSON) |
| `hono-rate-limiter` MemoryStore | KV-backed limiter, or per-IP DO, or Cloudflare WAF rate rules |
| `void this.runCapPlanning()` | `this.state.waitUntil(...)` or run inside the DO (stays alive) — §7.3.2 |
| `nanoid` for matchId | works as-is (uses Web Crypto) |
| `openai` SDK → DeepSeek | works on Workers (fetch-based) — but lazy-init the client, §7.3.1 |

### 7.3 The real gotchas (don't get surprised)

**7.3.1 — `process.env` at module scope won't work on Workers.**
`server/src/llm/deepseek.ts` and `squadBuilder.ts` do, at the top of the module:
```ts
const apiKey = process.env.AI_KEY;
const client = apiKey ? new OpenAI({ apiKey, baseURL: "https://api.deepseek.com" }) : null;
```
On Workers there is no `process.env` at module-eval time — secrets arrive per
request via the `env` binding. **Refactor to lazy-init:** pass `env.AI_KEY` in
(e.g. `getClient(apiKey)` memoized, or construct inside the DO with the bound
secret). Same applies to every other `process.env.*` read (`NODE_ENV`,
`CORS_ORIGIN`, `DEBUG_KEY`, `RATE_LIMIT_FORCE`). With `nodejs_compat` +
Wrangler, `process.env` *can* be partially polyfilled, but do not rely on it for
the top-level client construction — make it explicit.

**7.3.2 — Fire-and-forget LLM planning.**
`kickoffAsyncCapPlanning()` does `void this.runCapPlanning().catch(...)`. In a
DO the instance stays alive across requests, so this mostly "just works" because
the next request finds the planned caps in storage — but a detached promise can
be cut if the DO goes dormant. Wrap it in `this.state.waitUntil(promise)` (DO
supports `waitUntil`) so the runtime keeps the DO alive until the planning +
its `persist()` write complete.

**7.3.3 — Rate limiting across isolates.**
MemoryStore is per-isolate; Workers spin many isolates, so counters won't be
shared/accurate. Options, in order of preference for indie scale:
  (a) Cloudflare **WAF rate-limiting rules** at the edge (simplest, no code).
  (b) A KV-backed limiter (eventually consistent — fine for coarse abuse limits).
  (c) A dedicated rate-limit DO keyed by IP (precise, more work).
  The code already reads `cf-connecting-ip`, so IP extraction is ready.
  ⚠️ Also remember (`rateLimit.ts` comment): bump `CREATE_MATCH_WINDOW_MS` from
  the **dev** 2-min window to the intended **2-hour** window before public launch.

**7.3.4 — Player dataset.**
`players.json` must be bundled into the Worker (`import players from
"../../players.json"` — Workers supports JSON module imports) instead of
`fs.readFileSync`. Confirm `server/players.json` is committed (the raw
`FC26_players.csv` is gitignored and must NOT be the runtime source).

**7.3.5 — DO requires the Workers PAID plan ($5/mo).** Durable Objects are not on
the free tier. Budget for it. KV has a generous free tier.

**7.3.6 — Config dev→prod values.** `server/src/config.ts` ships **dev** values
(`LOT_DURATION_MS = 20_000`). The file header notes prod intent
(`STARTING_BUDGET = 1_000_000_000` is already prod; confirm `LOT_DURATION_MS`
and any others before launch).

### 7.4 What goes in KV (be honest — DO is load-bearing, KV is supporting)

KV is **eventually consistent**, so never use it for live match truth (that's the
DO). Good KV uses here:
- **Finished-match result snapshots** with a TTL (so a refresh after full-time
  still resolves even if the DO has evicted). Note: the **share card is already
  stateless** (URL-encoded `/r/[token]`), so KV is *not* needed for sharing.
- **Coarse rate-limit buckets** (if going with §7.3.3 option b).
- Optional: **LLM cost/usage logs** or lightweight analytics per match.
If none of these feel necessary at launch, KV can be a thin add — DO + Worker is
the coherent minimum. (Memory note from project: "Workers-without-DO is
incoherent; ship them together.")

### 7.5 `wrangler.toml` sketch (starting point, verify against current Wrangler docs)

```toml
name = "squadwars-server"
main = "src/worker.ts"          # new entry: export default { fetch } + export class MatchDO
compatibility_date = "2026-06-01"
compatibility_flags = ["nodejs_compat"]

[[durable_objects.bindings]]
name = "MATCH"
class_name = "MatchDO"

[[migrations]]
tag = "v1"
new_classes = ["MatchDO"]

[[kv_namespaces]]
binding = "KV"
id = "<filled by: wrangler kv namespace create KV>"

[vars]
CORS_ORIGIN = "https://squadwars.online"
NODE_ENV = "production"
# AI_KEY is a SECRET, not a var → wrangler secret put AI_KEY
```

### 7.6 Step-by-step migration plan

1. **Scaffold Wrangler** in `server/` (`wrangler.toml`, a `src/worker.ts` entry).
   Keep the Node entry (`index.ts`) working in parallel until the Worker is proven.
2. **Lazy-init the LLM client** (§7.3.1): thread `AI_KEY` through instead of
   reading `process.env` at module scope. Do the same for the other env reads.
3. **Convert `playerPool.ts`** to a JSON import (§7.3.4).
4. **Write `MatchDO`**: a Durable Object whose fields ARE the `AuctionMatch`
   (or that wraps it). On first request, hydrate from `state.storage`; implement
   `persist()` as `state.storage.put`. Route the existing `AuctionMatch` methods
   through DO request handlers. Delete `withLock` (DO serializes per id).
   Wrap fire-and-forget planning in `state.waitUntil` (§7.3.2).
5. **Worker entry**: mount the Hono `app`; for `/api/match/:id/*`, look up the DO
   stub by `idFromName(id)` and forward. `POST /api/match` (create) generates the
   id, sets the session cookie, and initializes the DO.
6. **Rate limiting**: pick §7.3.3 option (recommend edge WAF rules to start).
7. **Set secrets/vars**: `wrangler secret put AI_KEY`; `CORS_ORIGIN`,
   `NODE_ENV=production` in `[vars]`.
8. **Deploy** (`wrangler deploy`), test against the `*.workers.dev` URL by
   pointing Vercel's `NEXT_PUBLIC_BACKEND_URL` at it and redeploying the frontend.
9. **Custom domain**: add `api.squadwars.online` route to the Worker; update
   `NEXT_PUBLIC_BACKEND_URL` → `https://api.squadwars.online`; add it to CORS;
   redeploy frontend.
10. **Pre-launch config**: bump rate-limit create window to 2h (§7.3.3), confirm
    `config.ts` prod values (§7.3.6), delete dead `COOKIE_CROSS_SITE` from `.env`.
11. **Run the smoke test (§8).**

---

## 8. Launch gate — end-to-end smoke test

Run the WHOLE loop once on **desktop** and once on **tablet** against the live
prod backend. This is the only thing that has never been exercised end-to-end.

1. **Landing** — wordmark/fonts render (no fallback flash); START works. Paste the
   URL into an X/Slack draft → OG card unfurls.
2. **Setup** — `/health` shows online (not "backend offline"); pick shape +
   difficulty → **Take to the floor**. *(This issues the session cookie.)*
3. **Auction room loads and you can bid.** ← **THE critical check.** A 403 /
   "session mismatch" here = cross-origin cookie misconfig (§5/§6), not app code.
4. **Refresh mid-auction** → state restores from the DO, no 403.
5. Auction ends → **squad-builder** → drag XI + bench (touch on tablet ✅ already
   verified working via dnd-kit; mouse on desktop).
6. **Result** → Share on X (tweet ≤ 280 chars) → open the `/r/<token>` link in
   **incognito** → renders + unfurls.

If steps pass on both devices, the product is launch-ready.

---

## 9. Environment variable reference (full matrix)

### Frontend — Vercel (Production). `NEXT_PUBLIC_*` are build-time; redeploy after changes.
| Key | Value | If wrong |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://squadwars.online` | OG/robots/sitemap point at wrong host; share unfurls break |
| `NEXT_PUBLIC_BACKEND_URL` | backend URL (e.g. `https://api.squadwars.online`, or the `*.workers.dev` URL while testing) | game shows "backend offline" / can't create match |

### Backend — Cloudflare Worker
| Key | Where | Value | If wrong |
|---|---|---|---|
| `AI_KEY` | `wrangler secret put` | DeepSeek key | matches fall back to heuristic caps (no LLM) |
| `CORS_ORIGIN` | `[vars]` | `https://squadwars.online` | browser blocks all calls (CORS) |
| `NODE_ENV` | `[vars]` | `production` | cookie stays `Lax`/insecure → first bid 403s cross-site |
| `DEBUG_KEY` | secret (optional) | — | debug endpoints disabled in prod anyway |
| `RATE_LIMIT_FORCE` | `[vars]` (optional) | unset | only used to force-test 429 locally |

### Backend — local dev (`server/.env`)
| Key | Value |
|---|---|
| `AI_KEY` | DeepSeek key |
| ~~`COOKIE_CROSS_SITE`~~ | **dead var** — leftover from the reverted experiment (§3.3); delete it |

### Frontend — local dev (`client/.env.local`)
| Key | Value |
|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | `http://localhost:8787` |

---

## 10. Known constraints & deferred items

- **In-memory today / DO tomorrow:** until DO ships, any backend restart kills
  live matches. After DO, state survives. Don't redeploy the backend while
  people are mid-match regardless.
- **Cold start:** if the eventual host has cold starts (or a free tier), the
  first match after idle may be slow. DO + Workers cold start is small but nonzero.
- **Deferred (post-launch), tracked elsewhere:** the full Cloudflare migration
  *is* this DO+Workers+KV work; do Workers and DO **together** (Workers without DO
  is incoherent).
- **Frontend polish (non-blocking):** per-page titles, keyboard-drag a11y,
  `favicon.ico` fallback, design-token centralization.

---

## 11. Key files (jump list)

**Frontend**
- `client/app/layout.tsx` — metadata, `metadataBase`, `SITE_URL`
- `client/app/{sitemap,robots}.ts`, `client/app/manifest.ts` — SEO
- `client/app/page.tsx` — landing (env: `NEXT_PUBLIC_BACKEND_URL`, `/health`)
- `client/app/setup/page.tsx` — create match (`POST /api/match`)
- `client/app/auctionroom/[slug]/AuctionRoom.tsx` — the floor; `/:id/*` calls
- `client/app/squad-builder/{SquadBuilder,ResultScreen}.tsx` — dnd-kit XI + share
- `client/app/r/[token]/{page,opengraph-image,twitter-image}.tsx` — stateless share
- `client/app/_lib/apiClient.ts` — `credentials:"include"` fetch wrapper
- `client/lib/shareCard.ts` — URL-encoded share token

**Backend**
- `server/src/index.ts` — entry + CORS (→ becomes Worker entry)
- `server/src/store.ts` — Map + `withLock` (→ DO lookup; both deleted under DO)
- `server/src/match/AuctionMatch.ts` — all match state + `persist()` boundary
- `server/src/config.ts` — all tunables (dev vs prod values)
- `server/src/middleware/session.ts` — `sw_session` cookie / `requireSession`
- `server/src/middleware/rateLimit.ts` — limiters (MemoryStore → KV/edge)
- `server/src/llm/{deepseek,squadBuilder}.ts` — DeepSeek calls (lazy-init for Workers)
- `server/src/match/playerPool.ts` — `players.json` load (→ JSON import)
- `server/src/routes/match.ts` — route handlers

---

*Last updated 2026-06-20. If you change deploy config, env vars, or the backend
host plan, update this file.*
