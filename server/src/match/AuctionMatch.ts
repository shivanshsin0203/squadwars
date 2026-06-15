/**
 * AuctionMatch — one instance per match, holds all server-side state.
 *
 * DO-emulation rules (so the migration to Cloudflare Durable Objects later is
 * a wrapper change, not a rewrite):
 *   1. One instance per matchId. Same get(id) always returns the same object.
 *   2. All mutation goes through METHODS. Routes never touch fields.
 *   3. Every mutating method ends with persist() (no-op today, DO storage later).
 *   4. Internal types (LotState.cap, AiPlanState.dueAt) are SECRETS — never
 *      returned to the client. Always use toClientDTO().
 *   5. Each method is logged with [MATCH:methodName] + matchId so you can grep.
 */

import { nanoid } from "nanoid";
import type {
  AiPlanDTO,
  AiPlanState,
  BoughtPlayer,
  LotState,
  LotStateDTO,
  MatchStateDTO,
  MatchStatus,
  Player,
  ResultPayload,
  Side,
  Squad,
  SquadBenchEntry,
  SquadXIEntry,
  Verdict,
} from "../types.js";
import {
  ANTI_SNIPE_MS,
  ANTI_SNIPE_TRIGGER_MS,
  AI_DELAY_MAX_MS,
  AI_DELAY_MIN_MS,
  AI_DELAY_SAFETY_MS,
  BENCH_MINIMUM,
  BENCH_TARGET,
  DEFAULT_DIFFICULTY,
  getDifficultySpec,
  LOT_DURATION_MS,
  LOT_END_TOLERANCE_MS,
  MIN_INCREMENT,
  getFormationTargets,
  getQueueTotal,
  STARTING_BUDGET,
  type Difficulty,
} from "../config.js";
import { buildQueue } from "./playerPool.js";
import { computeAiBidAmount, computeHeuristicCap } from "./ai.js";
import {
  isLlmConfigured,
  planCaps,
  type LlmCapRequest,
  type UpcomingPlayerCtx,
} from "../llm/deepseek.js";
import {
  planAiSquad,
  writeVerdictProse,
} from "../llm/squadBuilder.js";
import { computeVerdict } from "./verdict.js";
import { getSlots } from "./squadFormations.js";

export type AuctionMatchCtor = {
  matchId: string;
  formation: string;
  difficulty?: Difficulty;
};

export type BidResult =
  | { ok: true; lot: LotStateDTO }
  | { ok: false; reason: string };

export type AiFireResult =
  | { ok: true; aiBid: number | null; lot: LotStateDTO } // aiBid=null means walked
  | { ok: false; reason: string };

export type LotEndResult =
  | { ok: true; winner: Side | null; price: number; reconShotFired: boolean; matchComplete: boolean }
  | { ok: false; reason: string };

export class AuctionMatch {
  // ─────── identity ───────
  readonly matchId: string;
  readonly formation: string;
  readonly difficulty: Difficulty;
  readonly createdAt: number;

  // ─────── top-level lifecycle ───────
  status: MatchStatus = "in_progress";

  // ─────── budgets & buys ───────
  userBudget: number = STARTING_BUDGET;
  aiBudget: number = STARTING_BUDGET;
  userBought: BoughtPlayer[] = [];
  aiBought: BoughtPlayer[] = [];

  // ─────── queue ───────
  readonly queue: Player[];
  lotIndex: number = 0;

  // ─────── AI cap planning ───────
  forwardPlan: Map<number, number> = new Map(); // playerId -> cap (LLM-driven later)
  llmInFlight: boolean = false;
  llmLastSuccessAt: number | null = null;

  // ─────── LLM usage / cost accumulators (this match's lifetime) ───────
  llmCallCount: number = 0;
  llmCallsFailed: number = 0;
  llmPromptTokens: number = 0;
  llmCachedPromptTokens: number = 0;
  llmCompletionTokens: number = 0;
  llmTotalTokens: number = 0;
  llmTotalCostUsd: number = 0;
  llmTotalLatencyMs: number = 0;

  // ─────── current lot (null between lots and before lot 1 opens) ───────
  lotState: LotState | null = null;

  // ─────── result phase ───────
  /** AI's chosen XI + bench — populated by background LLM call after match completes. */
  aiSquadPlan: Squad | null = null;
  /** In-flight promise so submitUserResult can await if the user clicks RESULT
   *  before the background plan returns. Resolves to the Squad (or fallback). */
  private aiSquadPlanPromise: Promise<Squad> | null = null;
  /** User's frozen XI submitted via /result. Set exactly once on the transition
   *  to status="result"; never mutated afterwards. */
  userResultXI: Squad | null = null;
  /** Final verdict (categories, score, prose). Set exactly once on transition. */
  verdict: Verdict | null = null;

