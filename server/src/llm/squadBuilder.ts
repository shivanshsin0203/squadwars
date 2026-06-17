/**
 * Result-phase LLM module — two one-shot DeepSeek calls per finished match.
 *
 *   1. planAiSquad()       — happens BEFORE user sees the result. Server kicks
 *                            it off the moment the auction ends so the AI's XI
 *                            is cached by the time the user clicks RESULT.
 *                            Temperature 1.6 (creative pick + chemistry play).
 *
 *   2. writeVerdictProse() — happens WHEN user clicks RESULT. Takes the already-
 *                            computed verdict numbers as facts and writes prose
 *                            on top (match report + persona roast/acknowledge).
 *                            Temperature 1.4 (creative voice).
 *
 * Failure handling: each call has a single retry on parse/schema failure, then
 * a deterministic fallback (greedy pick / canned prose). The result screen
 * NEVER blocks on the LLM — worst case the user sees a competent fallback.
 *
 * Why separate from deepseek.ts: the cap-planning prompt is large and
 * deliberately static (DeepSeek prompt-cache hit ≈75%). These two calls have
 * different prompts and don't benefit from that cache, so isolating them keeps
 * the cap-planning cache key clean.
 */

import OpenAI from "openai";
import type {
  BoughtPlayer,
  Squad,
  Verdict,
  Player,
  Category,
} from "../types.js";
import { getSlots, type SlotDef } from "../match/squadFormations.js";
import { costForUsage } from "./deepseek.js";

// ─────────────────────────── shared client ───────────────────────────

const apiKey = process.env.AI_KEY;
const client = apiKey
  ? new OpenAI({ apiKey, baseURL: "https://api.deepseek.com" })
  : null;
const MODEL = "deepseek-chat";
const LLM_TIMEOUT_MS = 20_000;

export function isSquadLlmConfigured(): boolean {
  return client !== null;
}

export type SquadLlmUsage = {
  promptTokens: number;
  cachedPromptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  latencyMs: number;
};

function zeroUsage(): SquadLlmUsage {
  return {
    promptTokens: 0,
    cachedPromptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    latencyMs: 0,
  };
}

