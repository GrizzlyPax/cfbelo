import { describe, expect, it } from 'vitest';
import { agreementScorecard, predictiveScorecard, spearmanCorrelation } from '../engine/metrics';
import type { GameRecord } from '../engine/season';
import type { Game } from '../engine/types';

function record(homeWinProb: number, homeWon: boolean, homeDr = 0, margin = homeWon ? 7 : -7): GameRecord {
  const game: Game = {
    id: 1,
    season: 2099,
    week: 1,
    seasonType: 'regular',
    startDate: '2099-09-01T19:00:00.000Z',
    neutralSite: true,
    conferenceGame: false,
    gameType: 'nonconf',
    homeId: 1,
    homeTeam: 'A',
    homePoints: margin > 0 ? 20 + margin : 20,
    awayId: 2,
    awayTeam: 'B',
    awayPoints: margin > 0 ? 20 : 20 - margin,
  };
  return {
    game,
    homeRatingBefore: 1500,
    awayRatingBefore: 1500,
    homeWinProb,
    homeDr,
    importance: 15,
    homeDelta: 0,
    awayDelta: 0,
  };
}

describe('predictiveScorecard', () => {
  it('perfect confident predictions score ~0 Brier and log loss', () => {
    const s = predictiveScorecard([record(1, true), record(0, false)]);
    expect(s.brier).toBeCloseTo(0, 8);
    expect(s.logLoss).toBeCloseTo(0, 6);
    expect(s.pickAccuracy).toBe(1);
  });

  it('coin-flip predictions score Brier 0.25 and pick accuracy 0.5', () => {
    const s = predictiveScorecard([record(0.5, true), record(0.5, false)]);
    expect(s.brier).toBeCloseTo(0.25, 10);
    expect(s.pickAccuracy).toBe(0.5); // half credit each
  });

  it('calibrates points-per-rating by least squares and reports spread MAE', () => {
    // dr 100 -> margin 4, dr 200 -> margin 8: exactly 0.04 points per rating point.
    const s = predictiveScorecard([
      record(0.6, true, 100, 4),
      record(0.7, true, 200, 8),
    ]);
    expect(s.pointsPerRating).toBeCloseTo(0.04, 10);
    expect(s.spreadMae).toBeCloseTo(0, 10);
  });

  it('handles the empty case', () => {
    expect(predictiveScorecard([]).games).toBe(0);
  });
});

describe('spearmanCorrelation', () => {
  it('is 1 for identical rankings and -1 for reversed', () => {
    expect(spearmanCorrelation([1, 2, 3, 4], [1, 2, 3, 4])).toBeCloseTo(1);
    expect(spearmanCorrelation([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1);
  });
});

describe('agreementScorecard', () => {
  it('perfect agreement: overlap 1, spearman 1, empty field diff', () => {
    const ranking = [10, 20, 30, 40, 50];
    const s = agreementScorecard(ranking, ranking, 2);
    expect(s.top25Overlap).toBe(1);
    expect(s.spearman).toBeCloseTo(1);
    expect(s.fieldDiff.inConfigOnly).toEqual([]);
  });

  it('surfaces playoff-field differences ("your config puts X in")', () => {
    const config = [10, 20, 30, 40];
    const committee = [10, 20, 40, 99];
    const s = agreementScorecard(config, committee, 3);
    expect(s.fieldDiff.inConfigOnly).toEqual([30]);
    expect(s.fieldDiff.inReferenceOnly).toEqual([40]);
  });

  it('overlap counts config top-N teams present anywhere in the reference', () => {
    const s = agreementScorecard([1, 2, 3, 4], [4, 3, 2, 1], 4);
    expect(s.top25Overlap).toBe(1);
    expect(s.spearman).toBeCloseTo(-1);
  });
});
