import { FCS_TEAM_ID, type Game, type GameType, type PollWeek, type SeasonData, type SeasonType, type Team } from '../engine/types';
import { isRivalry } from './rivalries';
import type { CfbdGame, CfbdRankingWeek, CfbdTeam } from './cfbd';

/**
 * Raw CFBD -> internal models. Everything is keyed on CFBD numeric team ids;
 * name strings are inconsistent across sources (UConn vs Connecticut, etc.).
 */

export interface NormalizeOptions {
  /** Track FCS programs individually instead of pooling into one entity. */
  trackFcsIndividually?: boolean;
}

/**
 * Classify a game into an importance tier.
 *
 * Heuristics (validated against real data during ingest — see README):
 * - FCS tier: either side is not FBS-classified.
 * - CFP rounds & national championship: notes mention 'College Football
 *   Playoff' plus the round name. Pre-2024 semifinals say 'Semifinal'.
 * - CCG: a conference game whose notes mention 'championship' (CFBD lists
 *   CCGs with notes like 'Big Ten Championship'), whichever seasonType
 *   CFBD filed it under.
 * - Everything else in the postseason is a non-CFP bowl.
 * - Regular season: rivalry list, then conference flag, else non-conference.
 */
export function classifyGame(raw: CfbdGame): GameType {
  const fbs = (c: string | null) => (c ?? '').toLowerCase() === 'fbs';
  if (!fbs(raw.homeClassification) || !fbs(raw.awayClassification)) return 'fcs';

  const notes = (raw.notes ?? '').toLowerCase();
  if (notes.includes('college football playoff') || notes.includes('cfp')) {
    if (notes.includes('national championship')) return 'natty';
    if (notes.includes('first round')) return 'cfpR1';
    if (notes.includes('quarterfinal') || notes.includes('semifinal')) return 'cfpQfSf';
    return 'cfpQfSf';
  }
  if (raw.conferenceGame && notes.includes('championship')) return 'ccg';
  if (raw.seasonType === 'postseason') return 'bowl';

  if (isRivalry(raw.homeTeam, raw.awayTeam)) return 'rivalry';
  return raw.conferenceGame ? 'conf' : 'nonconf';
}

export function normalizeGame(raw: CfbdGame, options: NormalizeOptions = {}): Game | null {
  // Only completed games with scores enter the log.
  if (!raw.completed || raw.homePoints === null || raw.awayPoints === null) return null;
  // Modern CFB has no ties, but guard anyway: the engine has no W=0.5 path yet.
  if (raw.homePoints === raw.awayPoints) return null;

  const gameType = classifyGame(raw);
  const fbs = (c: string | null) => (c ?? '').toLowerCase() === 'fbs';
  // FCS vs FCS games are irrelevant to FBS ratings; drop them.
  if (!fbs(raw.homeClassification) && !fbs(raw.awayClassification)) return null;

  const pool = !options.trackFcsIndividually;
  const poolSide = (id: number, team: string, classification: string | null) =>
    pool && !fbs(classification) ? { id: FCS_TEAM_ID, team: 'FCS' } : { id, team };

  const home = poolSide(raw.homeId, raw.homeTeam, raw.homeClassification);
  const away = poolSide(raw.awayId, raw.awayTeam, raw.awayClassification);

  return {
    id: raw.id,
    season: raw.season,
    week: raw.week,
    seasonType: raw.seasonType === 'postseason' ? 'postseason' : 'regular',
    startDate: raw.startDate,
    neutralSite: raw.neutralSite,
    conferenceGame: raw.conferenceGame,
    gameType,
    homeId: home.id,
    homeTeam: home.team,
    homePoints: raw.homePoints,
    awayId: away.id,
    awayTeam: away.team,
    awayPoints: raw.awayPoints,
  };
}

export function normalizeTeams(raw: CfbdTeam[]): Team[] {
  return raw.map((t) => ({ id: t.id, school: t.school, conference: t.conference }));
}

/** Poll ranks come keyed on school names; resolve to team ids via the team table. */
export function normalizeRankings(raw: CfbdRankingWeek[], teams: Team[]): PollWeek[] {
  const idBySchool = new Map(teams.map((t) => [t.school, t.id]));
  return raw.map((week) => ({
    season: week.season,
    week: week.week,
    seasonType: (week.seasonType === 'postseason' ? 'postseason' : 'regular') as SeasonType,
    polls: week.polls.map((poll) => ({
      poll: poll.poll,
      ranks: poll.ranks
        .map((r) => ({
          teamId: r.teamId ?? idBySchool.get(r.school) ?? -999,
          school: r.school,
          rank: r.rank,
        }))
        .filter((r) => r.teamId !== -999)
        .sort((a, b) => a.rank - b.rank),
    })),
  }));
}

export function buildSeasonData(
  season: number,
  rawGames: CfbdGame[],
  rawTeams: CfbdTeam[],
  rawRankings: CfbdRankingWeek[],
  options: NormalizeOptions = {},
): SeasonData {
  const teams = normalizeTeams(rawTeams);
  const games = rawGames
    .map((g) => normalizeGame(g, options))
    .filter((g): g is Game => g !== null);
  return { season, teams, games, polls: normalizeRankings(rawRankings, teams) };
}