async function callLLM(opts: {
  matchId: string;
  tag: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens: number;
}): Promise<{ content: string; usage: SquadLlmUsage }> {
  if (!client) throw new Error("AI_KEY not configured");

  const t0 = Date.now();
  console.log(
    `[LLM:${opts.tag}] id=${opts.matchId} REQUEST model=${MODEL} temp=${opts.temperature}`
  );

  const completion = await Promise.race([
    client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: opts.systemPrompt },
        { role: "user", content: opts.userPrompt },
      ],
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      response_format: { type: "json_object" },
    }),
    new Promise<never>((_, rej) =>
      setTimeout(
        () => rej(new Error(`LLM timeout after ${LLM_TIMEOUT_MS}ms`)),
        LLM_TIMEOUT_MS
      )
    ),
  ]);

  const ms = Date.now() - t0;
  const content = completion.choices[0]?.message?.content ?? "";
  const u = completion.usage;
  const promptTokens = u?.prompt_tokens ?? 0;
  const completionTokens = u?.completion_tokens ?? 0;
  const detail = u as unknown as {
    prompt_cache_hit_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  } | undefined;
  const cachedPromptTokens =
    detail?.prompt_cache_hit_tokens ??
    detail?.prompt_tokens_details?.cached_tokens ??
    0;
  const totalTokens = u?.total_tokens ?? promptTokens + completionTokens;
  const costUsd = costForUsage(promptTokens, cachedPromptTokens, completionTokens);

  console.log(
    `[LLM:${opts.tag}] id=${opts.matchId} RESPONSE ${ms}ms tokens=${totalTokens} ` +
      `(prompt=${promptTokens} cached=${cachedPromptTokens} comp=${completionTokens}) ` +
      `cost=$${costUsd.toFixed(6)} content=${content.substring(0, 200).replace(/\s+/g, " ")}${content.length > 200 ? "…" : ""}`
  );

  return {
    content,
    usage: { promptTokens, cachedPromptTokens, completionTokens, totalTokens, costUsd, latencyMs: ms },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. planAiSquad — pick best XI + bench from the AI's roster
// ═══════════════════════════════════════════════════════════════════════════════

export type PlanSquadRequest = {
  matchId: string;
  formation: string;
  roster: BoughtPlayer[];        // AI's bought list (already sorted, all owned)
  persona: { name: string; style: string };
};

export type PlanSquadResult = {
  squad: Squad;
  usage: SquadLlmUsage;
  source: "llm" | "fallback";
};

const SQUAD_SYSTEM_PROMPT = `You are a top football tactician picking the best possible XI + bench from a finite roster of bought players for a SquadWars post-auction result screen.

YOUR JOB
Given:
  - a formation with 11 named slots (each has an id, a position like "ST"/"CDM"/"CB", and a category GK/DEF/MID/ATT)
  - a roster of players (each has id, name, primary_position, alternative positions, category, overall, club, country)
Pick exactly 11 starters (one player per slot) and up to 5 bench players. Every player you place must come from the roster — never invent IDs.

SCORING FORMULA (the same formula the user's screen will display — optimize for it)
TEAM OVERALL = round( sum_over_starters(player.overall + fit_delta) / 11 )
  fit_delta:
    primary  (slot.pos == player.primary_position):           +2.0
    alt      (slot.pos in player.positions but not primary):  +0.5
    same-cat (player.category == slot.cat, no position match): -10.0
    wrong    (category mismatch — e.g. GK in CM):              -45.0
  TEAM OVERALL is hard-capped at max_starter_overall + 2 and clamped to ≤99.
  So putting a GK in midfield is CATASTROPHIC (−45 per slot). Prefer primary fits whenever possible.

TEAM CHEMISTRY (max 37, also displayed) = sum over starters of min(3, clubMates*2 + nationMates) plus a bench bonus of +1 per starter linked to a bench player by club OR country (bench bonus capped at 4).

PICKING STRATEGY
1. Fill every XI slot. NEVER leave a slot empty if the roster has enough players.
2. Maximize TEAM OVERALL first — never sacrifice a primary fit for chemistry unless it gains real chemistry.
3. Within equal-OVR picks, choose the option that boosts chemistry (same club > same country > none).
4. After XI is set, fill bench (up to 5) with the strongest unused players. If the roster has fewer than 11 players, fill what you can.
5. If a player's category is wrong for every remaining slot, use them as bench, not a starter.

OUTPUT FORMAT — STRICT
Reply with ONLY a JSON object, no prose, no markdown fences.
Schema:
{
  "xi": [
    { "slotId": "<exact slot id from input>", "playerId": <int from roster> }
  ],
  "bench": [
    { "index": <0..4>, "playerId": <int from roster> }
  ]
}
- xi MUST contain exactly one entry per slot in the input formation (same slotIds, any order).
- A playerId may appear at most once across xi + bench.
- bench length must be ≤ min(5, roster.length - 11). Use bench indices 0,1,2,... in order, no gaps.
- Any malformed entry, duplicate id, missing slot, or invented id → the entry is discarded by the validator and a greedy fallback fills the gap.`;

function asUpcomingPlayer(bp: BoughtPlayer) {
  return {
    id: bp.player.id,
    name: bp.player.name,
    primary_position: bp.player.primary_position,
    positions: bp.player.positions,
    category: bp.player.category,
    overall: bp.player.overall,
    club: bp.player.club,
    country: bp.player.country,
  };
}

function asSlotForLlm(s: SlotDef) {
  return { id: s.id, pos: s.pos, cat: s.cat };
}

export async function planAiSquad(
  req: PlanSquadRequest
): Promise<PlanSquadResult> {
  const slots = getSlots(req.formation);
  const roster = req.roster.slice();

  // Edge case: roster shorter than 11. Skip LLM, fallback handles it.
  if (roster.length < 11) {
    console.log(
      `[LLM:ai-xi] id=${req.matchId} roster=${roster.length} < 11 — falling back without LLM call`
    );
    return {
      squad: greedyPickSquad(slots, roster),
      usage: zeroUsage(),
      source: "fallback",
    };
  }

  if (!isSquadLlmConfigured()) {
    console.log(`[LLM:ai-xi] id=${req.matchId} NOT-CONFIGURED — greedy fallback`);
    return { squad: greedyPickSquad(slots, roster), usage: zeroUsage(), source: "fallback" };
  }

  const userPrompt =
    "Pick the strongest XI + bench from this roster for the named formation. Return JSON only.\n\n" +
    JSON.stringify(
      {
        matchId: req.matchId,
        formation: req.formation,
        persona: req.persona,
        slots: slots.map(asSlotForLlm),
        roster: roster.map(asUpcomingPlayer),
      },
      null,
      2
    );

  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { content, usage } = await callLLM({
        matchId: req.matchId,
        tag: `ai-xi:try${attempt}`,
        systemPrompt: SQUAD_SYSTEM_PROMPT,
        userPrompt,
        // 1.6 was too hot for what is really a constrained-optimisation problem;
        // the model produced wrong-category placements (e.g. Pedri at RCB) because
        // the −45 OVR penalty rule was treated like creative guidance. 0.6 keeps
        // some variety in the picks while letting the model focus on the math.
        temperature: 0.5,
        maxTokens: 700,
      });
      const parsed = JSON.parse(content) as { xi?: unknown; bench?: unknown };
      const squad = validateSquadJson(parsed, slots, roster, req.matchId);
      console.log(
        `[LLM:ai-xi] id=${req.matchId} OK (attempt ${attempt}) xi=${squad.xi.length} bench=${squad.bench.length}`
      );
      return { squad, usage, source: "llm" };
    } catch (err) {
      lastError = (err as Error).message;
      console.log(
        `[LLM:ai-xi] id=${req.matchId} attempt ${attempt} FAILED: ${lastError}`
      );
    }
  }
  console.log(
    `[LLM:ai-xi] id=${req.matchId} ALL ATTEMPTS FAILED (${lastError}) — greedy fallback`
  );
  return { squad: greedyPickSquad(slots, roster), usage: zeroUsage(), source: "fallback" };
}

