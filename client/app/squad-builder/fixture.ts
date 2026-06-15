/**
 * Squad Builder · dummy fixture
 *
 * Stand-in for the post-auction `MatchStateDTO.user.bought` list. The shape mirrors
 * the server's `BoughtPlayer` / `Player` types so the only swap required at wire-up
 * time is the source of `bought` — everything downstream consumes the same shape.
 *
 * 16 players: 1 GK + 5 DEF (2 CB + LB + RB + spare CDM/RB) + 4 MID + 6 ATT.
 * Sized to fit 11 XI slots + 5 bench exactly, with realistic same-club / same-nation
 * clusters (Liverpool, PSG, Real Madrid, Bayern) so chemistry has something to chew on.
 *
 * Types come from `@/lib/types` — the shared wire DTO surface — so the dev-sandbox
 * page and the production AuctionRoom path can both feed `SquadBuilder` with the
 * same `BoughtPlayer` shape.
 */
import type {
  BoughtPlayer,
  ResultPayload,
  Squad,
  SquadBenchEntry,
  SquadXIEntry,
  Verdict,
} from "@/lib/types";

export const DUMMY_FORMATION = "4-3-3";
export const DUMMY_DIFFICULTY = "hard";

export const DUMMY_BUYS: BoughtPlayer[] = [
  { lotIndex: 1, price: 43_000_000, player: { id: 212831, name: "Alisson", positions: ["GK"], primary_position: "GK", category: "GK", overall: 89, club: "Liverpool", country: "Brazil", value_eur: 51_000_000, stats: { pac: 55, sho: 25, pas: 40, dri: 50, def: 18, phy: 55 }, photo_url: "https://cdn.sofifa.net/players/212/831/26_120.png", photo_path: "/players/212831.webp" } },
  { lotIndex: 2, price: 52_000_000, player: { id: 203376, name: "V. van Dijk", positions: ["CB"], primary_position: "CB", category: "DEF", overall: 90, club: "Liverpool", country: "Netherlands", value_eur: 57_000_000, stats: { pac: 73, sho: 60, pas: 72, dri: 72, def: 90, phy: 87 }, photo_url: "https://cdn.sofifa.net/players/203/376/26_120.png", photo_path: "/players/203376.webp" } },
  { lotIndex: 3, price: 83_000_000, player: { id: 232580, name: "Gabriel", positions: ["CB"], primary_position: "CB", category: "DEF", overall: 88, club: "Arsenal", country: "Brazil", value_eur: 84_000_000, stats: { pac: 64, sho: 44, pas: 64, dri: 65, def: 88, phy: 84 }, photo_url: "https://cdn.sofifa.net/players/232/580/26_120.png", photo_path: "/players/232580.webp" } },
  { lotIndex: 4, price: 91_000_000, player: { id: 252145, name: "Nuno Mendes", positions: ["LB", "LM"], primary_position: "LB", category: "DEF", overall: 86, club: "Paris Saint-Germain", country: "Portugal", value_eur: 86_000_000, stats: { pac: 95, sho: 65, pas: 76, dri: 82, def: 80, phy: 77 }, photo_url: "https://cdn.sofifa.net/players/252/145/26_120.png", photo_path: "/players/252145.webp" } },
  { lotIndex: 5, price: 97_000_000, player: { id: 212622, name: "J. Kimmich", positions: ["CDM", "RB", "CM"], primary_position: "CDM", category: "MID", overall: 89, club: "FC Bayern München", country: "Germany", value_eur: 86_000_000, stats: { pac: 72, sho: 74, pas: 89, dri: 84, def: 83, phy: 79 }, photo_url: "https://cdn.sofifa.net/players/212/622/26_120.png", photo_path: "/players/212622.webp" } },
  { lotIndex: 6, price: 94_000_000, player: { id: 235212, name: "A. Hakimi", positions: ["RB", "RM"], primary_position: "RB", category: "DEF", overall: 89, club: "Paris Saint-Germain", country: "Morocco", value_eur: 111_000_000, stats: { pac: 92, sho: 79, pas: 82, dri: 83, def: 82, phy: 79 }, photo_url: "https://cdn.sofifa.net/players/235/212/26_120.png", photo_path: "/players/235212.webp" } },
  { lotIndex: 7, price: 75_000_000, player: { id: 209331, name: "M. Salah", positions: ["RM", "RW"], primary_position: "RM", category: "MID", overall: 91, club: "Liverpool", country: "Egypt", value_eur: 82_000_000, stats: { pac: 89, sho: 88, pas: 86, dri: 90, def: 45, phy: 76 }, photo_url: "https://cdn.sofifa.net/players/209/331/26_120.png", photo_path: "/players/209331.webp" } },
  { lotIndex: 8, price: 101_000_000, player: { id: 231866, name: "Rodri", positions: ["CDM", "CM"], primary_position: "CDM", category: "MID", overall: 90, club: "Manchester City", country: "Spain", value_eur: 102_000_000, stats: { pac: 65, sho: 80, pas: 86, dri: 84, def: 86, phy: 85 }, photo_url: "https://cdn.sofifa.net/players/231/866/26_120.png", photo_path: "/players/231866.webp" } },
  { lotIndex: 9, price: 185_000_000, player: { id: 252371, name: "J. Bellingham", positions: ["CAM", "CM"], primary_position: "CAM", category: "MID", overall: 90, club: "Real Madrid", country: "England", value_eur: 174_500_000, stats: { pac: 80, sho: 86, pas: 83, dri: 90, def: 78, phy: 85 }, photo_url: "https://cdn.sofifa.net/players/252/371/26_120.png", photo_path: "/players/252371.webp" } },
  { lotIndex: 10, price: 145_000_000, player: { id: 255253, name: "Vitinha", positions: ["CM", "CDM", "CAM"], primary_position: "CM", category: "MID", overall: 89, club: "Paris Saint-Germain", country: "Portugal", value_eur: 128_500_000, stats: { pac: 72, sho: 80, pas: 86, dri: 90, def: 75, phy: 70 }, photo_url: "https://cdn.sofifa.net/players/255/253/26_120.png", photo_path: "/players/255253.webp" } },
  { lotIndex: 11, price: 147_000_000, player: { id: 231747, name: "K. Mbappé", positions: ["ST", "LW", "LM"], primary_position: "ST", category: "ATT", overall: 91, club: "Real Madrid", country: "France", value_eur: 173_500_000, stats: { pac: 97, sho: 90, pas: 81, dri: 92, def: 37, phy: 76 }, photo_url: "https://cdn.sofifa.net/players/231/747/26_120.png", photo_path: "/players/231747.webp" } },
  { lotIndex: 12, price: 144_000_000, player: { id: 239085, name: "E. Haaland", positions: ["ST"], primary_position: "ST", category: "ATT", overall: 90, club: "Manchester City", country: "Norway", value_eur: 157_000_000, stats: { pac: 86, sho: 91, pas: 70, dri: 80, def: 45, phy: 88 }, photo_url: "https://cdn.sofifa.net/players/239/085/26_120.png", photo_path: "/players/239085.webp" } },
  { lotIndex: 13, price: 121_000_000, player: { id: 231443, name: "O. Dembélé", positions: ["ST", "RW", "CAM"], primary_position: "ST", category: "ATT", overall: 90, club: "Paris Saint-Germain", country: "France", value_eur: 122_500_000, stats: { pac: 91, sho: 88, pas: 83, dri: 93, def: 50, phy: 69 }, photo_url: "https://cdn.sofifa.net/players/231/443/26_120.png", photo_path: "/players/231443.webp" } },
  { lotIndex: 14, price: 92_000_000, player: { id: 202126, name: "H. Kane", positions: ["ST"], primary_position: "ST", category: "ATT", overall: 89, club: "FC Bayern München", country: "England", value_eur: 87_000_000, stats: { pac: 64, sho: 92, pas: 83, dri: 82, def: 48, phy: 82 }, photo_url: "https://cdn.sofifa.net/players/202/126/26_120.png", photo_path: "/players/202126.webp" } },
  { lotIndex: 15, price: 159_000_000, player: { id: 238794, name: "Vini Jr.", positions: ["LW", "ST", "LM"], primary_position: "LW", category: "ATT", overall: 89, club: "Real Madrid", country: "Brazil", value_eur: 141_000_000, stats: { pac: 95, sho: 84, pas: 81, dri: 91, def: 29, phy: 69 }, photo_url: "https://cdn.sofifa.net/players/238/794/26_120.png", photo_path: "/players/238794.webp" } },
  { lotIndex: 16, price: 94_000_000, player: { id: 233731, name: "A. Isak", positions: ["ST"], primary_position: "ST", category: "ATT", overall: 88, club: "Liverpool", country: "Sweden", value_eur: 111_000_000, stats: { pac: 83, sho: 89, pas: 73, dri: 85, def: 39, phy: 76 }, photo_url: "https://cdn.sofifa.net/players/233/731/26_120.png", photo_path: "/players/233731.webp" } },
];

