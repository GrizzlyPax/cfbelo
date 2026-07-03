import { describe, expect, it } from 'vitest';
import { PRESETS, type RuleConfig } from '../engine/config';
import { expectedScore, movMultiplier, updateForGame } from '../engine/ratings';
import type { Game } from '../engine/types';

const fifa = PRESETS.fifa!;

function game(overrides: Partial<Game> = {}): Game {
  return {
    id: 1,
    season: 2024,
    week: 5,
    seasonType: 'regular',
    startDate: '2024-10-05T19:00:00.000Z',
    neutralSite: false,
    conferenceGame: true,
    gameType: 'conf',
    homeId: 10,
    homeTeam: 'Home U',
    homePoints: 28,
    awayId: 20,
    awayTeam: 'Away State',
    awayPoints: 21,
    ...overrides,
  };
}

describe('expectedScore (FIFA SUM W_e)', () => {
  it('is 0.5 for equal ratings', () => {
    expect(expectedScore(0, 600)).toBe(0.5);
  });

  it('matches the FIFA formula: dr=100, divisor 600 -> ~0.5948', () => {
    // 1 / (10^(-100/600) + 1) = 1 / 1.681292...
    expect(expectedScore(100, 600)).toBeCloseTo(0.59478, 4);
  });

  it('is symmetric: W_e(dr) + W_e(-dr) = 1', () => {
    expect(expectedScore(250, 600) + expectedScore(-250, 600)).toBeCloseTo(1, 12);
  });

  it('chess divisor 400: dr=400 -> 10/11', () => {
    expect(expectedScore(400, 400)).toBeCloseTo(10 / 11, 10);
  });
});

describe('movMultiplier (eloratings.net)', () => {
  it('is 1 for one-score-of-one wins', () => {
    expect(movMultiplier(1)).toBe(1);
    expect(movMultiplier(-1)).toBe(1);
  });
  it('is 1.5 for two-point wins', () => {
    expect(movMultiplier(2)).toBe(1.5);
  });
  it('is (11+N)/8 for N >= 3', () => {
    expect(movMultiplier(3)).toBeCloseTo(1.75);
    expect(movMultiplier(-5)).toBeCloseTo(2);
    expect(movMultiplier(21)).toBeCloseTo(4);
  });
});

describe('updateForGame', () => {
  it('FIFA worked example: favorite wins a conference game (I=25)', () => {
    // home 1500 vs away 1400 (no home bonus in fifa preset):
    // W_e = 0.59478, delta = 25 * (1 - 0.59478) = 10.130
    const u = updateForGame(1500, 1400, game(), fifa);
    expect(u.homeWinProb).toBeCloseTo(0.59478, 4);
    expect(u.importance).toBe(25);
    expect(u.homeDelta).toBeCloseTo(10.13, 2);
    expect(u.awayDelta).toBeCloseTo(-10.13, 2);
  });

  it('upset gives a bigger swing, and points are zero-sum without immunity', () => {
    const u = updateForGame(1400, 1600, game(), fifa);
    // underdog home wins: delta = 25 * (1 - W_e(-200))
    expect(u.homeDelta).toBeGreaterThan(12.5);
    expect(u.homeDelta + u.awayDelta).toBeCloseTo(0, 12);
  });

  it('uses the importance tier of the game type', () => {
    const natty = updateForGame(1500, 1500, game({ gameType: 'natty', neutralSite: true }), fifa);
    expect(natty.importance).toBe(60);
    expect(natty.homeDelta).toBeCloseTo(30, 10); // 60 * (1 - 0.5)
  });

  it('flat K ignores tiers', () => {
    const chaos = PRESETS.chaos!;
    const u = updateForGame(1500, 1500, game({ gameType: 'natty', neutralSite: true }), chaos);
    expect(u.importance).toBe(chaos.flatK);
  });

  it('knockout immunity: CFP loser cannot lose points, winner still gains', () => {
    const u = updateForGame(1600, 1500, game({ gameType: 'cfpQfSf', neutralSite: true, homePoints: 17, awayPoints: 24 }), fifa);
    expect(u.homeDelta).toBe(0); // favored home team lost but is protected
    expect(u.awayDelta).toBeGreaterThan(0);
  });

  it('knockout immunity respects the CCG toggle', () => {
    const ccgGame = game({ gameType: 'ccg', neutralSite: true, homePoints: 17, awayPoints: 24 });
    const withImmunity = updateForGame(1600, 1500, ccgGame, fifa);
    expect(withImmunity.homeDelta).toBe(0);

    const noCcgImmunity: RuleConfig = { ...fifa, knockoutImmunityCcg: false };
    const without = updateForGame(1600, 1500, ccgGame, noCcgImmunity);
    expect(without.homeDelta).toBeLessThan(0);
  });

  it('home bonus shifts dr only for non-neutral games', () => {
    const classic = PRESETS['classic-elo']!;
    const home = updateForGame(1500, 1500, game({ gameType: 'conf' }), classic);
    expect(home.homeDr).toBe(classic.homeBonus);
    const neutral = updateForGame(1500, 1500, game({ gameType: 'conf', neutralSite: true }), classic);
    expect(neutral.homeDr).toBe(0);
  });

  it('MOV multiplier scales the update in classic mode', () => {
    const classic = PRESETS['classic-elo']!;
    const close = updateForGame(1500, 1500, game({ homePoints: 21, awayPoints: 20 }), classic);
    const blowout = updateForGame(1500, 1500, game({ homePoints: 49, awayPoints: 7 }), classic);
    // win by 42 -> (11+42)/8 = 6.625x the one-point win
    expect(blowout.homeDelta / close.homeDelta).toBeCloseTo(6.625, 10);
  });
});
