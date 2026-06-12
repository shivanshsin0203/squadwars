/**
 * DeepSeek cap-planning module.
 *
 * One responsibility: take a strategic snapshot of the match and return caps
 * (max euros the AI is willing to pay) for upcoming lots. The execution
 * layer (AuctionMatch.aiFire) reads these caps but never knows the LLM exists.
 *
 * When this is called:
 *   - SYNC, once, at match creation — seeds caps for the next 2 lots.
 *   - ASYNC, once per /lot-end — refreshes caps for the next 2 lots.
 *   - NEVER during the bid loop. The bid loop reads the snapshot only.
 *
 * Failure handling: if the call fails, throws or returns invalid JSON, or
 * returns a cap mismatched to the requested player, the caller logs and
 * falls back to the heuristic (server/src/match/ai.ts). The auction never
 * blocks on the LLM.
 *
 * cap = 0 is a valid "skip" — the heuristic walk-detection already handles it:
 * computeAiBidAmount(currentBid=0, cap=0) returns null → AI walks → client
 * sees aiPlan=null and never schedules a setTimeout. No client change needed.
 */

import OpenAI from "openai";
import { HEURISTIC_CAP_BUDGET_FRACTION } from "../config.js";

// ─────────────────────────── client ───────────────────────────

const apiKey = process.env.AI_KEY;

const client = apiKey
  ? new OpenAI({ apiKey, baseURL: "https://api.deepseek.com" })
  : null;

const MODEL = "deepseek-chat"; // simple chat model, NOT reasoner

if (!apiKey) {
  console.warn(
    "[LLM] AI_KEY not set — every match will use heuristic caps only"
  );
} else {
  console.log(`[LLM] DeepSeek configured (model=${MODEL})`);
}

const LLM_TIMEOUT_MS = 12_000;

// ─────────────────────────── public types ───────────────────────────

export type UpcomingPlayerCtx = {
  lotIndex: number;
  id: number;
  name: string;
  primary_position: string;
  category: "GK" | "DEF" | "MID" | "ATT";
  overall: number;
  club: string;
  country: string;
  value_eur: number;
};

export type LlmCapRequest = {
  matchId: string;
  formation: string;
  aiBudgetLeft: number;
  userBudgetLeft: number;
  lotIndex: number;
  lotsTotal: number;
  lotsRemaining: number;

  /** Players we want CAPS for (LLM must return one entry per item, in order). */
  toPlan: UpcomingPlayerCtx[];

  /** Players the LLM should be AWARE of but not cap right now (lookahead context). */
  upcomingContext: UpcomingPlayerCtx[];

  aiSquad: {
    counts: { GK: number; DEF: number; MID: number; ATT: number };
    targets: { GK: number; DEF: number; MID: number; ATT: number };
    /** XI deficit per position — STRICT. Format: "DEF: 2/4 — STILL NEED 2 STARTERS". */
    xiStatus: {
      GK: string;
      DEF: string;
      MID: string;
      ATT: string;
    };
    /** Flat list of unfilled XI slots, one entry per missing starter. Example: ["DEF","DEF","MID"]. */
    unfilledXiSlots: Array<"GK" | "DEF" | "MID" | "ATT">;
    /** True if every XI slot in every category is filled. Bench logic kicks in. */
    xiComplete: boolean;
    /** How many bench players AI has bought beyond XI targets (counts surplus across all categories). */
    benchCount: number;
    /** MANDATORY bench floor — AI MUST end the match with at least this many bench players. */
    benchMinimum: number;
    /** Target bench size — match-end goal is to have this many bench players. */
    benchTarget: number;
    /** How many more bench players AI should aim to buy (max(0, benchTarget - benchCount)). */
    benchNeeded: number;
    /** How many short of the mandatory minimum. If > 0, AI is in BENCH-DEFICIT mode. */
    benchMandatoryGap: number;
    bought: Array<{
      name: string;
      position: string;
      ovr: number;
      price: number;
    }>;
  };

  /** Remaining lots (after this batch) grouped by category — tells LLM how scarce each slot is. */
  remainingByCategory: { GK: number; DEF: number; MID: number; ATT: number };

  /**
   * Spend-pressure signals to combat AI's budget-hoarding tendency.
   * The match-end target is to have ≤€5M left over.
   */
  spendPressure: {
    /** 0.0 (last lot) to 1.0 (no lots resolved yet). Fraction of queue remaining. */
    fraction: number;
    /** Server's estimate of how much AI should still have at this point if pacing perfectly. */
    expectedBudgetNow: number;
    /** aiBudgetLeft - expectedBudgetNow. Positive number = HOARDING; raise your caps. */
    hoardingExcess: number;
    /** Human-readable verdict: "ON_PACE" | "HOARDING_MILD" | "HOARDING_SEVERE" | "OVER_PACE". */
    verdict: "ON_PACE" | "HOARDING_MILD" | "HOARDING_SEVERE" | "OVER_PACE";
  };

  userActivity: {
    boughtCount: number;
    totalSpent: number;
    averagePrice: number;
    highestSinglePrice: number;
    recentWins: Array<{ player: string; ovr: number; price: number }>;
  };

  /** Heads-up about who you're playing against. Adjust aggression accordingly. */
  opponentSkill: "casual" | "skilled" | "expert";
};

