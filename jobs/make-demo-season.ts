/**
 * Generate a deterministic synthetic dataset (seasons 2098–2099) so the CLI
 * and tests run before anyone has a CFBD key. 32 fake FBS teams in 4
 * conferences with hidden true strengths; results simulated from those
 * strengths, so a good config should recover the strength order.
 *
 *   npm run demo-data
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { FCS_TEAM_ID, type Game, type GameType, type PollWeek, type SeasonData, type Team } from '../engine/types';

// mulberry32 — tiny seeded PRNG, deterministic across runs.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CONFERENCES = ['Pioneer', 'Frontier', 'Summit', 'Coastal'];
const NAMES = [
  'Ashford', 'Bellhaven', 'Cascade Tech', 'Dunmore', 'Eastgate', 'Fairbanks A&M', 'Granite State', 'Harrow',
  'Ironwood', 'Jespersen', 'Kirkland', 'Longview', 'Merritt', 'Northfield', 'Oakhurst', 'Pinecrest',
  'Quarry Ridge', 'Rockwell', 'Southport', 'Talmadge', 'Umberland', 'Vandermeer', 'Westbrook', 'Yardley',
  'Zellner', 'Alder Valley', 'Briarcliff', 'Crown Point', 'Dover Tech', 'Elmhurst', 'Foxhall', 'Grover City',
];

interface DemoTeam extends Team {
  strength: number;
}

function makeTeams(rand: () => number): DemoTeam[] {
  return NAMES.map((school, i) => ({
    id: 1000 + i,
    school,
    conference: CONFERENCES[Math.floor(i / 8)]!,
    // Sum of uniforms ≈ normal; spread of ±~250 rating points of true strength.
    strength: 1500 + (rand() + rand() + rand() + rand() - 2) * 250,
  }));
}

let nextGameId = 1;

function playGame(
  season: number,
  week: number,
  seasonType: 'regular' | 'postseason',
  home: DemoTeam,
  away: DemoTeam,
  gameType: GameType,
  neutral: boolean,
  rand: () => number,
): Game {
  const homeEdge = neutral ? 0 : 40;
  const dr = home.strength - away.strength + homeEdge;
  // Margin: strength gap converted to points plus noise; no ties allowed.
  let margin = Math.round(dr / 28 + (rand() + rand() + rand() + rand() - 2) * 24);
  if (margin === 0) margin = rand() < 0.5 ? -3 : 3;
  const losing = 3 + Math.floor(rand() * 28);
  const [homePoints, awayPoints] = margin > 0 ? [losing + margin, losing] : [losing, losing - margin];
  const day = String(Math.min(28, week * 2)).padStart(2, '0');
  const month = seasonType === 'regular' ? '10' : '12';
  return {
    id: nextGameId++,
    season,
    week,
    seasonType,
    startDate: `${season}-${month}-${day}T19:00:00.000Z`,
    neutralSite: neutral,
    conferenceGame: home.conference === away.conference && gameType !== 'fcs',
    gameType,
    homeId: home.id,
    homeTeam: home.school,
    homePoints,
    awayId: away.id,
    awayTeam: away.school,
    awayPoints,
  };
}

function makeSeason(season: number, teams: DemoTeam[], rand: () => number): SeasonData {
  const games: Game[] = [];
  const fcs: DemoTeam = { id: FCS_TEAM_ID, school: 'FCS', conference: null, strength: 1100 };

  // Weeks 1–7: full round robin inside each conference (I=25 tier).
  for (const conf of CONFERENCES) {
    const members = teams.filter((t) => t.conference === conf);
    // Circle method round robin for 8 teams: 7 rounds of 4 games.
    const ids = members.map((_, i) => i);
    for (let round = 0; round < 7; round++) {
      for (let g = 0; g < 4; g++) {
        const a = g === 0 ? 0 : ids[(round + g) % 7 + 1]!;
        const b = ids[(round + 7 - g) % 7 + 1]!;
        if (a === b) continue;
        const home = members[a]!;
        const away = members[b]!;
        // The last round-robin round is rivalry week (I=30 tier).
        const type: GameType = round === 6 ? 'rivalry' : 'conf';
        games.push(playGame(season, round + 1, 'regular', home, away, type, false, rand));
      }
    }
  }

  // Weeks 8–10: three cross-conference games per team (I=15 tier).
  for (let w = 0; w < 3; w++) {
    const confA = CONFERENCES[w % 4]!;
    const confB = CONFERENCES[(w + 1) % 4]!;
    const confC = CONFERENCES[(w + 2) % 4]!;
    const confD = CONFERENCES[(w + 3) % 4]!;
    for (const [x, y] of [[confA, confB], [confC, confD]] as const) {
      const xs = teams.filter((t) => t.conference === x);
      const ys = teams.filter((t) => t.conference === y);
      for (let i = 0; i < 8; i++) {
        games.push(playGame(season, 8 + w, 'regular', xs[i]!, ys[(i + w) % 8]!, 'nonconf', false, rand));
      }
    }
  }

  // Week 11: half the league hosts an FCS tune-up (I=5 tier).
  for (const t of teams.filter((_, i) => i % 2 === 0)) {
    games.push(playGame(season, 11, 'regular', t, fcs, 'fcs', false, rand));
  }

  const winsOf = new Map<number, number>(teams.map((t) => [t.id, 0]));
  for (const g of games) {
    const winner = g.homePoints > g.awayPoints ? g.homeId : g.awayId;
    if (winner !== FCS_TEAM_ID) winsOf.set(winner, (winsOf.get(winner) ?? 0) + 1);
  }
  const standings = (conf: string) =>
    teams
      .filter((t) => t.conference === conf)
      .sort((a, b) => (winsOf.get(b.id)! - winsOf.get(a.id)!) || b.strength - a.strength);

  // Week 12: conference championship games.
  const champs: DemoTeam[] = [];
  for (const conf of CONFERENCES) {
    const [one, two] = standings(conf);
    const g = playGame(season, 12, 'regular', one!, two!, 'ccg', true, rand);
    games.push(g);
    champs.push(g.homePoints > g.awayPoints ? one! : two!);
  }

  // 12-team playoff: 4 champs get byes, next 8 by record play a first round.
  const byWins = [...teams].sort(
    (a, b) => (winsOf.get(b.id)! - winsOf.get(a.id)!) || b.strength - a.strength,
  );
  const atLarge = byWins.filter((t) => !champs.includes(t)).slice(0, 8);
  const field = [...champs, ...atLarge];
  let alive = [...atLarge];
  const rounds: Array<{ week: number; type: GameType }> = [
    { week: 1, type: 'cfpR1' },
    { week: 2, type: 'cfpQfSf' },
    { week: 3, type: 'cfpQfSf' },
    { week: 4, type: 'natty' },
  ];
  for (const { week, type } of rounds) {
    if (type === 'cfpQfSf' && week === 2) alive = [...champs, ...alive]; // byes enter at quarters
    const next: DemoTeam[] = [];
    for (let i = 0; i < alive.length; i += 2) {
      const g = playGame(season, week, 'postseason', alive[i]!, alive[i + 1]!, type, true, rand);
      games.push(g);
      next.push(g.homePoints > g.awayPoints ? alive[i]! : alive[i + 1]!);
    }
    alive = next;
  }

  // A couple of consolation bowls for the best teams left out (I=15 tier).
  const bowlers = byWins.filter((t) => !field.includes(t)).slice(0, 4);
  for (let i = 0; i + 1 < bowlers.length; i += 2) {
    games.push(playGame(season, 1, 'postseason', bowlers[i]!, bowlers[i + 1]!, 'bowl', true, rand));
  }

  // Synthetic committee/AP poll: rank by wins, then true strength.
  const top25 = byWins.slice(0, 25).map((t, i) => ({ teamId: t.id, school: t.school, rank: i + 1 }));
  const polls: PollWeek[] = [
    {
      season,
      week: 12,
      seasonType: 'regular',
      polls: [
        { poll: 'Playoff Committee Rankings', ranks: top25 },
        { poll: 'AP Top 25', ranks: top25 },
      ],
    },
  ];

  const publicTeams: Team[] = teams.map(({ id, school, conference }) => ({ id, school, conference }));
  return { season, teams: publicTeams, games, polls };
}

const rand = rng(20260703);
const teams = makeTeams(rand);
await mkdir(new URL('../data/seasons/', import.meta.url), { recursive: true });
for (const season of [2098, 2099]) {
  // Small strength drift between seasons (roster turnover).
  if (season !== 2098) {
    for (const t of teams) t.strength += (rand() + rand() - 1) * 120;
  }
  const data = makeSeason(season, teams, rand);
  await writeFile(
    new URL(`../data/seasons/${season}.json`, import.meta.url),
    JSON.stringify(data, null, 1),
  );
  console.log(`wrote data/seasons/${season}.json (${data.games.length} games)`);
}