  constructor(opts: AuctionMatchCtor) {
    this.matchId = opts.matchId;
    this.formation = opts.formation;
    this.difficulty = opts.difficulty ?? DEFAULT_DIFFICULTY;
    this.createdAt = Date.now();
    this.queue = buildQueue(opts.formation);

    const expectedLen = getQueueTotal(opts.formation);
    if (this.queue.length !== expectedLen) {
      throw new Error(
        `AuctionMatch.ctor: expected queue length ${expectedLen} for formation ${opts.formation}, got ${this.queue.length}`
      );
    }

    const diffSpec = getDifficultySpec(this.difficulty);
    console.log(
      `[MATCH:create] id=${this.matchId} formation=${this.formation} ` +
        `difficulty=${this.difficulty} persona="${diffSpec.personaName}" ` +
        `lookahead=${diffSpec.lookaheadDepth} ` +
        `status=${this.status} queueLen=${this.queue.length} ` +
        `userBudget=${this.userBudget.toLocaleString()} ` +
        `aiBudget=${this.aiBudget.toLocaleString()}`
    );
    const breakdown = (["GK", "DEF", "MID", "ATT"] as const)
      .map((c) => `${c}:${this.queue.filter((p) => p.category === c).length}`)
      .join(" ");
    console.log(`[MATCH:create] id=${this.matchId} queue-breakdown ${breakdown}`);
    const first5 = this.queue
      .slice(0, 5)
      .map((p) => `${p.category}/${p.name}(${p.overall})`)
      .join(", ");
    console.log(`[MATCH:create] id=${this.matchId} queue-first-5 ${first5}`);

    this.persist();
  }

  // ─────────────────────────── public API ───────────────────────────

  /**
   * Open the next lot. Snapshots the AI cap (LLM or heuristic), sets the timer,
   * schedules the first AI plan. Idempotent: calling on a complete match is a no-op.
   */
  startLot(): LotStateDTO | null {
    if (this.status === "complete") {
      console.log(`[MATCH:startLot] id=${this.matchId} match-already-complete`);
      return null;
    }
    if (this.lotState) {
      console.log(
        `[MATCH:startLot] id=${this.matchId} lot ${this.lotIndex} already open — ignoring`
      );
      return this.toClientLotDTO(this.lotState);
    }
    if (this.lotIndex >= this.queue.length) {
      this.status = "complete";
      console.log(`[MATCH:startLot] id=${this.matchId} queue-exhausted → COMPLETE`);
      this.persist();
      return null;
    }

    const player = this.queue[this.lotIndex];
    const cap = this.resolveCapFor(player);
    const startedAt = Date.now();
    const expiresAt = startedAt + LOT_DURATION_MS;
    // Opening price = market value (player.value_eur). highBidder stays null until
    // someone actually beats this floor. To take the lead, a bidder must post at
    // least openingPrice + MIN_INCREMENT (or MIN_INCREMENT if value_eur is 0).
    const openingPrice = Math.max(0, Math.floor(player.value_eur));

    this.lotState = {
      lotIndex: this.lotIndex,
      player,
      startedAt,
      expiresAt,
      cap,
      currentBid: openingPrice,
      highBidder: null,
      bidLog: [],
      pendingAiPlan: null,
    };

    console.log(
      `[MATCH:startLot] id=${this.matchId} lot=${this.lotIndex} ` +
        `player="${player.name}" (${player.category}/${player.primary_position} OVR ${player.overall}) ` +
        `marketValue=€${player.value_eur.toLocaleString()} openingPrice=€${openingPrice.toLocaleString()} ` +
        `cap=€${cap.toLocaleString()} [SERVER-SECRET] ` +
        `expiresAt=${expiresAt} duration=${LOT_DURATION_MS}ms`
    );

    this.scheduleAiBid();
    this.persist();
    return this.toClientLotDTO(this.lotState);
  }

  /**
   * Place a user bid. Validates, appends to bidLog, extends timer if late,
   * cancels any pending AI plan and schedules a new one.
   */
  userBid(amount: number): BidResult {
    if (!this.lotState) {
      return { ok: false, reason: "no active lot" };
    }
    const lot = this.lotState;
    const check = this.checkValidBid("user", amount);
    if (!check.valid) {
      console.log(
        `[MATCH:userBid] id=${this.matchId} lot=${lot.lotIndex} REJECTED ` +
          `amount=€${amount.toLocaleString()} reason="${check.reason}"`
      );
      return { ok: false, reason: check.reason };
    }

    const now = Date.now();
    lot.bidLog.push({ t: now, by: "user", amount });
    lot.currentBid = amount;
    lot.highBidder = "user";
    const extended = this.extendTimerIfLate(now);

    if (lot.pendingAiPlan && lot.pendingAiPlan.status === "pending") {
      console.log(
        `[MATCH:userBid] id=${this.matchId} cancelling pending AI plan=${lot.pendingAiPlan.planId}`
      );
      lot.pendingAiPlan.status = "cancelled";
      lot.pendingAiPlan = null;
    }
    this.scheduleAiBid();

    console.log(
      `[MATCH:userBid] id=${this.matchId} lot=${lot.lotIndex} ACCEPTED ` +
        `amount=€${amount.toLocaleString()} currentBid=€${lot.currentBid.toLocaleString()} ` +
        `highBidder=user timerExtended=${extended} expiresAt=${lot.expiresAt} ` +
        `nextAiPlan=${lot.pendingAiPlan?.planId ?? "none"}`
    );

    this.persist();
    return { ok: true, lot: this.toClientLotDTO(lot) };
  }

