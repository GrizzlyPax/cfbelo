/**
 * Live-mode weekly update: re-fetch the current season from CFBD, normalize,
 * and rewrite its season file with any newly completed games. Designed for a
 * GitHub Actions cron (Sunday AM + Tuesday during the 2026 season); the
 * workflow commits the changed file. ~4 calls per run.
 *
 *   CFBD_API_KEY=xxx npm run update            # current season by date
 *   CFBD_API_KEY=xxx npm run update -- 2026    # explicit season
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fetchFbsTeams, fetchGames, fetchRankings } from '../data/cfbd';
import { buildSeasonData } from '../data/normalize';

function currentSeason(now = new Date()): number {
  // A CFB season spans Aug–Jan; before August we're still in last year's season.
  return now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

const year = process.argv[2] ? Number(process.argv[2]) : currentSeason();
const path = new URL(`../data/seasons/${year}.json`, import.meta.url);

let previousCount = 0;
try {
  previousCount = (JSON.parse(await readFile(path, 'utf8')) as { games: unknown[] }).games.length;
} catch {
  // First run of the season: no existing file.
}

const [games, teams, rankings] = await Promise.all([
  fetchGames(year),
  fetchFbsTeams(year),
  fetchRankings(year),
]);
const season = buildSeasonData(year, games, teams, rankings);
await writeFile(path, JSON.stringify(season, null, 1));

const added = season.games.length - previousCount;
console.log(`${year}: ${season.games.length} completed games (${added >= 0 ? '+' : ''}${added} since last run)`);