// ─────────────── validator: LLM JSON → Squad (drops bad entries, fills gaps via greedy) ───────────────

function validateSquadJson(
  parsed: { xi?: unknown; bench?: unknown },
  slots: SlotDef[],
  roster: BoughtPlayer[],
  matchId: string
): Squad {
  const rosterById = new Map<number, BoughtPlayer>(
    roster.map((b) => [b.player.id, b])
  );
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const used = new Set<number>();

  const xi: { slotId: string; playerId: number }[] = [];
  const filledSlots = new Set<string>();

  if (Array.isArray(parsed.xi)) {
    for (const raw of parsed.xi) {
      const entry = raw as { slotId?: unknown; playerId?: unknown };
      const slotId = typeof entry.slotId === "string" ? entry.slotId : null;
      const playerId =
        typeof entry.playerId === "number" && Number.isInteger(entry.playerId)
          ? entry.playerId
          : null;
      if (!slotId || playerId === null) continue;
      if (!slotById.has(slotId)) continue;
      if (filledSlots.has(slotId)) continue;
      if (!rosterById.has(playerId)) continue;
      if (used.has(playerId)) continue;
      xi.push({ slotId, playerId });
      filledSlots.add(slotId);
      used.add(playerId);
    }
  }

  // Fill any slots the LLM missed using greedy best-fit on remaining roster.
  const missingSlots = slots.filter((s) => !filledSlots.has(s.id));
  if (missingSlots.length > 0) {
    console.log(
      `[LLM:ai-xi] id=${matchId} validator: ${missingSlots.length} slot(s) missing from LLM output → greedy fill`
    );
    const remaining = roster.filter((b) => !used.has(b.player.id));
    for (const slot of missingSlots) {
      const pick = bestFitFromPool(slot, remaining);
      if (!pick) continue;
      xi.push({ slotId: slot.id, playerId: pick.player.id });
      used.add(pick.player.id);
      const idx = remaining.findIndex((b) => b.player.id === pick.player.id);
      if (idx >= 0) remaining.splice(idx, 1);
    }
  }

  // Bench: take LLM's picks if valid, otherwise fill by remaining OVR.
  const bench: { index: number; playerId: number }[] = [];
  const benchUsed = new Set<number>();
  if (Array.isArray(parsed.bench)) {
    for (const raw of parsed.bench) {
      const entry = raw as { index?: unknown; playerId?: unknown };
      const playerId =
        typeof entry.playerId === "number" && Number.isInteger(entry.playerId)
          ? entry.playerId
          : null;
      if (playerId === null) continue;
      if (used.has(playerId) || benchUsed.has(playerId)) continue;
      if (!rosterById.has(playerId)) continue;
      bench.push({ index: bench.length, playerId });
      benchUsed.add(playerId);
      if (bench.length >= 5) break;
    }
  }
  if (bench.length < 5) {
    const remaining = roster
      .filter((b) => !used.has(b.player.id) && !benchUsed.has(b.player.id))
      .sort((a, b) => b.player.overall - a.player.overall);
    for (const bp of remaining) {
      if (bench.length >= 5) break;
      bench.push({ index: bench.length, playerId: bp.player.id });
      benchUsed.add(bp.player.id);
    }
  }

  // Structural safety net: scan the XI for category-wrong placements (the −45
  // OVR class — e.g. Pedri at RCB) and swap them with a bench / pool player
  // whose category fits. Same-cat misfits (e.g. CB at LB, a −10) are left alone
  // — those are tactical calls the LLM might be making on purpose. This kicks
  // in even when the LLM ignores the prompt's fit-delta rules.
  repairWrongPlacements({ xi, bench }, slots, roster, matchId);

  return { xi, bench };
}