  /**
   * Frontend's setTimeout fired — server decides what (if anything) the AI bids
   * NOW against current state. Recomputes the bid amount at fire-time; never
   * trusts a "what the AI was planning" value from the client.
   */
  aiFire(planId: string): AiFireResult {
    if (!this.lotState) return { ok: false, reason: "no active lot" };
    const lot = this.lotState;
    const plan = lot.pendingAiPlan;

    if (!plan || plan.planId !== planId) {
      console.log(
        `[MATCH:aiFire] id=${this.matchId} STALE-PLAN incomingPlanId=${planId} ` +
          `currentPlanId=${plan?.planId ?? "none"}`
      );
      return { ok: false, reason: "stale planId" };
    }
    if (plan.status !== "pending") {
      console.log(
        `[MATCH:aiFire] id=${this.matchId} planId=${planId} status=${plan.status} — ignoring`
      );
      return { ok: false, reason: `plan ${plan.status}` };
    }

    const amount = computeAiBidAmount({
      currentBid: lot.currentBid,
      cap: lot.cap,
    });

    if (amount === null) {
      plan.status = "cancelled";
      lot.pendingAiPlan = null;
      console.log(
        `[MATCH:aiFire] id=${this.matchId} lot=${lot.lotIndex} planId=${planId} ` +
          `decision=WALK cap=€${lot.cap.toLocaleString()} ` +
          `currentBid=€${lot.currentBid.toLocaleString()}`
      );
      this.persist();
      return { ok: true, aiBid: null, lot: this.toClientLotDTO(lot) };
    }

    const check = this.checkValidBid("ai", amount);
    if (!check.valid) {
      plan.status = "cancelled";
      lot.pendingAiPlan = null;
      console.log(
        `[MATCH:aiFire] id=${this.matchId} INVALID amount=€${amount.toLocaleString()} reason="${check.reason}"`
      );
      this.persist();
      return { ok: false, reason: check.reason };
    }

    const now = Date.now();
    lot.bidLog.push({ t: now, by: "ai", amount });
    lot.currentBid = amount;
    lot.highBidder = "ai";
    plan.status = "fired";
    lot.pendingAiPlan = null;
    const extended = this.extendTimerIfLate(now);
    // No new AI plan scheduled — AI is now winning. New plan only on user bid.

    console.log(
      `[MATCH:aiFire] id=${this.matchId} lot=${lot.lotIndex} planId=${planId} ` +
        `decision=BID amount=€${amount.toLocaleString()} ` +
        `currentBid=€${lot.currentBid.toLocaleString()} highBidder=ai ` +
        `cap=€${lot.cap.toLocaleString()} timerExtended=${extended} expiresAt=${lot.expiresAt}`
    );

    this.persist();
    return { ok: true, aiBid: amount, lot: this.toClientLotDTO(lot) };
  }

  /**
   * Frontend timer hit 0 — server runs reconciliation shot, resolves winner,
   * advances lotIndex, opens next lot OR marks the match complete.
   *
   * Reconciliation shot: if cap > currentBid AND highBidder !== "ai" (i.e. user
   * blocked /ai-fire or just nobody bid), AI takes one last guaranteed bid at
   * the close. This is the cheat defense.
   */
  endLot(): LotEndResult {
    if (!this.lotState) {
      return { ok: false, reason: "no active lot" };
    }
    const lot = this.lotState;
    const now = Date.now();

    if (now < lot.expiresAt - LOT_END_TOLERANCE_MS) {
      const earlyBy = lot.expiresAt - now;
      console.log(
        `[MATCH:endLot] id=${this.matchId} lot=${lot.lotIndex} REJECTED-TOO-EARLY earlyBy=${earlyBy}ms`
      );
      return { ok: false, reason: `too early by ${earlyBy}ms` };
    }

    // Reconciliation shot
    let reconShotFired = false;
    if (lot.highBidder !== "ai") {
      const reconAmount = computeAiBidAmount({
        currentBid: lot.currentBid,
        cap: lot.cap,
      });
      if (reconAmount !== null) {
        const check = this.checkValidBid("ai", reconAmount);
        if (check.valid) {
          lot.bidLog.push({ t: lot.expiresAt - 1, by: "ai", amount: reconAmount });
          lot.currentBid = reconAmount;
          lot.highBidder = "ai";
          reconShotFired = true;
          console.log(
            `[MATCH:endLot] id=${this.matchId} lot=${lot.lotIndex} RECON-SHOT-FIRED ` +
              `amount=€${reconAmount.toLocaleString()} cap=€${lot.cap.toLocaleString()}`
          );
        }
      }
    }

    // Resolve winner
    const winner = lot.highBidder;
    const price = lot.currentBid;
    if (winner === "user") {
      this.userBudget -= price;
      this.userBought.push({ lotIndex: lot.lotIndex, player: lot.player, price });
    } else if (winner === "ai") {
      this.aiBudget -= price;
      this.aiBought.push({ lotIndex: lot.lotIndex, player: lot.player, price });
    }

    console.log(
      `[MATCH:endLot] id=${this.matchId} lot=${lot.lotIndex} RESOLVED ` +
        `winner=${winner ?? "UNSOLD"} price=€${price.toLocaleString()} ` +
        `reconShot=${reconShotFired} ` +
        `userBudgetAfter=€${this.userBudget.toLocaleString()} ` +
        `aiBudgetAfter=€${this.aiBudget.toLocaleString()} ` +
        `userBought=${this.userBought.length} aiBought=${this.aiBought.length}`
    );

    // Advance
    this.lotIndex++;
    this.lotState = null;

    let matchComplete = false;
    if (this.lotIndex >= this.queue.length) {
      this.status = "complete";
      matchComplete = true;
      console.log(
        `[MATCH:endLot] id=${this.matchId} MATCH-COMPLETE lotsDone=${this.lotIndex}/${this.queue.length}`
      );
      // Fire-and-forget AI squad pick. User builds their XI while this runs in
      // the background; submitUserResult awaits this promise if it's still hot.
      this.kickoffAiSquadPlanning();
    } else {
      this.startLot(); // chain to next lot
      // Fire-and-forget LLM refresh for the next 2 lots beyond the one we just opened.
      this.kickoffAsyncCapPlanning();
    }

    this.persist();
    return { ok: true, winner, price, reconShotFired, matchComplete };
  }

