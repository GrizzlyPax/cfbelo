/**
 * One-time historical backfill: fetch 2014–2025 from CFBD, normalize, and
 * write one JSON file per season under data/seasons/. ~3 API calls per
 * season (games regular + postseason, teams, rankings ≈ 4 actually) — well
 * under the 1,000/month free tier. Run once, commit the output.
 *
 *   CFBD_API_KEY=xxx npm run ingest            # 2014–2025
 *   CFBD_API_KEY=xxx npm run ingest -- 2023    # single season
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fetchFbsTeams, fetchGames, fetchRankings } from '../data/cfbd';
import { buildSeasonData } from '../data/normalize';

const FIRST_SEASON = 2014;
const LAST_SEASON = 2025;

async function ingestSeason(year: number): Promise<void> {
  console.log(`Ingesting ${year}...`);
  const [games, teams, rankings] = await Promise.all([
    fetchGames(year),
    fetchFbsTeams(year),
    fetchRankings(year),
  ]);
  const season = buildSeasonData(year, games, teams, rankings);
  await mkdir(new URL('../data/seasons/', import.meta.url), { recursive: true });
  const path = new URL(`../data/seasons/${year}.json`, import.meta.url);
  await writeFile(path, JSON.stringify(season, null, 1));
  console.log(`  ${season.games.length} games, ${season.teams.length} FBS teams, ${season.polls.length} poll weeks`);

  // Classification sanity check — eyeball these counts against reality.
  const byType = new Map<string, number>();
  for (const g of season.games) byType.set(g.gameType, (byType.get(g.gameType) ?? 0) + 1);
  console.log(`  tiers: ${[...byType.entries()].map(([t, n]) => `${t}=${n}`).join(' ')}`);
}

const arg = process.argv[2];
const years = arg
  ? [Number(arg)]
  : Array.from({ length: LAST_SEASON - FIRST_SEASON + 1 }, (_, i) => FIRST_SEASON + i);

for (const year of years) {
  await ingestSeason(year);
}
console.log('Done. Commit data/seasons/*.json.');