function fit(player: Player, slot: SlotDef): "primary" | "alt" | "same-cat" | "wrong" {
  if (slot.pos === player.primary_position) return "primary";
  if (player.positions.includes(slot.pos)) return "alt";
  if (slot.cat === player.category) return "same-cat";
  return "wrong";
}

/**
 * Post-LLM repair: any XI starter whose category is wrong for its slot gets
 * swapped with the best available alternative — first from the bench, then
 * from the unused pool. Logs every swap so we can audit.
 *
 * Why this exists: the squad-pick LLM occasionally places a player in a slot
 * that costs −45 effective OVR (a "wrong" fit) when a perfectly viable
 * teammate is sitting on the bench. Match #-88lgtb12R put Pedri (CM) at RCB
 * while Hincapié (CB) was on the bench. This function makes that impossible
 * to ship.
 */
function repairWrongPlacements(
  squad: Squad,
  slots: SlotDef[],
  roster: BoughtPlayer[],
  matchId: string
): void {
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const rosterById = new Map<number, BoughtPlayer>(
    roster.map((b) => [b.player.id, b])
  );
  const inXi = new Set<number>(squad.xi.map((e) => e.playerId));
  const inBench = new Set<number>(squad.bench.map((e) => e.playerId));

  for (const entry of squad.xi) {
    const slot = slotById.get(entry.slotId);
    const bp = rosterById.get(entry.playerId);
    if (!slot || !bp) continue;
    const currentFit = fit(bp.player, slot);
    if (currentFit !== "wrong") continue;

    // Look for any bench player whose category at least matches this slot.
    let swappedFromBench = false;
    for (const benchEntry of squad.bench) {
      const benchBp = rosterById.get(benchEntry.playerId);
      if (!benchBp) continue;
      const benchFit = fit(benchBp.player, slot);
      if (benchFit === "wrong") continue;
      console.log(
        `[LLM:ai-xi] id=${matchId} repair: swap ${bp.player.name} (wrong) ` +
          `↔ ${benchBp.player.name} (${benchFit}) for slot ${slot.id}`
      );
      entry.playerId = benchBp.player.id;
      benchEntry.playerId = bp.player.id;
      swappedFromBench = true;
      break;
    }
    if (swappedFromBench) continue;

    // Try the unused pool.
    const unused = roster.filter(
      (b) => !inXi.has(b.player.id) && !inBench.has(b.player.id)
    );
    for (const candidate of unused) {
      const cFit = fit(candidate.player, slot);
      if (cFit === "wrong") continue;
      console.log(
        `[LLM:ai-xi] id=${matchId} repair: promote ${candidate.player.name} ` +
          `(${cFit}) → XI slot ${slot.id}; ${bp.player.name} → bench`
      );
      // Swap in the candidate; demote the wrong player to bench if there's space.
      entry.playerId = candidate.player.id;
      inXi.delete(bp.player.id);
      inXi.add(candidate.player.id);
      if (squad.bench.length < 5) {
        squad.bench.push({ index: squad.bench.length, playerId: bp.player.id });
        inBench.add(bp.player.id);
      }
      break;
    }
  }
}

