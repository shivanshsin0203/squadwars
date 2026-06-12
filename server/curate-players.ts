/**
 * SquadWars — player dataset curator (current stars only)
 *
 * Reads the FC 26 player CSV (sofifa-derived), picks the top players in each
 * positional category (GK / DEF / MID / ATT) to guarantee enough variety for
 * auction queues, downloads each player's headshot, resizes to 600x600 WebP,
 * and writes a clean players.json bundled with the codebase.
 *
 * Quick start:
 *   1. Place the CSV at ./FC26_players.csv (default).
 *   2. npm i -D csv-parse sharp tsx
 *   3. npx tsx curate-players.ts
 *
 * Outputs:
 *   - ./players.json           (import this directly in your code)
 *   - ./public/players/*.webp  (served from /players/<id>.webp)
 *
 * Auction queue assumption:
 *   Each match draws 3 GK + 10 DEF + 10 MID + 10 ATT from this pool, so the
 *   pool is sized for variety (30 / 90 / 90 / 90 = 300 total).
 */

import { parse } from "csv-parse/sync";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

// ─────────────────────────── config ───────────────────────────

const SOURCE_CSV = "./FC26_players.csv";
const OUTPUT_JSON = "./players.json";
const OUTPUT_IMG_DIR = "./public/players";
const IMG_SIZE = 600;
const IMG_QUALITY = 85;
const DOWNLOAD_DELAY_MS = 80; // be polite to the CDN

// Pool sizes per category — tuned for ≥3× the per-match queue draw.
const POOL = {
  GK: 30,   // queue draws 3
  DEF: 90,  // queue draws 10
  MID: 90,  // queue draws 10
  ATT: 90,  // queue draws 10
};

// Hard floor — never include rubbish, even if a category is short.
const MIN_OVERALL = 78;

// ─────────────────────────── types ───────────────────────────

type CsvRow = Record<string, string>;

type Category = "GK" | "DEF" | "MID" | "ATT";

type Player = {
  id: number;
  name: string;
  positions: string[];       // e.g. ["ST", "CF"]
  primary_position: string;  // first in positions
  category: Category;        // derived from primary_position
  overall: number;
  club: string;
  country: string;
  value_eur: number;
  stats: {
    pac: number;
    sho: number;
    pas: number;
    dri: number;
    def: number;
    phy: number;
  };
  photo_url: string;   // original CDN url from the CSV
  photo_path: string;  // local resized webp (or placeholder)
};

// ─────────────────────────── helpers ───────────────────────────

const num = (v: string | undefined, fallback = 0): number => {
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const avg = (...nums: number[]) =>
  nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0;

/** Extract the 6 FUT-style aggregates. Use direct fields if present, else derive. */
function extractStats(row: CsvRow): Player["stats"] {
  if (row.pace) {
    return {
      pac: num(row.pace),
      sho: num(row.shooting),
      pas: num(row.passing),
      dri: num(row.dribbling),
      def: num(row.defending),
      phy: num(row.physic ?? row.physicality),
    };
  }

  // Derive from granular fields (raw sofifa-scraper format).
  return {
    pac: avg(num(row.movement_acceleration), num(row.movement_sprint_speed)),
    sho: avg(
      num(row.attacking_finishing),
      num(row.power_shot_power),
      num(row.power_long_shots),
      num(row.mentality_positioning),
      num(row.attacking_volleys),
      num(row.mentality_penalties)
    ),
    pas: avg(
      num(row.attacking_short_passing),
      num(row.skill_long_passing),
      num(row.attacking_crossing),
      num(row.skill_curve),
      num(row.skill_fk_accuracy),
      num(row.mentality_vision)
    ),
    dri: avg(
      num(row.skill_dribbling),
      num(row.skill_ball_control),
      num(row.movement_agility),
      num(row.movement_balance),
      num(row.movement_reactions),
      num(row.mentality_composure)
    ),
    def: avg(
      num(row.defending_marking_awareness ?? row.defending),
      num(row.defending_standing_tackle),
      num(row.defending_sliding_tackle),
      num(row.attacking_heading_accuracy),
      num(row.mentality_interceptions)
    ),
    phy: avg(
      num(row.power_jumping),
      num(row.power_strength),
      num(row.power_stamina),
      num(row.mentality_aggression)
    ),
  };
}

function parsePositions(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,|/]/)
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean);
}

const ATT_POS = new Set(["ST", "CF", "LW", "RW", "LF", "RF", "LS", "RS"]);
const MID_POS = new Set(["CDM", "CM", "CAM", "LM", "RM", "LCM", "RCM", "LDM", "RDM", "LAM", "RAM"]);
const DEF_POS = new Set(["CB", "LB", "RB", "LWB", "RWB", "LCB", "RCB", "SW"]);