// ─────────────────────────── Dummy AI roster (for ResultScreen preview) ───────────────────────────

/**
 * 16 dummy AI buys cherry-picked from the real player pool so every photo
 * actually exists in /public/players/. Clusters: Barcelona (5), Arsenal (3),
 * PSG (2), Argentina (3). Strong enough to make the verdict preview interesting
 * (user wins 3–2 by default; flip in buildDummyResultPayload to test loss UI).
 */
export const DUMMY_AI_BUYS: BoughtPlayer[] = [
  { lotIndex: 1,  price: 78_000_000,  player: { id: 230621, name: "G. Donnarumma", positions: ["GK"], primary_position: "GK", category: "GK", overall: 89, club: "Manchester City", country: "Italy", value_eur: 97_000_000, stats: { pac: 53, sho: 22, pas: 28, dri: 49, def: 18, phy: 55 }, photo_url: "", photo_path: "/players/230621.webp" } },
  { lotIndex: 2,  price: 88_000_000,  player: { id: 243715, name: "W. Saliba", positions: ["CB"], primary_position: "CB", category: "DEF", overall: 87, club: "Arsenal", country: "France", value_eur: 92_000_000, stats: { pac: 77, sho: 39, pas: 68, dri: 72, def: 87, phy: 83 }, photo_url: "", photo_path: "/players/243715.webp" } },
  { lotIndex: 3,  price: 80_000_000,  player: { id: 237383, name: "A. Bastoni", positions: ["CB"], primary_position: "CB", category: "DEF", overall: 87, club: "Inter", country: "Italy", value_eur: 87_000_000, stats: { pac: 74, sho: 46, pas: 75, dri: 76, def: 88, phy: 82 }, photo_url: "", photo_path: "/players/237383.webp" } },
  { lotIndex: 4,  price: 86_000_000,  player: { id: 241486, name: "J. Koundé", positions: ["RB", "CB", "RM"], primary_position: "RB", category: "DEF", overall: 87, club: "FC Barcelona", country: "France", value_eur: 85_500_000, stats: { pac: 84, sho: 47, pas: 74, dri: 79, def: 86, phy: 84 }, photo_url: "", photo_path: "/players/241486.webp" } },
  { lotIndex: 5,  price: 73_000_000,  player: { id: 207865, name: "Marquinhos", positions: ["CB"], primary_position: "CB", category: "DEF", overall: 87, club: "Paris Saint-Germain", country: "Brazil", value_eur: 60_000_000, stats: { pac: 75, sho: 47, pas: 75, dri: 77, def: 88, phy: 78 }, photo_url: "", photo_path: "/players/207865.webp" } },
  { lotIndex: 6,  price: 81_000_000,  player: { id: 234378, name: "D. Rice", positions: ["CDM", "CM"], primary_position: "CDM", category: "MID", overall: 87, club: "Arsenal", country: "England", value_eur: 96_500_000, stats: { pac: 75, sho: 73, pas: 81, dri: 80, def: 83, phy: 85 }, photo_url: "", photo_path: "/players/234378.webp" } },
  { lotIndex: 7,  price: 91_000_000,  player: { id: 239053, name: "F. Valverde", positions: ["CM", "RM"], primary_position: "CM", category: "MID", overall: 89, club: "Real Madrid", country: "Uruguay", value_eur: 130_500_000, stats: { pac: 86, sho: 84, pas: 84, dri: 86, def: 76, phy: 85 }, photo_url: "", photo_path: "/players/239053.webp" } },
  { lotIndex: 8,  price: 99_000_000,  player: { id: 251854, name: "Pedri", positions: ["CM", "CAM"], primary_position: "CM", category: "MID", overall: 89, club: "FC Barcelona", country: "Spain", value_eur: 117_000_000, stats: { pac: 74, sho: 78, pas: 86, dri: 90, def: 73, phy: 67 }, photo_url: "", photo_path: "/players/251854.webp" } },
  { lotIndex: 9,  price: 120_000_000, player: { id: 256630, name: "F. Wirtz", positions: ["CAM", "ST", "CM"], primary_position: "CAM", category: "MID", overall: 89, club: "Liverpool", country: "Germany", value_eur: 150_500_000, stats: { pac: 80, sho: 82, pas: 88, dri: 90, def: 54, phy: 67 }, photo_url: "", photo_path: "/players/256630.webp" } },
  { lotIndex: 10, price: 138_000_000, player: { id: 277643, name: "Lamine Yamal", positions: ["RM", "RW"], primary_position: "RM", category: "MID", overall: 89, club: "FC Barcelona", country: "Spain", value_eur: 162_500_000, stats: { pac: 88, sho: 82, pas: 80, dri: 92, def: 30, phy: 64 }, photo_url: "", photo_path: "/players/277643.webp" } },
  { lotIndex: 11, price: 122_000_000, player: { id: 233419, name: "Raphinha", positions: ["LM", "LW"], primary_position: "LM", category: "MID", overall: 89, club: "FC Barcelona", country: "Brazil", value_eur: 109_000_000, stats: { pac: 84, sho: 86, pas: 83, dri: 88, def: 51, phy: 72 }, photo_url: "", photo_path: "/players/233419.webp" } },
  { lotIndex: 12, price: 70_000_000,  player: { id: 188545, name: "R. Lewandowski", positions: ["ST"], primary_position: "ST", category: "ATT", overall: 88, club: "FC Barcelona", country: "Poland", value_eur: 26_000_000, stats: { pac: 72, sho: 90, pas: 77, dri: 84, def: 35, phy: 80 }, photo_url: "", photo_path: "/players/188545.webp" } },
  { lotIndex: 13, price: 102_000_000, player: { id: 231478, name: "L. Martínez", positions: ["ST"], primary_position: "ST", category: "ATT", overall: 88, club: "Inter", country: "Argentina", value_eur: 109_000_000, stats: { pac: 81, sho: 88, pas: 76, dri: 87, def: 42, phy: 79 }, photo_url: "", photo_path: "/players/231478.webp" } },
  { lotIndex: 14, price: 113_000_000, player: { id: 246669, name: "B. Saka", positions: ["RW", "LW"], primary_position: "RW", category: "ATT", overall: 88, club: "Arsenal", country: "England", value_eur: 145_000_000, stats: { pac: 86, sho: 83, pas: 84, dri: 89, def: 47, phy: 70 }, photo_url: "", photo_path: "/players/246669.webp" } },
  { lotIndex: 15, price: 88_000_000,  player: { id: 247635, name: "K. Kvaratskhelia", positions: ["LW", "LM"], primary_position: "LW", category: "ATT", overall: 87, club: "Paris Saint-Germain", country: "Georgia", value_eur: 95_000_000, stats: { pac: 86, sho: 81, pas: 80, dri: 91, def: 39, phy: 71 }, photo_url: "", photo_path: "/players/247635.webp" } },
  { lotIndex: 16, price: 76_000_000,  player: { id: 246191, name: "J. Alvarez", positions: ["ST", "CAM"], primary_position: "ST", category: "ATT", overall: 87, club: "Atlético Madrid", country: "Argentina", value_eur: 91_500_000, stats: { pac: 82, sho: 84, pas: 80, dri: 86, def: 47, phy: 73 }, photo_url: "", photo_path: "/players/246191.webp" } },
];

