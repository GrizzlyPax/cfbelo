import { describe, expect, it } from 'vitest';
import type { CfbdGame } from '../data/cfbd';
import { classifyGame, normalizeGame, refineGameTypes } from '../data/normalize';
import { FCS_TEAM_ID, type Game, type PollWeek, type Team } from '../engine/types';

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

  it('catches 2014-style semifinal notes without a CFP prefix', () => {
    expect(
      classifyGame(raw({ seasonType: 'postseason', notes: 'ALLSTATE SUGAR BOWL - SEMIFINAL' })),
    ).toBe('cfpQfSf');
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

describe('refineGameTypes', () => {
  const TEAMS: Team[] = [
    { id: 1, school: 'A1', conference: 'Alpha' },
    { id: 2, school: 'A2', conference: 'Alpha' },
    { id: 3, school: 'A3', conference: 'Alpha' },
    { id: 4, school: 'B1', conference: 'Beta' },
    { id: 5, school: 'B2', conference: 'Beta' },
    { id: 6, school: 'A4', conference: 'Alpha' },
    { id: 7, school: 'B3', conference: 'Beta' },
    { id: 8, school: 'B4', conference: 'Beta' },
    { id: 9, school: 'Army', conference: 'Beta' },
    { id: 10, school: 'Navy', conference: 'Beta' },
    { id: 11, school: 'I1', conference: 'FBS Independents' },
    { id: 12, school: 'I2', conference: 'FBS Independents' },
    { id: 13, school: 'I3', conference: 'FBS Independents' },
    { id: 14, school: 'I4', conference: 'FBS Independents' },
    { id: 15, school: 'P1', conference: 'Tiny' },
    { id: 16, school: 'P2', conference: 'Tiny' },
  ];

  let id = 500;
  function g(homeId: number, awayId: number, overrides: Partial<Game> = {}): Game {
    return {
      id: id++,
      season: 2019,
      week: 14,
      seasonType: 'regular',
      startDate: '2019-12-07T19:00:00.000Z',
      neutralSite: false,
      conferenceGame: true,
      gameType: 'conf',
      homeId,
      homeTeam: `#${homeId}`,
      homePoints: 24,
      awayId,
      awayTeam: `#${awayId}`,
      awayPoints: 17,
      ...overrides,
    };
  }

  it('promotes a lone final-week conference game to CCG', () => {
    const games = [g(1, 2, { week: 14 }), g(2, 3, { week: 14 }), g(1, 3, { week: 15, neutralSite: true })];
    const refined = refineGameTypes(games, TEAMS, []);
    expect(refined.map((x) => x.gameType)).toEqual(['conf', 'conf', 'ccg']);
  });

  it('breaks final-week ties by the unique neutral-site game (2021 Pac-12 case)', () => {
    const games = [g(1, 2, { week: 14, neutralSite: true }), g(2, 3, { week: 14 })];
    const refined = refineGameTypes(games, TEAMS, []);
    expect(refined[0]!.gameType).toBe('ccg');
    expect(refined[1]!.gameType).toBe('conf');
  });

  it('leaves round-robin finales alone (pre-2017 Big 12: full last week, no neutral game)', () => {
    const games = [g(1, 2, { week: 14 }), g(2, 3, { week: 14 }), g(1, 3, { week: 14 })];
    expect(refineGameTypes(games, TEAMS, []).every((x) => x.gameType === 'conf')).toBe(true);
  });

  it('skips conferences that already have a notes-detected CCG', () => {
    const games = [g(1, 2, { week: 14, gameType: 'ccg' }), g(2, 3, { week: 15 })];
    const refined = refineGameTypes(games, TEAMS, []);
    expect(refined[1]!.gameType).toBe('conf');
  });

  it('ignores early-season weeks and cross-conference games', () => {
    const games = [g(1, 2, { week: 10 }), g(1, 4, { week: 15, conferenceGame: false, gameType: 'nonconf' })];
    const refined = refineGameTypes(games, TEAMS, []);
    expect(refined.map((x) => x.gameType)).toEqual(['conf', 'nonconf']);
  });

  it('uses the teams table, not the conferenceGame flag (2025 CCGs are flagged nonconf)', () => {
    const games = [
      g(1, 2, { week: 14 }),
      g(1, 3, { week: 15, conferenceGame: false, gameType: 'nonconf', neutralSite: true }),
    ];
    const refined = refineGameTypes(games, TEAMS, []);
    expect(refined[1]!.gameType).toBe('ccg');
  });

  it('never crowns Army-Navy, Independents, or a sub-4-team conference', () => {
    const games = [
      // Army @ Navy, the week after Beta's CCG week
      g(10, 9, { week: 16, neutralSite: true, gameType: 'rivalry', homeTeam: 'Navy', awayTeam: 'Army' }),
      g(4, 5, { week: 15, neutralSite: true }), // the real Beta CCG
      g(11, 12, { week: 15 }), // lone Independents pairing
      g(15, 16, { week: 15 }), // 2-team league (2025 Pac-12 case)
    ];
    const refined = refineGameTypes(games, TEAMS, []);
    expect(refined.map((x) => x.gameType)).toEqual(['rivalry', 'ccg', 'conf', 'conf']);
  });

  it('applies the 2020 COVID overrides by season and matchup', () => {
    const games = [
      g(11, 4, {
        season: 2020,
        week: 16,
        homeTeam: 'Notre Dame',
        awayTeam: 'Clemson',
        conferenceGame: false,
        gameType: 'nonconf',
        neutralSite: true,
      }),
    ];
    const refined = refineGameTypes(games, TEAMS, []);
    expect(refined[0]!.gameType).toBe('ccg');
  });

  it('upgrades a 4-team-era bowl between final top-4 teams to semifinal', () => {
    const polls: PollWeek[] = [
      {
        season: 2015,
        week: 15,
        seasonType: 'regular',
        polls: [
          {
            poll: 'Playoff Committee Rankings',
            ranks: [1, 2, 3, 4, 5].map((teamId, i) => ({ teamId, school: `#${teamId}`, rank: i + 1 })),
          },
        ],
      },
    ];
    const games = [
      g(1, 4, { season: 2015, seasonType: 'postseason', week: 1, gameType: 'bowl', neutralSite: true }),
      g(2, 5, { season: 2015, seasonType: 'postseason', week: 1, gameType: 'bowl', neutralSite: true }),
      g(1, 2, { season: 2015, seasonType: 'postseason', week: 2, gameType: 'natty', neutralSite: true }),
    ];
    const refined = refineGameTypes(games, TEAMS, polls);
    expect(refined[0]!.gameType).toBe('cfpQfSf'); // 1 vs 4: both top-4
    expect(refined[1]!.gameType).toBe('bowl'); // 2 vs 5: #5 is not in the field
    expect(refined[2]!.gameType).toBe('natty'); // never downgraded
  });

  it('does not apply the top-4 rule in the 12-team era', () => {
    const polls: PollWeek[] = [
      {
        season: 2024,
        week: 15,
        seasonType: 'regular',
        polls: [
          {
            poll: 'Playoff Committee Rankings',
            ranks: [1, 2, 3, 4].map((teamId, i) => ({ teamId, school: `#${teamId}`, rank: i + 1 })),
          },
        ],
      },
    ];
    const games = [g(1, 2, { season: 2024, seasonType: 'postseason', week: 1, gameType: 'bowl', neutralSite: true })];
    expect(refineGameTypes(games, TEAMS, polls)[0]!.gameType).toBe('bowl');
  });
});