function categoryFor(primary: string): Category | null {
  if (primary === "GK") return "GK";
  if (DEF_POS.has(primary)) return "DEF";
  if (MID_POS.has(primary)) return "MID";
  if (ATT_POS.has(primary)) return "ATT";
  return null;
}

async function downloadAndConvertImage(
  url: string,
  outPath: string
): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await sharp(buf)
      .resize(IMG_SIZE, IMG_SIZE, { fit: "cover", position: "top" })
      .webp({ quality: IMG_QUALITY })
      .toFile(outPath);
    return true;
  } catch (err) {
    console.warn(
      `   ⚠  image failed (${path.basename(outPath)}): ${(err as Error).message}`
    );
    return false;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─────────────────────────── main ───────────────────────────

type Candidate = {
  row: CsvRow;
  id: number;
  positions: string[];
  primary: string;
  category: Category;
  overall: number;
};

async function main() {
  console.log("Reading CSV…");
  const csvText = await readFile(SOURCE_CSV, "utf8");
  const rows = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
  }) as CsvRow[];
  console.log(`   ${rows.length} rows`);

  console.log("Categorising…");
  const seen = new Set<string>();
  const buckets: Record<Category, Candidate[]> = { GK: [], DEF: [], MID: [], ATT: [] };

  for (const row of rows) {
    const id = row.player_id ?? row.id;
    if (!id || seen.has(id)) continue;

    const overall = num(row.overall ?? row.overall_rating);
    if (overall < MIN_OVERALL) continue;

    const positions = parsePositions(row.player_positions ?? row.positions);
    if (!positions.length) continue;

    const primary = positions[0];
    const category = categoryFor(primary);
    if (!category) continue;

    seen.add(id);
    buckets[category].push({ row, id: Number(id), positions, primary, category, overall });
  }

  // Top N per category by overall.
  const sortByOverall = (a: Candidate, b: Candidate) => b.overall - a.overall;
  const picks: Candidate[] = [
    ...buckets.GK.sort(sortByOverall).slice(0, POOL.GK),
    ...buckets.DEF.sort(sortByOverall).slice(0, POOL.DEF),
    ...buckets.MID.sort(sortByOverall).slice(0, POOL.MID),
    ...buckets.ATT.sort(sortByOverall).slice(0, POOL.ATT),
  ];

  console.log(
    `   GK: ${Math.min(buckets.GK.length, POOL.GK)}  ` +
      `DEF: ${Math.min(buckets.DEF.length, POOL.DEF)}  ` +
      `MID: ${Math.min(buckets.MID.length, POOL.MID)}  ` +
      `ATT: ${Math.min(buckets.ATT.length, POOL.ATT)}  →  total: ${picks.length}`
  );

  await mkdir(OUTPUT_IMG_DIR, { recursive: true });

  console.log("Downloading photos & building players.json…");
  const players: Player[] = [];

  for (let i = 0; i < picks.length; i++) {
    const { row, id, positions, primary, category, overall } = picks[i];
    const name =
      row.short_name || row.name || row.long_name || row.full_name || `Player ${id}`;
    const photoUrl =
      row.player_face_url ?? row.image ?? row.player_image_url ?? row.photo ?? "";
    const fileName = `${id}.webp`;
    const outPath = path.join(OUTPUT_IMG_DIR, fileName);

    process.stdout.write(
      `   [${String(i + 1).padStart(3)}/${picks.length}] ${category} ${String(overall).padStart(2)} ${name.padEnd(28)}`
    );

    let photoOk = false;
    if (photoUrl) {
      photoOk = await downloadAndConvertImage(photoUrl, outPath);
      await sleep(DOWNLOAD_DELAY_MS);
    }

    players.push({
      id,
      name,
      positions,
      primary_position: primary,
      category,
      overall,
      club: row.club_name ?? row.club ?? "Free Agent",
      country: row.nationality_name ?? row.country_name ?? row.nationality ?? "Unknown",
      value_eur: num(row.value_eur),
      stats: extractStats(row),
      photo_url: photoUrl,
      photo_path: photoOk ? `/players/${fileName}` : "/players/placeholder.webp",
    });

    process.stdout.write(photoOk ? "  ✓\n" : "  · no photo\n");
  }

  console.log(`Writing ${OUTPUT_JSON}…`);
  await writeFile(OUTPUT_JSON, JSON.stringify(players, null, 2));
  console.log(`Done — ${players.length} players written.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
