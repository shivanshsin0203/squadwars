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
import type { BoughtPlayer } from "@/lib/types";

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
