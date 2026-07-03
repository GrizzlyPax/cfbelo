import { describe, expect, it } from 'vitest';
import { PRESETS } from '../engine/config';
import { applyReversion, flatSeed, runBacktest, runSeason, topN } from '../engine/season';
import { FCS_TEAM_ID, type Game, type SeasonData } from '../engine/types';

const fifa = PRESETS.fifa!;

const TEAMS = [
  { id: 1, school: 'Alpha', conference: 'East' },
  { id: 2, school: 'Beta', conference: 'East' },
  { id: 3, school: 'Gamma', conference: 'West' },
];

let gid = 100;
function game(homeId: number, awayId: number, homePoints: number, awayPoints: number, overrides: Partial<Game> = {}): Game {
  return {
    id: gid++,
    season: 2099,
    week: 1,
    seasonType: 'regular',
    startDate: '2099-09-01T19:00:00.000Z',
    neutralSite: true,
    conferenceGame: false,
    gameType: 'nonconf',
    homeId,
    homeTeam: `#${homeId}`,
    homePoints,
    awayId,
    awayTeam: `#${awayId}`,
    awayPoints,
    ...overrides,
  };
}

function seasonData(games: Game[]): SeasonData {
  return { season: 2099, teams: TEAMS, games, polls: [] };
}

describe('runSeason', () => {
  it('applies updates and conserves points in non-knockout games', () => {
    const entering = flatSeed(TEAMS, fifa);
    const run = runSeason(seasonData([game(1, 2, 28, 21)]), entering, fifa);
    const alpha = run.finalRatings.get(1)!;
    const beta = run.finalRatings.get(2)!;
    expect(alpha).toBeCloseTo(1500 + 7.5, 10); // I=15, W_e=0.5 -> +7.5
    expect(beta).toBeCloseTo(1500 - 7.5, 10);
    expect(run.finalRatings.get(3)).toBe(1500); // idle team untouched
  });

  it('pins the pooled FCS entity at the configured rating', () => {
    const entering = flatSeed(TEAMS, fifa);
    const games = [
      game(1, FCS_TEAM_ID, 45, 3, { gameType: 'fcs' }),
      game(2, FCS_TEAM_ID, 20, 24, { gameType: 'fcs', week: 2 }),
    ];
    const run = runSeason(seasonData(games), entering, fifa);
    expect(run.finalRatings.has(FCS_TEAM_ID)).toBe(false);
    // Alpha beat a 1100-rated opponent from 1500: small gain.
    expect(run.finalRatings.get(1)!).toBeGreaterThan(1500);
    expect(run.finalRatings.get(1)! - 1500).toBeLessThan(2);
    // Beta LOST to FCS: big drop (I=5 caps it, but W_e was ~0.82).
    expect(run.finalRatings.get(2)!).toBeLessThan(1500);
    // Second game's record must see FCS still at 1100, not updated.
    expect(run.records[1]!.awayRatingBefore).toBe(fifa.fcsRating);
  });

  it('processes games chronologically and snapshots per week', () => {
    const games = [
      game(1, 2, 21, 14, { week: 2 }),
      game(1, 3, 21, 14, { week: 1 }),
    ];
    const run = runSeason(seasonData(games), flatSeed(TEAMS, fifa), fifa);
    expect(run.records[0]!.game.week).toBe(1);
    expect(run.snapshots).toHaveLength(2);
    // Week-1 snapshot must not include the week-2 result.
    expect(run.snapshots[0]!.ratings.get(2)).toBe(1500);
    // Week-2 game sees Alpha's rating after week 1.
    expect(run.records[1]!.homeRatingBefore).toBeGreaterThan(1500);
  });

  it('postseason weeks sort after regular-season weeks of higher number', () => {
    const games = [
      game(1, 2, 21, 14, { week: 1, seasonType: 'postseason', gameType: 'natty' }),
      game(1, 3, 21, 14, { week: 13 }),
    ];
    const run = runSeason(seasonData(games), flatSeed(TEAMS, fifa), fifa);
    expect(run.records[0]!.game.seasonType).toBe('regular');
  });
});

describe('applyReversion', () => {
  it('pulls ratings toward the global mean by the configured fraction', () => {
    const ratings = new Map([[1, 1800], [2, 1200]]);
    const reverted = applyReversion(ratings, { ...fifa, reversionFraction: 0.5 }, () => null);
    expect(reverted.get(1)).toBeCloseTo(1650); // halfway to 1500
    expect(reverted.get(2)).toBeCloseTo(1350);
  });

  it('conference target uses the conference mean', () => {
    const ratings = new Map([[1, 1800], [2, 1600], [3, 1000]]);
    const conf = (id: number) => (id === 3 ? 'West' : 'East');
    const reverted = applyReversion(
      ratings,
      { ...fifa, reversionFraction: 1, reversionTarget: 'conference' },
      conf,
    );
    expect(reverted.get(1)).toBeCloseTo(1700); // East mean
    expect(reverted.get(2)).toBeCloseTo(1700);
    expect(reverted.get(3)).toBeCloseTo(1000); // alone in conference: mean is itself
  });

  it('fraction 0 is a no-op', () => {
    const ratings = new Map([[1, 1800]]);
    expect(applyReversion(ratings, { ...fifa, reversionFraction: 0 }, () => null).get(1)).toBe(1800);
  });
});

describe('runBacktest', () => {
  it('carries ratings across seasons with reversion, seeding new teams flat', () => {
    const s1 = seasonData([game(1, 2, 35, 7)]);
    const s2: SeasonData = {
      season: 2100,
      teams: [...TEAMS, { id: 4, school: 'Delta', conference: 'West' }],
      games: [game(3, 4, 21, 20, { season: 2100 })],
      polls: [],
    };
    const { runs } = runBacktest([s2, s1], fifa); // order shouldn't matter
    expect(runs[0]!.season).toBe(2099);
    const entering1 = runs[1]!.records[0]!.homeRatingBefore;
    expect(entering1).toBe(1500); // Gamma idle in 2099, reverts to 1500
    // Alpha's 2099 gain persists into 2100, shrunk by reversion.
    const alpha2100 = runs[1]!.snapshots[0]!.ratings.get(1)!;
    expect(alpha2100).toBeGreaterThan(1500);
    expect(alpha2100).toBeLessThan(runs[0]!.finalRatings.get(1)!);
  });
});

describe('topN', () => {
  it('excludes the FCS entity and breaks ties by id', () => {
    const ratings = new Map([[FCS_TEAM_ID, 9999], [1, 1600], [2, 1600], [3, 1500]]);
    const top = topN(ratings, 2);
    expect(top.map((t) => t.teamId)).toEqual([1, 2]);
  });
});
