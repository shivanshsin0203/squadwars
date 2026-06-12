/**
 * Match store + per-matchId mutex.
 *
 * Today: in-memory Map. Tomorrow (Cloudflare DO migration): the Map goes away
 * and `getMatch(id)` becomes `env.MATCH.idFromName(id).get()`. The withLock
 * wrapper goes away too — Durable Objects are single-threaded per ID by design.
 *
 * DO-emulation guarantees provided here:
 *   - One AuctionMatch instance per matchId (Map identity).
 *   - All access to the same matchId serializes through a promise chain, so
 *     two concurrent requests for the same match can never interleave their
 *     reads and writes.
 *   - Different matchIds run in parallel — no global lock.
 */

import { AuctionMatch } from "./match/AuctionMatch.js";

const matches = new Map<string, AuctionMatch>();
const chains = new Map<string, Promise<unknown>>();

export function getMatch(id: string): AuctionMatch | undefined {
  return matches.get(id);
}

export function putMatch(m: AuctionMatch): void {
  matches.set(m.matchId, m);
  console.log(`[STORE:put] matchId=${m.matchId} total-matches=${matches.size}`);
}

export function listMatchIds(): string[] {
  return Array.from(matches.keys());
}

/**
 * Serialize all access to a given matchId. Two simultaneous requests for the
 * same match queue and execute one at a time (mimics DO).
 *
 * Implementation: maintain a promise chain per matchId. Each new call appends
 * to the chain. We use `.catch(() => undefined)` on the stored chain so a
 * thrown handler doesn't poison the next caller — but the original caller
 * still sees the rejection via the returned promise.
 */
export function withLock<T>(
  matchId: string,
  fn: () => T | Promise<T>
): Promise<T> {
  const prev = chains.get(matchId);
  if (prev !== undefined) {
    console.log(`[STORE:wait] matchId=${matchId} request queued behind prior lock`);
  }
  const prevPromise = prev ?? Promise.resolve();

  const next = prevPromise.then(
    () => fn(),
    () => fn() // continue even if previous handler threw
  );

  const cleanupChain = next.catch(() => undefined).finally(() => {
    if (chains.get(matchId) === cleanupChain) {
      chains.delete(matchId);
    }
  });
  chains.set(matchId, cleanupChain);

  return next;
}
