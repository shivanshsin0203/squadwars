"use client";

/**
 * Squad Builder · dev sandbox route.
 *
 * The PRODUCTION path renders `<SquadBuilder>` inline inside `AuctionRoom` when the
 * match completes — there's no production link to this URL. This page exists so
 * design/UX work on the squad-builder can iterate without playing a full auction.
 *
 * Real player data comes from the server in production. Here we feed it a curated
 * 16-player fixture. Refresh resets placement just like the real route does.
 */

import SquadBuilder from "./SquadBuilder";
import { DUMMY_BUYS, DUMMY_FORMATION, DUMMY_DIFFICULTY } from "./fixture";

export default function SquadBuilderDevPage() {
  return (
    <SquadBuilder
      bought={DUMMY_BUYS}
      formation={DUMMY_FORMATION}
      difficulty={DUMMY_DIFFICULTY}
    />
  );
}