  /**
   * Snapshot for the client. Strips: queue, cap, AI plan due timestamp, AI bought
   * players' identities (only the count). Converts `dueAt` to relative `delayMs`.
   *
   * When status === "result", the `result` field reveals both finalised squads
   * + AI's full bought list. Outside of result, `result` is null and the AI's
   * identity stays hidden per spec §4.
   */
  toClientDTO(): MatchStateDTO {
    return {
      matchId: this.matchId,
      formation: this.formation,
      difficulty: this.difficulty,
      status: this.status,
      user: {
        budget: this.userBudget,
        bought: this.userBought,
      },
      ai: {
        budget: this.aiBudget,
        boughtCount: this.aiBought.length,
      },
      lotsTotal: this.queue.length,
      lotsDone: this.lotIndex, // = lots already resolved
      lotState: this.lotState ? this.toClientLotDTO(this.lotState) : null,
      result: this.buildResultPayload(),
    };
  }

  private buildResultPayload(): ResultPayload | null {
    if (this.status !== "result") return null;
    if (!this.userResultXI || !this.aiSquadPlan || !this.verdict) return null;
    const userTotalSpent = this.userBought.reduce((a, b) => a + b.price, 0);
    const aiTotalSpent = this.aiBought.reduce((a, b) => a + b.price, 0);
    return {
      userSquad: this.userResultXI,
      aiSquad: this.aiSquadPlan,
      aiBought: this.aiBought,
      userTotalSpent,
      aiTotalSpent,
      verdict: this.verdict,
    };
  }

  // ─────────────────────────── internals ───────────────────────────

  private resolveCapFor(player: Player): number {
    const llmCap = this.forwardPlan.get(player.id);
    if (llmCap !== undefined) {
      const clamp = Math.floor(this.aiBudget * 0.8);
      return Math.min(llmCap, clamp);
    }
    return computeHeuristicCap(player, this.aiBudget);
  }

  private scheduleAiBid(): void {
    if (!this.lotState) return;
    const lot = this.lotState;
    const now = Date.now();
    const remaining = lot.expiresAt - now;

    // Not enough headroom for a safe AI fire — leave it to lot-end reconciliation.
    if (remaining <= AI_DELAY_SAFETY_MS) {
      lot.pendingAiPlan = null;
      console.log(
        `[MATCH:scheduleAiBid] id=${this.matchId} lot=${lot.lotIndex} ` +
          `SKIPPED remaining=${remaining}ms ≤ safety=${AI_DELAY_SAFETY_MS}ms ` +
          `(reconciliation will cover)`
      );
      return;
    }

    // If AI cap can't reach next bid, don't bother scheduling.
    const wouldBid = computeAiBidAmount({
      currentBid: lot.currentBid,
      cap: lot.cap,
    });
    if (wouldBid === null) {
      lot.pendingAiPlan = null;
      console.log(
        `[MATCH:scheduleAiBid] id=${this.matchId} lot=${lot.lotIndex} ` +
          `AI-WOULD-WALK cap=€${lot.cap.toLocaleString()} currentBid=€${lot.currentBid.toLocaleString()}`
      );
      return;
    }

    const range = AI_DELAY_MAX_MS - AI_DELAY_MIN_MS;
    const rawDelay = AI_DELAY_MIN_MS + Math.floor(Math.random() * range);
    const maxAllowed = remaining - AI_DELAY_SAFETY_MS;
    const delayMs = Math.min(rawDelay, maxAllowed);
    const planId = nanoid(8);
    const dueAt = now + delayMs;

    lot.pendingAiPlan = { planId, dueAt, status: "pending" };
    console.log(
      `[MATCH:scheduleAiBid] id=${this.matchId} lot=${lot.lotIndex} ` +
        `planId=${planId} delayMs=${delayMs} dueAt=${dueAt} ` +
        `(remaining=${remaining}ms, rawDelay=${rawDelay}ms, capped=${rawDelay !== delayMs})`
    );
  }

  /** Anti-snipe: if a bid lands within last ANTI_SNIPE_MS of expiry, extend by it. */
  private extendTimerIfLate(now: number): boolean {
    if (!this.lotState) return false;
    const lot = this.lotState;
    const remaining = lot.expiresAt - now;
    if (remaining < ANTI_SNIPE_TRIGGER_MS) {
      lot.expiresAt += ANTI_SNIPE_MS;
      return true;
    }
    return false;
  }

  private checkValidBid(
    side: Side,
    amount: number
  ): { valid: true } | { valid: false; reason: string } {
    if (!this.lotState) return { valid: false, reason: "no active lot" };
    const lot = this.lotState;
    if (!Number.isFinite(amount) || amount <= 0) {
      return { valid: false, reason: `amount €${amount} must be > 0` };
    }
    const minRequired = Math.max(lot.currentBid + MIN_INCREMENT, MIN_INCREMENT);
    if (amount < minRequired) {
      return {
        valid: false,
        reason: `amount €${amount.toLocaleString()} < required min €${minRequired.toLocaleString()}`,
      };
    }
    const budget = side === "user" ? this.userBudget : this.aiBudget;
    if (amount > budget) {
      return {
        valid: false,
        reason: `${side} budget €${budget.toLocaleString()} < bid €${amount.toLocaleString()}`,
      };
    }
    return { valid: true };
  }