// ─────────────────────────── Dummy verdict + squads ───────────────────────────

/**
 * Build a dummy ResultPayload from a freshly-submitted user XI. The AI side is
 * picked greedily (best-fit + highest OVR) so it always renders 11 starters,
 * and the verdict numbers are made up but plausible: roughly even, user-leaning
 * 3-2 by default so the "YOU WIN" path is visible at first preview.
 *
 * Used by the dev sandbox to demo ResultScreen without a server roundtrip.
 */
export function buildDummyResultPayload(opts: {
  formation: string;
  userXi: SquadXIEntry[];
  userBench: SquadBenchEntry[];
  userBought: BoughtPlayer[];
  aiBought: BoughtPlayer[];
}): ResultPayload {
  const aiSquad: Squad = greedyAiSquadForPreview(opts.formation, opts.aiBought);
  const userSquad: Squad = { xi: opts.userXi, bench: opts.userBench };
  const userTotalSpent = opts.userBought.reduce((a, b) => a + b.price, 0);
  const aiTotalSpent = opts.aiBought.reduce((a, b) => a + b.price, 0);

  const verdict: Verdict = {
    winner: "user",
    score: { user: 3, ai: 2 },
    categories: [
      { name: "Attack",      user: 88, ai: 86, winner: "user" },
      { name: "Midfield",    user: 89, ai: 87, winner: "user" },
      { name: "Defence",     user: 84, ai: 86, winner: "ai" },
      { name: "Chemistry",   user: 22, ai: 19, winner: "user" },
      { name: "Budget eff.", user: 78, ai: 82, winner: "ai" },
    ],
    report:
      "Your midfield landed 89 to 87 and that was the decisive category. Bellingham at €185M ran the tempo where the AI's Wirtz at €120M never quite settled. The chemistry gap, 22 to 19 in your favour, confirmed the result.",
    roast:
      "Hands up, Bellingham beat me on volume of touches. Next round Salah doesn't walk for value. —Thierry Henry",
    personaName: "Thierry Henry",
    userOverall: 87,
    aiOverall: 86,
    userChem: 22,
    aiChem: 19,
  };

  return {
    userSquad,
    aiSquad,
    aiBought: opts.aiBought,
    userTotalSpent,
    aiTotalSpent,
    verdict,
  };
}