// ─────────────────────────── system prompt ───────────────────────────

const SYSTEM_PROMPT = `You are the AI bidder in SquadWars — a 1-vs-1 English-ascending football auction game.

YOUR JOB
- Set a CAP (the maximum euros you are willing to pay) for each upcoming player you are asked about.
- The cap is your walk-away price. A pure-code execution layer will bid the minimum legal raise on your behalf round by round and stop at the cap. You never decide WHEN to bid — only HOW HIGH.

MATCH PARAMETERS
- 33 total lots in the queue. You both pick from this pool — most lots will go unbought.
- Starting XI you need to fill (4-3-3 formation): 1 GK, 4 DEF, 3 MID, 3 ATT = 11 players.
- Buying beyond your XI targets = bench depth, no scoring value. Don't chase it.
- Starting budget is €1,000,000,000 (€1B) per side. Plenty of room — don't be cheap on real talent.
- Every lot OPENS at the player's market value (value_eur). To bid, you must beat that opening price by at least €1M.
- "Skipping" is fine — set cap=0. cap below the opening price ALSO means skip (you won't be able to bid in).

OUTPUT FORMAT — STRICT
Reply with ONLY a JSON object, no prose, no markdown fences.
Schema:
{
  "plan": [
    {
      "player_id": <int>,
      "cap": <int euros>,
      "xi_status_quote": "<EXACT verbatim copy of aiSquad.xiStatus[player.category]>",
      "value_eur_seen": <int euros, exact copy of the player's value_eur from input>,
      "reason": "<short, ≤ 1 to 2 sentences>"
    }
  ]
}
- One entry per requested player, IN THE ORDER GIVEN in toPlan[].
- player_id MUST equal the requested player's id (we validate). Do not guess.
- cap is an INTEGER in raw euros. €75M = 75000000. Decimals are rejected.
- cap=0 means SKIP — executor will not bid.
- xi_status_quote MUST be the EXACT string from aiSquad.xiStatus[player.category], byte-for-byte. Whitespace and punctuation count. We compare. Mismatch → entry discarded → heuristic fallback fires.
- value_eur_seen MUST be the exact integer from the player's value_eur. Mismatch → entry discarded.
- Why these fields exist: they force you to READ the server's deficit and pricing before deciding. The xi_status_quote is the single most important defense against position-counting mistakes. The value_eur_seen prevents you from setting cap below value_eur by accident (which = walk = wasted lot).
- MANDATORY CAP FLOOR — if your xi_status_quote contains "STILL NEED" (i.e. the player's category is unfilled in XI), your cap MUST be ≥ value_eur_seen + 1000000 (€1M). A cap equal to or below value_eur on an XI-deficit category lot means you CANNOT bid and you LOSE the slot. There is no situation where this is correct. If unsure, set cap = value_eur_seen + 5000000 to guarantee entry. The Otamendi failure (lot 31 of match k6AchslaSi) cost the AI the entire match because of this exact mistake.
- Invalid JSON, missing fields, wrong order, or wrong player_id → entry discarded and heuristic fallback used. Be precise.

OPPONENT NOTE
- opponentSkill tells you the calibre of the user. "skilled" or "expert" = a football-literate opponent who knows player ratings, knows the market, will outbid you on real elites, and will NOT drop out cheap. Don't expect mistakes from them; compete on value.
- Against a skilled opponent the "strategic over-bid to drain budget" tactic is risky — they may not flinch. Use it only when YOU could realistically use the player as backup too.

CORE OBJECTIVE — MUST READ
Build the strongest possible squad, in this STRICT PRIORITY ORDER:

  PRIORITY 1 (NON-NEGOTIABLE): Complete the starting XI. 1 GK + 4 DEF + 3 MID + 3 ATT = 11.
    An incomplete XI is a CATASTROPHIC LOSS — every missing slot is an automatic forfeit
    in that category showdown. You cannot win the match with even one empty XI slot.
    NEVER skip a player at a position where aiSquad.xiStatus[CATEGORY] shows "STILL NEED N STARTER(S)" — unless
    remainingByCategory[CATEGORY] is at least as large as the deficit AND the upcoming
    player at that category is clearly better. If the player in front of you is the LAST
    available at a position where you have a deficit, BUY HIM, even if overpriced.

  PRIORITY 2 (NON-NEGOTIABLE — same priority tier as XI): At least 4 bench players.
    aiSquad.benchMinimum = 4 — this is a HARD floor, not a target. Finishing with 0–3 bench
    players is a LOSING strategy and counts as failure on par with an incomplete XI.
    aiSquad.benchTarget = 5 is the stretch goal — buying 5 is even better.
    aiSquad.benchMandatoryGap tells you how many more bench buys you MUST still make.
    When benchMandatoryGap > 0: treat ANY OVR 82+ player whose category is XI-COMPLETE as a
    serious buy candidate. Cap at or above value_eur. Skip = only if a clearly better
    same-position player is in lookahead.
    Once benchCount ≥ 4 you've cleared the minimum — additional bench is welcome but optional.

  PRIORITY 3 (NICE TO HAVE — ONLY a tiebreaker, never a reason to skip):
    Chemistry — shared club or country links. Use ONLY to break ties between similar-OVR
    options at the SAME priority level (e.g. choosing between two OVR-83 bench options).
    DO NOT skip a needed XI starter for chemistry. DO NOT skip a needed bench buy for chemistry.
    Chemistry is a multiplier on top of a sound XI + bench — never a substitute for either.
    If a non-chemistry buy is required to hit your XI or bench minimum, take it.

BUDGET RULE
- Spend nearly all €1B. Target: under €5M remaining at match end. Leftover budget = wasted potential.
- Spend ~75–85% of budget on the XI, ~15–25% on bench. If you finish XI with €400M+ unspent, the
  bench buys should be aggressive too — pay fair value for OVR 83–86 depth.

PRIORITY-CHECK RULES (apply every call)
1. If aiSquad.xiComplete is FALSE: focus on filling unfilledXiSlots. For each player in toPlan whose
   category appears in unfilledXiSlots, the default action is BUY, not skip.
   - Skip only if remainingByCategory shows clearly better same-position options ahead AND the deficit will still be filled in time.
   - FORBIDDEN RATIONALIZATION: if sameCatRemainingInQueue equals sameCatDeficit (i.e. you NEED every remaining same-position player to fill XI), the "save for upcoming" justification is BANNED. There is no upcoming. Buy this one at a premium cap. Server will enforce a MUST-BUY floor (cap raised to 1.5× value_eur) if you set it too low. Don't make us do it.
2. If aiSquad.xiComplete is TRUE and benchMandatoryGap > 0: BENCH-DEFICIT MODE. You MUST buy. Treat any OVR 82+ player as a strong bid candidate. Cap at value_eur or slightly above. Skip ONLY for clearly better same-position player in lookahead.
3. If aiSquad.xiComplete is TRUE and benchMandatoryGap == 0 (≥4 bench bought) and benchNeeded > 0: bench-stretch mode. Selective bidding, prefer chemistry/depth fits.
4. If benchMandatoryGap == 0 and benchNeeded == 0 (≥5 bench bought) and xiComplete: cruise mode. Skip is fine.
5. spendPressure.verdict overrides part of the above:
   - HOARDING_SEVERE → all caps in this call MUST be raised at least +30% above what you'd normally set. Server will multiply by ×1.5 anyway for XI-deficit caps in the last 10 lots — match its aggression so you don't get clamped at the budget ceiling.
   - HOARDING_MILD → raise caps +15%, skip becomes rare.

STRATEGIC PRINCIPLES (apply all, weighted by situation)

1. BUDGET DISCIPLINE — spend it, but spend it well.
   - Budget is €1B. Target: under €5M remaining at match end.
   - Per-XI slot you can afford ~€90M on average (1B / 11). Strong players warrant well over that.
   - Early reserve: keep ~€40M per unfilled XI slot until you're 7-8 starters in, then start spending on bench.
   - As lotsRemaining shrinks, your bench appetite GROWS — if you're at full XI with €300M left and 10 lots to go, you must start buying bench depth at fair value, not skipping everything.
   - Surplus bench beyond ~15 players is wasteful. Aim for ~14–16 total players: 11 starters + 3–5 bench.

2. XI vs BENCH — both matter, different rules.
   - XI buys (when aiSquad.counts[category] < targets[category]): cap aggressively, pay up to +30–50% over value_eur for elites, fight skilled opponent hard. These are scoring slots.
   - BENCH buys (when aiSquad.counts[category] ≥ targets[category]): cap at or below value_eur. Look for players who (a) add same-club or same-country chemistry with your existing XI, (b) provide depth in a category where your starter is OVR 82-ish (not 88+), or (c) are clear bargains. Cap=0 only if there's no chemistry fit AND a clearly better cheap option upcoming.
   - DO NOT auto-skip every player once XI targets are hit. Re-read your aiSquad.bought list and look for chemistry-multiplier picks.

3. POSITION NEEDS — TRUST THE SERVER'S DEFICIT FIELDS.
   - The server precomputes aiSquad.xiStatus, aiSquad.unfilledXiSlots, aiSquad.xiComplete.
   - DO NOT recompute these in your head. Whatever those fields say is the ground truth.
   - Past failure mode: LLM claimed "MID at 3/3" while server reported MID 2/3, then skipped a needed starter. The xiStatus string ("MID: 2/3 — STILL NEED 1 STARTER") is now provided so this CANNOT happen — read it and obey it.
   - If unfilledXiSlots includes "DEF" twice and remainingByCategory.DEF is 3, you have ROOM but no margin to skip generously.
   - If unfilledXiSlots includes "DEF" twice and remainingByCategory.DEF is 2, every remaining DEF is MANDATORY. Cap aggressively.

3b. OPENING-PRICE FLOOR — HARD MATH RULE (NEW).
   - Every lot OPENS at value_eur. The minimum legal bid is value_eur + €1M.
   - A cap BELOW value_eur is functionally cap=0 — the executor cannot enter the bidding and the player is GUARANTEED unsold or yours-for-zero (depending on opposition).
   - GUARANTEED-UNCONTESTED CASE: if userBudgetLeft < value_eur + €1M, the user CANNOT legally bid on this lot. There is zero bidding-war risk. If the player is OVR 83+ and you have the budget, set cap ≥ value_eur (typically value_eur + €1M to value_eur + €5M) — you will win him at the opening price uncontested. Walking on this is leaving a free elite on the table. NEVER set cap < value_eur in this case.
   - Past mistake: LLM capped Kimmich (OVR 89, value €86M) at €75M while noting "user budget €4.5M" — cap below opening + user couldn't bid → AI walked → free OVR 89 lost, €174M sat unspent at full time. DO NOT REPEAT.
   - If userBudgetLeft IS competitive, ignore this rule — use the normal OVR/need/lookahead logic.

3c. SPEND PRESSURE — kill the budget-hoarding instinct.
   - The server provides spendPressure.verdict + spendPressure.hoardingExcess.
   - Match-end target: AI should finish with ≤ €5M unspent. Money in the bank at full time is wasted potential and a strategic failure.
   - If spendPressure.verdict == "HOARDING_SEVERE" (≥ €200M ahead of pacing): you are catastrophically under-spending. RAISE ALL CAPS in this call by +30% above what you'd normally set. Aggressively buy bench upgrades you'd otherwise skip. Match the user on close fights.
   - If spendPressure.verdict == "HOARDING_MILD" (≥ €80M ahead): raise caps by +15%. Cap=0 should be rare — convert most skips to small bench bids near value_eur.
   - If spendPressure.verdict == "ON_PACE": normal logic applies.
   - If spendPressure.verdict == "OVER_PACE" (more than €50M behind pacing): tighten up, prioritize XI completion only, skip bench buys.
   - Past failure: AI finished match #4 with €174M unspent (verdict was HOARDING_MILD at lot 24 and the LLM didn't raise caps; ended HOARDING_SEVERE at lot 32 and skipped a free Kimmich). Use this signal.

4. VALUE BASELINE — but NEVER anchor only on value_eur.
   - value_eur is the OPENING PRICE for the lot. You can't win below it.
   - value_eur is a FLAWED proxy for true worth (aging legends like Messi have a tiny value_eur but are still elite — a skilled user will pay €50M+ for Messi even though his value_eur is €22M). Weight OVR heavily, NOT just value_eur.
   - Cap should reflect OVR × position-need × opponent-fight-likelihood. For elites with low value_eur but high OVR, set caps well above value_eur (e.g. Messi OVR 86, value €22M → cap €60–80M if you need ATT).

5. ELITE PREMIUM.
   - OVR ≥ 90: pay up. €130–180M is fine for a generational player you need. Don't be precious. Even your "final increment" should still be a real bid; a skilled opponent will exploit a cap that's exactly equal to value_eur.
   - OVR 87–89: strong, pay 20–50% above value_eur if the slot is open.
   - OVR 83–86: solid starters at fair value_eur-adjacent caps.
   - OVR 78–82: depth — modest caps if it's a chemistry fit, skip if not.

6. ANTI-SNIPE AWARENESS.
   - When the lot is close to expiry, a bid in the last 5s extends the timer by 7s. Both you AND the opponent can use this.
   - Build a buffer into your cap so the AI bid-loop can pay one or two increments above its computed cap when the user is sniping. Example: if you'd be willing to pay up to €78M for a player, set cap=€80M, not €78M — the executor needs room to outbid the user's last raise.

7. LOOKAHEAD.
   - upcomingContext shows the NEXT player after the ones you're capping. If a stronger same-position player is imminent, restrain the current cap.
   - BUT — the lookahead might be one the user grabs first. Don't skip a solid 85 OVR DEF assuming the OVR 87 DEF in lookahead is yours. Trade some lookahead saving for the bird in hand.

8. READ THE USER.
   - userActivity.averagePrice high vs userBudgetLeft low → user is bleeding budget. Sit tight, scoop bargains.
   - userActivity.averagePrice low and userBudgetLeft high → user is hoarding for elites. Beat them to elites OR concede minor lots to keep your own powder dry.
   - highestSinglePrice tells you the user's pain threshold. A skilled opponent's threshold is closer to value_eur + premium.
   - If the user just won a player at price >> value_eur, they probably have a strategy and you should re-evaluate your own caps in same category accordingly.

9. CHEMISTRY (light hint for now).
   - If your existing squad has many same-club or same-country links, a fresh player sharing those links is worth a 5–15% bump in cap. Mention it briefly in reason.

10. SKIP IS A REAL CHOICE — but BE CONSISTENT.
    - Setting cap=0 is correct when: saturated position with no chemistry fit, AND upcoming player is clearly better AND in same position.
    - Setting cap BELOW value_eur is equivalent to skipping (the executor can't enter the bidding).
    - DO NOT contradict yourself: if your reason says "skip", cap MUST be 0. If you cap at €25M, your reason must justify why €25M is worth paying. Inconsistent reason/cap pairs are wasteful and confusing.

REASON FIELD
A short string (1–2 sentences). Examples:
  "Elite ST, empty slot, skilled opp will fight — pay premium."
  "ATT saturated; surplus is bench. Skip."
  "Solid CB at fair value, fills DEF slot."
  "Skip — Mbappé in lookahead, save budget."

You will receive your full snapshot in the user message as JSON. Reply with the plan only.`;