  private toClientLotDTO(lot: LotState): LotStateDTO {
    let aiPlan: AiPlanDTO | null = null;
    if (lot.pendingAiPlan && lot.pendingAiPlan.status === "pending") {
      const remaining = Math.max(0, lot.pendingAiPlan.dueAt - Date.now());
      aiPlan = { planId: lot.pendingAiPlan.planId, delayMs: remaining };
    }
    return {
      lotIndex: lot.lotIndex,
      player: lot.player,
      currentBid: lot.currentBid,
      highBidder: lot.highBidder,
      expiresAt: lot.expiresAt,
      bidLog: lot.bidLog,
      aiPlan,
    };
  }

  // ─────────────────────────── LLM cap planning ───────────────────────────

  /**
   * SYNC: called once at match creation, before lot 1 opens. Blocks the
   * create endpoint until DeepSeek returns (or LLM_TIMEOUT_MS fires). If
   * the call fails, the heuristic fallback covers — match is never blocked
   * by an LLM outage.
   */
  async seedForwardPlan(): Promise<void> {
    if (!isLlmConfigured()) {
      console.log(
        `[MATCH:llm] id=${this.matchId} seedForwardPlan SKIPPED — LLM not configured (heuristic only)`
      );
      return;
    }
    console.log(
      `[MATCH:llm] id=${this.matchId} SEED (sync, blocking) — planning lots ${this.lotIndex}..${Math.min(this.lotIndex + 1, this.queue.length - 1)}`
    );
    await this.runCapPlanning();
  }

  /**
   * ASYNC: called after each endLot advances. Fire-and-forget; the bid loop
   * never waits on it. If the call lands before its target lot opens, great;
   * if not, that lot uses the heuristic.
   */
  private kickoffAsyncCapPlanning(): void {
    if (!isLlmConfigured()) return;
    console.log(
      `[MATCH:llm] id=${this.matchId} ASYNC kickoff after lot transition (lotIndex=${this.lotIndex})`
    );
    void this.runCapPlanning().catch((err) => {
      console.log(
        `[MATCH:llm] id=${this.matchId} async run CRASHED: ${(err as Error).message}`
      );
    });
  }