// ─────────────── deterministic greedy fallback (used when LLM is off/fails) ───────────────

function fitScore(player: Player, slot: SlotDef): number {
  if (slot.pos === player.primary_position) return 2.0;
  if (player.positions.includes(slot.pos)) return 0.5;
  if (slot.cat === player.category) return -10.0;
  return -45.0;
}

function bestFitFromPool(slot: SlotDef, pool: BoughtPlayer[]): BoughtPlayer | null {
  if (pool.length === 0) return null;
  let best: BoughtPlayer | null = null;
  let bestEffective = -Infinity;
  for (const bp of pool) {
    const eff = bp.player.overall + fitScore(bp.player, slot);
    if (eff > bestEffective) {
      best = bp;
      bestEffective = eff;
    }
  }
  return best;
}

/**
 * Greedy ordering: fill GK first (smallest pool), then DEF, MID, ATT slots in
 * slot-table order. For each slot, pick the best-effective-OVR remaining player.
 * Bench: top 5 leftover by raw OVR.
 */
export function greedyPickSquad(slots: SlotDef[], roster: BoughtPlayer[]): Squad {
  const order: Category[] = ["GK", "DEF", "MID", "ATT"];
  const ordered = slots
    .slice()
    .sort((a, b) => order.indexOf(a.cat) - order.indexOf(b.cat));
  const used = new Set<number>();
  const xi: { slotId: string; playerId: number }[] = [];
  for (const slot of ordered) {
    const pool = roster.filter((b) => !used.has(b.player.id));
    const pick = bestFitFromPool(slot, pool);
    if (!pick) continue;
    xi.push({ slotId: slot.id, playerId: pick.player.id });
    used.add(pick.player.id);
  }
  // Preserve slot-table order in returned xi (so the UI renders consistently).
  const slotIdx = new Map(slots.map((s, i) => [s.id, i]));
  xi.sort((a, b) => (slotIdx.get(a.slotId) ?? 0) - (slotIdx.get(b.slotId) ?? 0));

  const bench: { index: number; playerId: number }[] = [];
  const leftovers = roster
    .filter((b) => !used.has(b.player.id))
    .sort((a, b) => b.player.overall - a.player.overall)
    .slice(0, 5);
  leftovers.forEach((bp, i) => bench.push({ index: i, playerId: bp.player.id }));
  return { xi, bench };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. writeVerdictProse — report + persona roast/acknowledge on top of the verdict
// ═══════════════════════════════════════════════════════════════════════════════

export type ProseRequest = {
  matchId: string;
  formation: string;
  persona: { name: string; style: string };
  verdict: Verdict;                          // already computed; LLM doesn't get to change scores
  userBought: BoughtPlayer[];
  aiBought: BoughtPlayer[];
  userTotalSpent: number;
  aiTotalSpent: number;
};

export type ProseResult = {
  report: string;
  roast: string;
  usage: SquadLlmUsage;
  source: "llm" | "fallback";
};

const PROSE_SYSTEM_PROMPT = `You are writing the final verdict copy for a SquadWars post-auction result screen. Every word earns its place. NO FILLER.

YOU WRITE TWO PIECES OF COPY.

  1. report  — JUSTIFY THE VERDICT. EXACTLY 3 sentences. Not 2. Not 4. THREE.
               This is a "squad report" — its only job is to explain WHY the winner won,
               using the actual data. Recommended structure:
                 • Sentence 1: name the decisive category and the score (e.g. "Attack
                   landed 88 to 84").
                 • Sentence 2: name the specific signing/player on each side who shaped
                   that category (e.g. "Vitinha at €161M ran the tempo; AI's Pedri
                   couldn't get out of second gear").
                 • Sentence 3: name the secondary swing — chem, budget eff., a closed
                   gap — that confirmed the result.
               Tight prose, ~55 words total, every sentence earning its place.

  2. roast   — THE AI'S VOICE on the result, in persona. ≤ 2 sentences, ≤ 30 words TOTAL.
               Sign off with —{persona.name} on the last line.
               BEHAVIOUR — pick exactly ONE side, do not mix:
                 • verdict.winner == "ai"   → ROAST. Pick ONE concrete user weakness
                   (an overpaid buy, missing position, weak XI slot). Mock it.
                   Don't acknowledge their wins. Don't soften the punch.
                 • verdict.winner == "user" → ACKNOWLEDGE. ONE specific user signing
                   or category that beat you. No backhanded "but actually" qualifier.
                   "Hands up, X beat me on Y. Next round it's mine."
                 • verdict.winner == "draw" → GRACEFUL. Name the closest category.
               NEVER mix roast + acknowledgement in one roast. Pick a side.

HARD RULES — VIOLATIONS = AUTOMATIC FALLBACK

  1. NEVER invent a player name. Every name you mention MUST appear verbatim in
     userBought[].name or aiBought[].name. If you can't find a name in those arrays,
     don't write it. Inventing names ("Hughes staying") is the worst error class.
  2. NEVER write a number that contradicts the verdict object. Quote OVRs, chem
     scores, category scores, prices ONLY from the data given.
  3. NO stock phrases — banned: "at the end of the day", "all to play for",
     "credit where credit's due", "make no mistake", "tale of two halves",
     "back of the net", "showed character", "park the bus", "as expected",
     "what a game", "to be fair".
  4. NO emojis. NO hashtags. NO exclamation points. NO em-dashes mid-sentence as
     drama beats (use commas). Plain prose.
  5. Use first-person ("I", "we") in the roast; third-person in the report.

FACTS AVAILABLE (use only these; do not invent)
- verdict.score, verdict.categories[] (Attack/Midfield/Defence/Chemistry/Budget eff., each .user/.ai/.winner)
- verdict.userOverall, verdict.aiOverall, verdict.userChem, verdict.aiChem
- userTotalSpent, aiTotalSpent (raw euros — /1_000_000 for €M)
- userBought, aiBought (each entry has .name, .position, .ovr, .price)
- persona.name, persona.style — adopt the voice verbatim

OUTPUT FORMAT — STRICT
Reply with ONLY a JSON object, no prose, no markdown fences.
Schema:
{
  "report": "<EXACTLY 3 sentences, ~55 words, justifies the verdict using the data>",
  "roast":  "<≤2 sentences, ≤30 words, ends with —{persona.name}>"
}
Empty / missing / wrong sentence count → deterministic fallback fires and your voice is lost.`;

export async function writeVerdictProse(req: ProseRequest): Promise<ProseResult> {
  if (!isSquadLlmConfigured()) {
    console.log(`[LLM:verdict] id=${req.matchId} NOT-CONFIGURED — canned prose`);
    return { ...buildFallbackProse(req), usage: zeroUsage(), source: "fallback" };
  }

  const userPrompt =
    "Write the match report + persona roast for this match. Return JSON only.\n\n" +
    JSON.stringify(
      {
        matchId: req.matchId,
        formation: req.formation,
        persona: req.persona,
        verdict: {
          winner: req.verdict.winner,
          score: req.verdict.score,
          categories: req.verdict.categories,
          userOverall: req.verdict.userOverall,
          aiOverall: req.verdict.aiOverall,
          userChem: req.verdict.userChem,
          aiChem: req.verdict.aiChem,
        },
        userTotalSpent: req.userTotalSpent,
        aiTotalSpent: req.aiTotalSpent,
        userBought: req.userBought.map((b) => ({
          name: b.player.name,
          position: b.player.primary_position,
          ovr: b.player.overall,
          price: b.price,
        })),
        aiBought: req.aiBought.map((b) => ({
          name: b.player.name,
          position: b.player.primary_position,
          ovr: b.player.overall,
          price: b.price,
        })),
      },
      null,
      2
    );

  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { content, usage } = await callLLM({
        matchId: req.matchId,
        tag: `verdict:try${attempt}`,
        systemPrompt: PROSE_SYSTEM_PROMPT,
        userPrompt,
        // Hotter than the squad-pick call because this IS creative writing, but
        // 1.4 was loose enough to let the model invent a fake player ("Hughes"
        // in match -88lgtb12R). 0.9 keeps voice while keeping it tethered.
        temperature: 0.9,
        // 3 sentences of report + 2 of roast + JSON wrapping = ~120 tokens, but
        // give headroom because the model occasionally adds whitespace.
        maxTokens: 380,
      });
      const parsed = JSON.parse(content) as { report?: unknown; roast?: unknown };
      const report = typeof parsed.report === "string" ? parsed.report.trim() : "";
      const roast = typeof parsed.roast === "string" ? parsed.roast.trim() : "";
      if (!report || !roast) throw new Error("missing report or roast in response");
      console.log(
        `[LLM:verdict] id=${req.matchId} OK (attempt ${attempt}) report.len=${report.length} roast.len=${roast.length}`
      );
      return { report, roast, usage, source: "llm" };
    } catch (err) {
      lastError = (err as Error).message;
      console.log(
        `[LLM:verdict] id=${req.matchId} attempt ${attempt} FAILED: ${lastError}`
      );
    }
  }

  console.log(`[LLM:verdict] id=${req.matchId} ALL ATTEMPTS FAILED — canned prose`);
  return { ...buildFallbackProse(req), usage: zeroUsage(), source: "fallback" };
}