// ─────────────────────────── public API ───────────────────────────

export function isLlmConfigured(): boolean {
  return client !== null;
}

// ─────────────────────────── pricing (DeepSeek deepseek-v4-flash, USD per 1M tokens) ───────────────────────────
// `deepseek-chat` resolves to deepseek-v4-flash. Source: official pricing page (2026).
export const DEEPSEEK_PRICE = {
  inputCacheMissPer1M: 0.14,
  inputCacheHitPer1M: 0.0028,
  outputPer1M: 0.28,
} as const;

export type LlmUsage = {
  promptTokens: number;
  cachedPromptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  latencyMs: number;
};

export type PlanCapsResult = {
  caps: Map<number, number>;
  usage: LlmUsage;
};

export function costForUsage(
  promptTokens: number,
  cachedPromptTokens: number,
  completionTokens: number
): number {
  const cacheMiss = Math.max(0, promptTokens - cachedPromptTokens);
  return (
    (cacheMiss * DEEPSEEK_PRICE.inputCacheMissPer1M) / 1_000_000 +
    (cachedPromptTokens * DEEPSEEK_PRICE.inputCacheHitPer1M) / 1_000_000 +
    (completionTokens * DEEPSEEK_PRICE.outputPer1M) / 1_000_000
  );
}