  /**
   * Shared planning runner. Plans the NEXT 2 upcoming lots (relative to
   * lotIndex/lotState), with 1 extra lookahead lot provided as context.
   */
  private async runCapPlanning(): Promise<void> {
    if (this.llmInFlight) {
      console.log(`[MATCH:llm] id=${this.matchId} already in-flight, skipping`);
      return;
    }
    // If there's an open lot, plan starts AFTER it (the current lot's cap is frozen).
    // If no open lot, plan starts at the current lotIndex.
    const startIdx = this.lotState ? this.lotIndex + 1 : this.lotIndex;
    const planEnd = Math.min(startIdx + 2, this.queue.length);
    // Difficulty drives how many lookahead lots the LLM gets to plan against.
    // Micah = 2, Jamie = 5, Henry = 10. Sliced to queue length.
    const diffSpec = getDifficultySpec(this.difficulty);
    const ctxEnd = Math.min(planEnd + diffSpec.lookaheadDepth, this.queue.length);

    if (startIdx >= this.queue.length) {
      console.log(`[MATCH:llm] id=${this.matchId} no more lots to plan`);
      return;
    }

    const toPlan: UpcomingPlayerCtx[] = [];
    for (let i = startIdx; i < planEnd; i++) {
      toPlan.push(this.toUpcomingCtx(i, this.queue[i]));
    }
    const upcomingContext: UpcomingPlayerCtx[] = [];
    for (let i = planEnd; i < ctxEnd; i++) {
      upcomingContext.push(this.toUpcomingCtx(i, this.queue[i]));
    }

    const formationTargets = getFormationTargets(this.formation);
    const targets = {
      GK: formationTargets.GK,
      DEF: formationTargets.DEF,
      MID: formationTargets.MID,
      ATT: formationTargets.ATT,
    };
    const aiCounts = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
    for (const b of this.aiBought) aiCounts[b.player.category]++;

    // Server-computed deficit so the LLM cannot miscount.
    const deficitGK = Math.max(0, targets.GK - aiCounts.GK);
    const deficitDEF = Math.max(0, targets.DEF - aiCounts.DEF);
    const deficitMID = Math.max(0, targets.MID - aiCounts.MID);
    const deficitATT = Math.max(0, targets.ATT - aiCounts.ATT);
    const xiComplete =
      deficitGK === 0 && deficitDEF === 0 && deficitMID === 0 && deficitATT === 0;

    const unfilledXiSlots: Array<"GK" | "DEF" | "MID" | "ATT"> = [];
    for (let i = 0; i < deficitGK; i++) unfilledXiSlots.push("GK");
    for (let i = 0; i < deficitDEF; i++) unfilledXiSlots.push("DEF");
    for (let i = 0; i < deficitMID; i++) unfilledXiSlots.push("MID");
    for (let i = 0; i < deficitATT; i++) unfilledXiSlots.push("ATT");

    const fmtXi = (cat: "GK" | "DEF" | "MID" | "ATT") => {
      const have = aiCounts[cat];
      const tgt = targets[cat];
      const def = Math.max(0, tgt - have);
      if (def === 0) return `${cat}: ${have}/${tgt} — XI COMPLETE (bench only)`;
      return `${cat}: ${have}/${tgt} — STILL NEED ${def} STARTER${def > 1 ? "S" : ""}`;
    };

    const xiStatus = {
      GK: fmtXi("GK"),
      DEF: fmtXi("DEF"),
      MID: fmtXi("MID"),
      ATT: fmtXi("ATT"),
    };

    // Bench accounting: any surplus over targets counts as bench.
    const benchCount =
      Math.max(0, aiCounts.GK - targets.GK) +
      Math.max(0, aiCounts.DEF - targets.DEF) +
      Math.max(0, aiCounts.MID - targets.MID) +
      Math.max(0, aiCounts.ATT - targets.ATT);
    const benchMinimum = BENCH_MINIMUM;
    const benchTarget = BENCH_TARGET;
    const benchNeeded = Math.max(0, benchTarget - benchCount);
    const benchMandatoryGap = Math.max(0, benchMinimum - benchCount);

    // Remaining queue scarcity per category — INCLUDES the lots in this planning
    // window (startIdx onward), not just the lookahead. The MUST-BUY validator
    // relies on this inclusive semantics: when sameCatDeficit >= sameCatRemaining
    // the current lot is the LAST chance to fill that position. Do NOT change to
    // start at planEnd without also updating validatePlan() and the system prompt.
    const scarcity = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
    for (let i = startIdx; i < this.queue.length; i++) {
      scarcity[this.queue[i].category]++;
    }

    // Spend pressure: target ≤€5M leftover at match end.
    // Linear pacing: at lot k of N, expected budget = STARTING_BUDGET × ((N - k) / N).
    const lotsResolved = this.lotIndex; // 0..queueLen
    const lotsTotal = this.queue.length;
    const fraction = Math.max(0, (lotsTotal - lotsResolved) / lotsTotal);
    const targetEndBudget = 5_000_000;
    const spendableTotal = STARTING_BUDGET - targetEndBudget;
    const expectedBudgetNow = targetEndBudget + Math.floor(spendableTotal * fraction);
    const hoardingExcess = this.aiBudget - expectedBudgetNow;
    let verdict: "ON_PACE" | "HOARDING_MILD" | "HOARDING_SEVERE" | "OVER_PACE";
    if (hoardingExcess > 200_000_000) verdict = "HOARDING_SEVERE";
    else if (hoardingExcess > 80_000_000) verdict = "HOARDING_MILD";
    else if (hoardingExcess < -50_000_000) verdict = "OVER_PACE";
    else verdict = "ON_PACE";
    const spendPressure = {
      fraction,
      expectedBudgetNow,
      hoardingExcess,
      verdict,
    };

    const userTotalSpent = this.userBought.reduce((s, b) => s + b.price, 0);
    const userHighestSinglePrice = this.userBought.reduce(
      (m, b) => Math.max(m, b.price),
      0
    );
    const userAveragePrice =
      this.userBought.length > 0
        ? Math.floor(userTotalSpent / this.userBought.length)
        : 0;

    const req: LlmCapRequest = {
      matchId: this.matchId,
      formation: this.formation,
      aiBudgetLeft: this.aiBudget,
      userBudgetLeft: this.userBudget,
      lotIndex: this.lotIndex,
      lotsTotal: this.queue.length,
      lotsRemaining: this.queue.length - this.lotIndex,
      toPlan,
      upcomingContext,
      aiSquad: {
        counts: aiCounts,
        targets,
        xiStatus,
        unfilledXiSlots,
        xiComplete,
        benchCount,
        benchMinimum,
        benchTarget,
        benchNeeded,
        benchMandatoryGap,
        bought: this.aiBought.map((b) => ({
          name: b.player.name,
          position: b.player.primary_position,
          ovr: b.player.overall,
          price: b.price,
        })),
      },
      remainingByCategory: scarcity,
      spendPressure,
      userActivity: {
        boughtCount: this.userBought.length,
        totalSpent: userTotalSpent,
        averagePrice: userAveragePrice,
        highestSinglePrice: userHighestSinglePrice,
        recentWins: this.userBought.slice(-5).map((b) => ({
          player: b.player.name,
          ovr: b.player.overall,
          price: b.price,
        })),
      },
      opponentSkill: "skilled",
      persona: {
        name: diffSpec.personaName,
        style: diffSpec.personaStyle,
      },
      lookaheadDepth: upcomingContext.length,
      winMandate: diffSpec.winMandate,
    };

    this.llmInFlight = true;
    this.llmCallCount += 1;
    try {
      const { caps, usage } = await planCaps(req);
      for (const [playerId, cap] of caps) {
        this.forwardPlan.set(playerId, cap);
      }
      this.llmLastSuccessAt = Date.now();
      this.llmPromptTokens += usage.promptTokens;
      this.llmCachedPromptTokens += usage.cachedPromptTokens;
      this.llmCompletionTokens += usage.completionTokens;
      this.llmTotalTokens += usage.totalTokens;
      this.llmTotalCostUsd += usage.costUsd;
      this.llmTotalLatencyMs += usage.latencyMs;
      console.log(
        `[MATCH:llm] id=${this.matchId} DONE merged=${caps.size} forwardPlanSize=${this.forwardPlan.size} ` +
          `| cumulative: calls=${this.llmCallCount} tokens=${this.llmTotalTokens} cost=$${this.llmTotalCostUsd.toFixed(6)}`
      );
    } catch (err) {
      this.llmCallsFailed += 1;
      console.log(
        `[MATCH:llm] id=${this.matchId} FAILED: ${(err as Error).message} — heuristic fallback in effect`
      );
    } finally {
      this.llmInFlight = false;
    }
  }

  private toUpcomingCtx(lotIndex: number, p: Player): UpcomingPlayerCtx {
    return {
      lotIndex,
      id: p.id,
      name: p.name,
      primary_position: p.primary_position,
      category: p.category,
      overall: p.overall,
      club: p.club,
      country: p.country,
      value_eur: p.value_eur,
    };
  }

