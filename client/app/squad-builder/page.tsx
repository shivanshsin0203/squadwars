"use client";

/**
 * Squad Builder · dev sandbox route.
 *
 * The PRODUCTION path renders `<SquadBuilder>` inline inside `AuctionRoom` when the
 * match completes — there's no production link to this URL. This page exists so
 * design/UX work on the squad-builder + result-screen can iterate without playing
 * a full auction.
 *
 * Two phases mirror the real flow:
 *   1. SquadBuilder with DUMMY_BUYS — drag the 11 starters into place.
 *   2. Click "VIEW RESULT" → swaps to ResultScreen with a canned ResultPayload
 *      (dummy AI roster + made-up verdict). No server call.
 *
 * Refresh resets back to phase 1, just like the real route does.
 */

import { useState } from "react";
import SquadBuilder from "./SquadBuilder";
import ResultScreen from "./ResultScreen";
import ViewportGate from "../_components/ViewportGate";
import {
  DUMMY_BUYS,
  DUMMY_AI_BUYS,
  DUMMY_FORMATION,
  DUMMY_DIFFICULTY,
  buildDummyResultPayload,
} from "./fixture";
import type { ResultPayload } from "@/lib/types";

export default function SquadBuilderDevPage() {
  const [resultPayload, setResultPayload] = useState<ResultPayload | null>(null);

  if (resultPayload) {
    return (
      <ViewportGate pageLabel="RESULT · PREVIEW">
        <ResultScreen
          payload={resultPayload}
          userBought={DUMMY_BUYS}
          formation={DUMMY_FORMATION}
          difficulty={DUMMY_DIFFICULTY}
          matchId="dev-sandbox"
        />
      </ViewportGate>
    );
  }

  return (
    <ViewportGate pageLabel="SQUAD BUILDER · PREVIEW">
      <SquadBuilder
        bought={DUMMY_BUYS}
        formation={DUMMY_FORMATION}
        difficulty={DUMMY_DIFFICULTY}
        matchId="dev-sandbox"
        onSubmit={async (xi, bench) => {
          // No network call — fabricate a ResultPayload locally.
          const payload = buildDummyResultPayload({
            formation: DUMMY_FORMATION,
            userXi: xi,
            userBench: bench,
            userBought: DUMMY_BUYS,
            aiBought: DUMMY_AI_BUYS,
          });
          setResultPayload(payload);
        }}
      />
    </ViewportGate>
  );
}