/**
 * Minimal greedy XI picker for the dummy AI side. Real preview only — production
 * uses the server's LLM planAiSquad. Mirrors the same priority order (GK → DEF
 * → MID → ATT) and best-effective-OVR slot fit.
 */
function greedyAiSquadForPreview(formation: string, roster: BoughtPlayer[]): Squad {
  // We don't have access to the slot tables here without an import cycle, so we
  // hardcode a stable 4-3-3 fallback set of slotIds + cats. If the dev sandbox
  // adds non-4-3-3 formations later, expand this map.
  const slotsByFormation: Record<string, Array<{ id: string; pos: string; cat: "GK" | "DEF" | "MID" | "ATT" }>> = {
    "4-3-3": [
      { id: "gk",  pos: "GK",  cat: "GK"  },
      { id: "lb",  pos: "LB",  cat: "DEF" },
      { id: "lcb", pos: "CB",  cat: "DEF" },
      { id: "rcb", pos: "CB",  cat: "DEF" },
      { id: "rb",  pos: "RB",  cat: "DEF" },
      { id: "cm1", pos: "CM",  cat: "MID" },
      { id: "cdm", pos: "CDM", cat: "MID" },
      { id: "cm2", pos: "CM",  cat: "MID" },
      { id: "lw",  pos: "LW",  cat: "ATT" },
      { id: "st",  pos: "ST",  cat: "ATT" },
      { id: "rw",  pos: "RW",  cat: "ATT" },
    ],
  };
  const slots = slotsByFormation[formation] ?? slotsByFormation["4-3-3"];
  const used = new Set<number>();
  const xi: SquadXIEntry[] = [];

  // Fill by category priority for cleaner picks.
  const order: Array<"GK" | "DEF" | "MID" | "ATT"> = ["GK", "DEF", "MID", "ATT"];
  const ordered = slots.slice().sort((a, b) => order.indexOf(a.cat) - order.indexOf(b.cat));

  for (const slot of ordered) {
    const pool = roster.filter((b) => !used.has(b.player.id));
    let best: BoughtPlayer | null = null;
    let bestScore = -Infinity;
    for (const bp of pool) {
      let fit = -45;
      if (bp.player.primary_position === slot.pos) fit = 2;
      else if (bp.player.positions.includes(slot.pos)) fit = 0.5;
      else if (bp.player.category === slot.cat) fit = -10;
      const s = bp.player.overall + fit;
      if (s > bestScore) {
        best = bp;
        bestScore = s;
      }
    }
    if (best) {
      xi.push({ slotId: slot.id, playerId: best.player.id });
      used.add(best.player.id);
    }
  }
  // Bench: top 5 leftovers by OVR.
  const bench: SquadBenchEntry[] = [];
  const leftovers = roster
    .filter((b) => !used.has(b.player.id))
    .sort((a, b) => b.player.overall - a.player.overall)
    .slice(0, 5);
  leftovers.forEach((bp, i) => bench.push({ index: i, playerId: bp.player.id }));
  return { xi, bench };
}