  // ─────────────────────────── result phase ───────────────────────────

  /**
   * Fire-and-forget: ask the LLM to pick AI's best XI + bench from its roster.
   * Stores the in-flight promise on the instance so submitUserResult can await
   * it. Idempotent — second invocation is a no-op once the plan is ready.
   *
   * Called from endLot() when the match transitions to "complete". A user can
   * spend 30+ seconds dragging players around; this call happens in that window.
   */
  private kickoffAiSquadPlanning(): void {
    if (this.aiSquadPlan || this.aiSquadPlanPromise) {
      console.log(
        `[MATCH:ai-xi] id=${this.matchId} kickoff SKIPPED (already ${this.aiSquadPlan ? "done" : "in-flight"})`
      );
      return;
    }
    console.log(`[MATCH:ai-xi] id=${this.matchId} KICKOFF rosterSize=${this.aiBought.length}`);
    const diffSpec = getDifficultySpec(this.difficulty);
    this.aiSquadPlanPromise = planAiSquad({
      matchId: this.matchId,
      formation: this.formation,
      roster: this.aiBought,
      persona: { name: diffSpec.personaName, style: diffSpec.personaStyle },
    })
      .then((res) => {
        this.aiSquadPlan = res.squad;
        // Roll usage into the match-level accumulators so /debug reflects total cost.
        this.llmCallCount += 1;
        if (res.source === "fallback") this.llmCallsFailed += 1;
        this.llmPromptTokens += res.usage.promptTokens;
        this.llmCachedPromptTokens += res.usage.cachedPromptTokens;
        this.llmCompletionTokens += res.usage.completionTokens;
        this.llmTotalTokens += res.usage.totalTokens;
        this.llmTotalCostUsd += res.usage.costUsd;
        this.llmTotalLatencyMs += res.usage.latencyMs;
        console.log(
          `[MATCH:ai-xi] id=${this.matchId} DONE source=${res.source} xi=${res.squad.xi.length} bench=${res.squad.bench.length}`
        );
        return res.squad;
      })
      .catch((err) => {
        console.log(
          `[MATCH:ai-xi] id=${this.matchId} CRASHED: ${(err as Error).message} — using empty squad`
        );
        // Last-resort safety: return an empty squad. submitUserResult will treat
        // missing AI squad as "all categories lost" rather than 500'ing.
        const empty: Squad = { xi: [], bench: [] };
        this.aiSquadPlan = empty;
        return empty;
      });
  }

  /**
   * Frozen-XI submission from the user (drag-drop placement in SquadBuilder).
   * Validates the XI, awaits AI squad plan if still in flight, computes verdict
   * deterministically, calls the prose LLM, transitions to status="result".
   *
   * One-way: once status==="result", further calls return the cached payload
   * without re-running anything. Refresh-safe because state lives on the match.
   */
  async submitUserResult(
    xi: SquadXIEntry[],
    bench: SquadBenchEntry[]
  ): Promise<
    | { ok: true; dto: MatchStateDTO }
    | { ok: false; reason: string }
  > {
    // Idempotency — RESULT clicked twice, or polled after first call.
    if (this.status === "result") {
      console.log(`[MATCH:result] id=${this.matchId} already in result phase — returning cached`);
      return { ok: true, dto: this.toClientDTO() };
    }
    if (this.status !== "complete") {
      return { ok: false, reason: `cannot submit result while status=${this.status}` };
    }

    const validation = this.validateUserSquad(xi, bench);
    if (!validation.ok) return validation;

    // Make sure AI squad plan is in flight if not already (defensive — endLot
    // should have kicked it off but if something raced or the match was hand-
    // created this guarantees we have one).
    if (!this.aiSquadPlan && !this.aiSquadPlanPromise) {
      console.log(`[MATCH:result] id=${this.matchId} AI plan missing — kicking off now`);
      this.kickoffAiSquadPlanning();
    }

    if (this.aiSquadPlanPromise && !this.aiSquadPlan) {
      console.log(`[MATCH:result] id=${this.matchId} awaiting in-flight AI plan…`);
      try {
        await this.aiSquadPlanPromise;
      } catch (err) {
        console.log(
          `[MATCH:result] id=${this.matchId} AI plan await failed: ${(err as Error).message}`
        );
      }
    }
    const aiSquad: Squad = this.aiSquadPlan ?? { xi: [], bench: [] };

    const userSquad: Squad = { xi, bench };
    const diffSpec = getDifficultySpec(this.difficulty);

    // Deterministic numeric verdict first.
    const verdict = computeVerdict({
      formation: this.formation,
      userSquad,
      aiSquad,
      userBought: this.userBought,
      aiBought: this.aiBought,
      personaName: diffSpec.personaName,
    });

    const userTotalSpent = this.userBought.reduce((a, b) => a + b.price, 0);
    const aiTotalSpent = this.aiBought.reduce((a, b) => a + b.price, 0);

    // Prose pass.
    const prose = await writeVerdictProse({
      matchId: this.matchId,
      formation: this.formation,
      persona: { name: diffSpec.personaName, style: diffSpec.personaStyle },
      verdict,
      userBought: this.userBought,
      aiBought: this.aiBought,
      userTotalSpent,
      aiTotalSpent,
    });
    verdict.report = prose.report;
    verdict.roast = prose.roast;

    // Roll prose usage into accumulators.
    this.llmCallCount += 1;
    if (prose.source === "fallback") this.llmCallsFailed += 1;
    this.llmPromptTokens += prose.usage.promptTokens;
    this.llmCachedPromptTokens += prose.usage.cachedPromptTokens;
    this.llmCompletionTokens += prose.usage.completionTokens;
    this.llmTotalTokens += prose.usage.totalTokens;
    this.llmTotalCostUsd += prose.usage.costUsd;
    this.llmTotalLatencyMs += prose.usage.latencyMs;

    this.userResultXI = userSquad;
    this.verdict = verdict;
    this.status = "result";

    console.log(
      `[MATCH:result] id=${this.matchId} TRANSITION→result winner=${verdict.winner} ` +
        `score=${verdict.score.user}-${verdict.score.ai} userOvr=${verdict.userOverall} ` +
        `aiOvr=${verdict.aiOverall} userChem=${verdict.userChem} aiChem=${verdict.aiChem} ` +
        `aiPlanSrc=${this.aiSquadPlan && this.aiSquadPlan.xi.length === 11 ? "ok" : "partial"} ` +
        `proseSrc=${prose.source}`
    );

    this.persist();
    return { ok: true, dto: this.toClientDTO() };
  }