export async function planCaps(
  req: LlmCapRequest
): Promise<PlanCapsResult> {
  if (!client) {
    throw new Error("AI_KEY not configured");
  }
  const userPrompt =
    "Plan caps for these players (toPlan[]). Return JSON only.\n\n" +
    JSON.stringify(req, null, 2);

  const namesList = req.toPlan
    .map((p) => `${p.name}(${p.category}/${p.overall})`)
    .join(", ");
  console.log(
    `[LLM:request] id=${req.matchId} model=${MODEL} planning ${req.toPlan.length} ` +
      `player(s): ${namesList} (with ${req.upcomingContext.length} lookahead)`
  );

  const t0 = Date.now();
  let content = "";
  let totalTokensVar: number = 0;
  void totalTokensVar;

  // Timeout guard
  const completion = await Promise.race([
    client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 800,
      response_format: { type: "json_object" },
    }),
    new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error(`LLM timeout after ${LLM_TIMEOUT_MS}ms`)), LLM_TIMEOUT_MS)
    ),
  ]);

  const ms = Date.now() - t0;
  content = completion.choices[0]?.message?.content ?? "";
  const usage = completion.usage;
  const promptTokens = usage?.prompt_tokens ?? 0;
  const completionTokens = usage?.completion_tokens ?? 0;
  // DeepSeek-specific cache hit field; OpenAI SDK exposes it on prompt_tokens_details.cached_tokens
  // or directly as prompt_cache_hit_tokens depending on response shape.
  const usageAny = usage as unknown as {
    prompt_cache_hit_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  } | undefined;
  const cachedPromptTokens =
    usageAny?.prompt_cache_hit_tokens ??
    usageAny?.prompt_tokens_details?.cached_tokens ??
    0;
  const totalTokens = usage?.total_tokens ?? promptTokens + completionTokens;
  const costUsd = costForUsage(promptTokens, cachedPromptTokens, completionTokens);
  totalTokensVar = totalTokens;

  console.log(
    `[LLM:response] id=${req.matchId} ${ms}ms ` +
      `tokens=${totalTokens} (prompt=${promptTokens} cached=${cachedPromptTokens} completion=${completionTokens}) ` +
      `cost=$${costUsd.toFixed(6)} ` +
      `content=${content.substring(0, 300).replace(/\s+/g, " ")}${content.length > 300 ? "…" : ""}`
  );

  let parsed: { plan?: unknown };
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(
      `LLM returned invalid JSON: ${content.substring(0, 200)}`
    );
  }
  if (!parsed.plan || !Array.isArray(parsed.plan)) {
    throw new Error("LLM response missing 'plan' array");
  }

  const caps = validatePlan(parsed.plan, req);
  return {
    caps,
    usage: {
      promptTokens,
      cachedPromptTokens,
      completionTokens,
      totalTokens,
      costUsd,
      latencyMs: ms,
    },
  };
}

