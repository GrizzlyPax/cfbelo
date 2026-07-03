import { describe, expect, it } from 'vitest';
import type { CfbdGame } from '../data/cfbd';
import { classifyGame, normalizeGame } from '../data/normalize';
import { FCS_TEAM_ID } from '../engine/types';

function raw(overrides: Partial<CfbdGame> = {}): CfbdGame {
  return {
    id: 401,
    season: 2024,
    week: 5,
    seasonType: 'regular',
    startDate: '2024-10-05T19:00:00.000Z',
    neutralSite: false,
    conferenceGame: false,
    completed: true,
    notes: null,
    homeId: 100,
    homeTeam: 'Georgia',
    homeClassification: 'fbs',
    homeConference: 'SEC',
    homePoints: 31,
    awayId: 200,
    awayTeam: 'Clemson',
    awayClassification: 'fbs',
    awayConference: 'ACC',
    awayPoints: 10,
    ...overrides,
  };
}

describe('classifyGame', () => {
  it('classifies FCS games regardless of other flags', () => {
    expect(classifyGame(raw({ awayClassification: 'fcs', conferenceGame: false }))).toBe('fcs');
  });

  it('classifies CFP rounds from notes', () => {
    const cfp = (notes: string) => classifyGame(raw({ seasonType: 'postseason', notes }));
    expect(cfp('College Football Playoff First Round')).toBe('cfpR1');
    expect(cfp('College Football Playoff Quarterfinal - Rose Bowl')).toBe('cfpQfSf');
    expect(cfp('College Football Playoff Semifinal - Sugar Bowl')).toBe('cfpQfSf');
    expect(cfp('College Football Playoff National Championship')).toBe('natty');
  });

  it('classifies conference championships in either seasonType', () => {
    expect(classifyGame(raw({ conferenceGame: true, notes: 'Big Ten Championship', week: 14 }))).toBe('ccg');
    expect(
      classifyGame(raw({ seasonType: 'postseason', conferenceGame: true, notes: 'SEC Championship Game' })),
    ).toBe('ccg');
  });

  it('classifies non-CFP postseason as bowls', () => {
    expect(classifyGame(raw({ seasonType: 'postseason', notes: 'Fiesta Bowl' }))).toBe('bowl');
  });

  it('classifies rivalry, conference, and non-conference regular season games', () => {
    expect(classifyGame(raw({ homeTeam: 'Michigan', awayTeam: 'Ohio State', conferenceGame: true }))).toBe('rivalry');
    expect(classifyGame(raw({ conferenceGame: true }))).toBe('conf');
    expect(classifyGame(raw())).toBe('nonconf');
  });
});

describe('normalizeGame', () => {
  it('drops incomplete games and ties', () => {
    expect(normalizeGame(raw({ completed: false }))).toBeNull();
    expect(normalizeGame(raw({ homePoints: null }))).toBeNull();
    expect(normalizeGame(raw({ homePoints: 21, awayPoints: 21 }))).toBeNull();
  });

  it('pools FCS opponents into the synthetic entity by default', () => {
    const g = normalizeGame(raw({ awayClassification: 'fcs', awayTeam: 'Mercer' }))!;
    expect(g.awayId).toBe(FCS_TEAM_ID);
    expect(g.awayTeam).toBe('FCS');
    expect(g.gameType).toBe('fcs');
  });

  it('keeps FCS programs individual when configured', () => {
    const g = normalizeGame(raw({ awayClassification: 'fcs' }), { trackFcsIndividually: true })!;
    expect(g.awayId).toBe(200);
    expect(g.gameType).toBe('fcs'); // still the low-importance tier
  });

  it('drops FCS vs FCS games entirely', () => {
    expect(normalizeGame(raw({ homeClassification: 'fcs', awayClassification: 'fcs' }))).toBeNull();
  });
});