function buildFallbackProse(req: ProseRequest): { report: string; roast: string } {
  const v = req.verdict;
  // Pick the single category with the largest gap as the headline.
  const sorted = v.categories
    .map((c) => ({ c, gap: Math.abs(c.user - c.ai) }))
    .sort((a, b) => b.gap - a.gap);
  const topCat = sorted[0]?.c;

  // Pick the second-largest gap as the supporting category for sentence 3.
  const second = sorted[1]?.c;
  let report: string;
  if (v.winner === "draw" || !topCat) {
    report =
      `Honours even at ${v.score.user}–${v.score.ai}. ` +
      `Both XIs landed on OVR ${v.userOverall} and ${v.aiOverall} respectively. ` +
      `Chemistry stayed level at ${v.userChem} versus ${v.aiChem}, the kind of card that asks for a replay.`;
  } else {
    const youOrAi = topCat.winner === "user" ? "You" : "AI";
    const winnerOvr = v.winner === "user" ? v.userOverall : v.aiOverall;
    const loserOvr = v.winner === "user" ? v.aiOverall : v.userOverall;
    const supportLine = second
      ? `${second.winner === "user" ? "Your" : "AI's"} edge in ${second.name} (${second.user}–${second.ai}) sealed it.`
      : `The chem gap (${v.userChem} vs ${v.aiChem}) confirmed the result.`;
    report =
      `${youOrAi} took ${topCat.name} ${topCat.user}–${topCat.ai} and that was the decisive category. ` +
      `Headline OVR finished ${winnerOvr} to ${loserOvr}, comfortable rather than commanding. ` +
      supportLine;
  }

  let roast: string;
  if (v.winner === "ai") {
    roast = `Your XI ran out of legs before the hour. Be sharper next time. —${req.persona.name}`;
  } else if (v.winner === "user") {
    roast = `Hands up, you read the room better tonight. Next round it's mine. —${req.persona.name}`;
  } else {
    roast = `Two squads, two halves of the same coin. Replay it tomorrow. —${req.persona.name}`;
  }
  return { report, roast };
}