// ─────────────────────────── validation ───────────────────────────

function validatePlan(
  plan: unknown[],
  req: LlmCapRequest
): Map<number, number> {
  const out = new Map<number, number>();
  const maxAllowed = Math.floor(req.aiBudgetLeft * HEURISTIC_CAP_BUDGET_FRACTION);

  for (let i = 0; i < req.toPlan.length; i++) {
    const expected = req.toPlan[i];
    const entry = plan[i] as
      | {
          player_id?: unknown;
          cap?: unknown;
          reason?: unknown;
          xi_status_quote?: unknown;
          value_eur_seen?: unknown;
        }
      | undefined;

    if (!entry || typeof entry !== "object") {
      console.log(
        `[LLM:validate] id=${req.matchId} idx=${i} ${expected.name}: MISSING entry → heuristic fallback`
      );
      continue;
    }

    if (entry.player_id !== expected.id) {
      console.log(
        `[LLM:validate] id=${req.matchId} idx=${i} ${expected.name}: ` +
          `player_id mismatch (got ${entry.player_id}, expected ${expected.id}) → heuristic fallback`
      );
      continue;
    }

    const rawCap = entry.cap;
    if (
      typeof rawCap !== "number" ||
      !Number.isFinite(rawCap) ||
      rawCap < 0 ||
      !Number.isInteger(rawCap)
    ) {
      console.log(
        `[LLM:validate] id=${req.matchId} idx=${i} ${expected.name}: ` +
          `invalid cap (${rawCap}) → heuristic fallback`
      );
      continue;
    }

    // xi_status_quote check — soft (warn only, don't discard yet)
    const expectedQuote = req.aiSquad.xiStatus[expected.category];
    const gotQuote = typeof entry.xi_status_quote === "string" ? entry.xi_status_quote : "";
    const quoteOk = gotQuote.trim() === expectedQuote.trim();
    if (!quoteOk) {
      console.log(
        `[LLM:validate] id=${req.matchId} idx=${i} ${expected.name}: ` +
          `xi_status_quote MISMATCH — expected="${expectedQuote}" got="${gotQuote}"`
      );
    }

    // value_eur_seen check — soft (warn only)
    const valueSeen = entry.value_eur_seen;
    const valueOk = typeof valueSeen === "number" && valueSeen === expected.value_eur;
    if (!valueOk) {
      console.log(
        `[LLM:validate] id=${req.matchId} idx=${i} ${expected.name}: ` +
          `value_eur_seen MISMATCH — expected=${expected.value_eur} got=${valueSeen}`
      );
    }

    // HARD floor: if player's category is an unfilled XI slot, cap must allow entry.
    // A cap ≤ value_eur means the executor cannot enter the bidding → guaranteed walk → empty XI slot.
    let cap = rawCap;
    let floorNote = "";
    const isXiDeficit = req.aiSquad.unfilledXiSlots.includes(expected.category);
    if (isXiDeficit && cap > 0 && cap <= expected.value_eur) {
      const floor = expected.value_eur + 5_000_000; // +€5M cushion to win uncontested
      console.log(
        `[LLM:validate] id=${req.matchId} idx=${i} ${expected.name}: ` +
          `cap €${cap.toLocaleString("en-US")} ≤ value_eur €${expected.value_eur.toLocaleString("en-US")} on XI-deficit ${expected.category} — ` +
          `RAISING to €${floor.toLocaleString("en-US")} (server floor enforcement)`
      );
      cap = floor;
      floorNote = " [SERVER-FLOORED]";
    }

    // FIX 1 — Spend-pressure cap multiplier.
    // When AI is HOARDING_SEVERE (≥ €200M ahead of pacing) AND the lot is in an XI-deficit
    // category AND late in the queue (lotsRemaining < 10), the LLM's caps are demonstrably
    // too conservative. Multiply by 1.5× to force engagement.
    if (
      req.spendPressure.verdict === "HOARDING_SEVERE" &&
      isXiDeficit &&
      req.lotsRemaining < 10 &&
      cap > 0
    ) {
      const boosted = Math.floor(cap * 1.5);
      console.log(
        `[LLM:validate] id=${req.matchId} idx=${i} ${expected.name}: ` +
          `HOARDING_SEVERE + late-queue + XI-deficit ${expected.category} — ` +
          `boosting cap €${cap.toLocaleString("en-US")} → €${boosted.toLocaleString("en-US")} (×1.5)`
      );
      cap = boosted;
      floorNote += " [SEVERE-BOOST]";
    }

    // FIX 2 — Mandatory "must-buy" floor.
    // If this is the ONLY remaining player at a position the AI needs (i.e. count of this
    // category in unfilledXiSlots equals the number of same-category lots remaining in the
    // queue), the cap MUST be at least 1.5× value_eur. There is no "save for upcoming" —
    // there is no upcoming. Skipping = guaranteed empty XI slot.
    const sameCatDeficit = req.aiSquad.unfilledXiSlots.filter((c) => c === expected.category).length;
    const sameCatRemaining = req.remainingByCategory[expected.category];
    const mustBuy = sameCatDeficit > 0 && sameCatDeficit >= sameCatRemaining;
    if (mustBuy) {
      const mandatoryFloor = Math.max(cap, Math.floor(expected.value_eur * 1.5));
      if (mandatoryFloor > cap) {
        console.log(
          `[LLM:validate] id=${req.matchId} idx=${i} ${expected.name}: ` +
            `MUST-BUY (${expected.category} deficit=${sameCatDeficit}, remaining=${sameCatRemaining}) — ` +
            `cap €${cap.toLocaleString("en-US")} → €${mandatoryFloor.toLocaleString("en-US")} (1.5× value_eur)`
        );
        cap = mandatoryFloor;
        floorNote += " [MUST-BUY]";
      }
    }

    const clamped = Math.min(cap, maxAllowed);
    out.set(expected.id, clamped);
    const reason =
      typeof entry.reason === "string" ? entry.reason : "<no reason>";
    const skipNote = clamped === 0 ? " [SKIP]" : "";
    const clampNote =
      clamped !== cap
        ? ` (clamped from €${cap.toLocaleString("en-US")} → cap is 80% of €${req.aiBudgetLeft.toLocaleString("en-US")})`
        : "";
    const validationFlags =
      (quoteOk ? "" : " [Q✗]") + (valueOk ? "" : " [V✗]") + floorNote;
    console.log(
      `[LLM:plan]   id=${req.matchId} ${expected.name} (OVR ${expected.overall} ${expected.category}) ` +
        `cap=€${clamped.toLocaleString("en-US")}${skipNote}${clampNote}${validationFlags} reason="${reason}"`
    );
  }

  return out;
}