  /**
   * Validate user's submitted XI + bench:
   *   - XI has exactly 11 entries
   *   - Every slotId is real for the formation; no slot duplicated
   *   - Every playerId belongs to userBought; no player duplicated across xi/bench
   *   - Bench length ≤ 5; bench indices are 0..n-1 unique
   * Returns ok or a 400-shaped error.
   */
  private validateUserSquad(
    xi: SquadXIEntry[],
    bench: SquadBenchEntry[]
  ): { ok: true } | { ok: false; reason: string } {
    if (!Array.isArray(xi) || xi.length !== 11) {
      return { ok: false, reason: `xi must have exactly 11 entries, got ${xi?.length ?? "n/a"}` };
    }
    if (!Array.isArray(bench)) {
      return { ok: false, reason: "bench must be an array" };
    }
    if (bench.length > 5) {
      return { ok: false, reason: `bench may have at most 5 entries, got ${bench.length}` };
    }

    const slots = getSlots(this.formation);
    const slotIds = new Set(slots.map((s) => s.id));
    const userPlayerIds = new Set(this.userBought.map((b) => b.player.id));
    const seenSlots = new Set<string>();
    const seenPlayers = new Set<number>();

    for (const e of xi) {
      if (typeof e?.slotId !== "string" || !slotIds.has(e.slotId)) {
        return { ok: false, reason: `unknown slotId in xi: ${e?.slotId}` };
      }
      if (seenSlots.has(e.slotId)) {
        return { ok: false, reason: `slotId duplicated in xi: ${e.slotId}` };
      }
      if (typeof e.playerId !== "number" || !userPlayerIds.has(e.playerId)) {
        return { ok: false, reason: `playerId ${e.playerId} not in your bought list` };
      }
      if (seenPlayers.has(e.playerId)) {
        return { ok: false, reason: `playerId duplicated: ${e.playerId}` };
      }
      seenSlots.add(e.slotId);
      seenPlayers.add(e.playerId);
    }

    const seenBenchIdx = new Set<number>();
    for (const e of bench) {
      if (typeof e?.index !== "number" || !Number.isInteger(e.index) || e.index < 0 || e.index > 4) {
        return { ok: false, reason: `bench index out of range: ${e?.index}` };
      }
      if (seenBenchIdx.has(e.index)) {
        return { ok: false, reason: `bench index duplicated: ${e.index}` };
      }
      if (typeof e.playerId !== "number" || !userPlayerIds.has(e.playerId)) {
        return { ok: false, reason: `bench playerId ${e.playerId} not in your bought list` };
      }
      if (seenPlayers.has(e.playerId)) {
        return { ok: false, reason: `bench playerId ${e.playerId} also in xi` };
      }
      seenBenchIdx.add(e.index);
      seenPlayers.add(e.playerId);
    }
    return { ok: true };
  }

  // ─────────────────────────── persistence boundary ───────────────────────────

  /** Today: no-op. Under DO: `await this.state.storage.put(...)`. */
  protected persist(): void {
    // intentionally empty — single line to swap when wrapping in a DO
  }

  // ─────────────────────────── diagnostics ───────────────────────────

  toDebug() {
    return {
      matchId: this.matchId,
      formation: this.formation,
      difficulty: this.difficulty,
      status: this.status,
      createdAt: this.createdAt,
      lotIndex: this.lotIndex,
      lotsTotal: this.queue.length,
      userBudget: this.userBudget,
      aiBudget: this.aiBudget,
      userBoughtCount: this.userBought.length,
      aiBoughtCount: this.aiBought.length,
      forwardPlanSize: this.forwardPlan.size,
      llmInFlight: this.llmInFlight,
      hasLotState: this.lotState !== null,
      currentLot: this.lotState
        ? {
            lotIndex: this.lotState.lotIndex,
            player: `${this.lotState.player.name} (${this.lotState.player.category})`,
            cap: this.lotState.cap,
            currentBid: this.lotState.currentBid,
            highBidder: this.lotState.highBidder,
            msRemaining: this.lotState.expiresAt - Date.now(),
            pendingAiPlan: this.lotState.pendingAiPlan
              ? {
                  planId: this.lotState.pendingAiPlan.planId,
                  status: this.lotState.pendingAiPlan.status,
                  msUntilDue: this.lotState.pendingAiPlan.dueAt - Date.now(),
                }
              : null,
          }
        : null,
    };
  }
}
