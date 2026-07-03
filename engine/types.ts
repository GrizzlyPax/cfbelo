/**
 * Core domain types. The engine is pure: it consumes these immutable
 * structures and never performs I/O.
 */

/** Importance tier a game falls into. Drives the I multiplier (FIFA SUM). */
export type GameType =
  | 'fcs' // regular season vs an FCS opponent
  | 'nonconf' // non-conference regular season (FBS vs FBS)
  | 'conf' // conference regular season
  | 'rivalry' // protected rivalry / rivalry-week game
  | 'ccg' // conference championship game
  | 'cfpR1' // CFP first round
  | 'cfpQfSf' // CFP quarterfinal or semifinal
  | 'natty' // national championship
  | 'bowl'; // non-CFP bowl

export const GAME_TYPES: readonly GameType[] = [
  'fcs',
  'nonconf',
  'conf',
  'rivalry',
  'ccg',
  'cfpR1',
  'cfpQfSf',
  'natty',
  'bowl',
];

/**
 * Synthetic team id for the pooled-FCS entity. Its rating is pinned to
 * RuleConfig.fcsRating and never updated by the season runner.
 */
export const FCS_TEAM_ID = -1;

export type SeasonType = 'regular' | 'postseason';

/** A completed game, normalized from CFBD and keyed on numeric team ids. */
export interface Game {
  id: number;
  season: number;
  week: number;
  seasonType: SeasonType;
  /** ISO 8601 kickoff time; games are processed in this order. */
  startDate: string;
  neutralSite: boolean;
  conferenceGame: boolean;
  gameType: GameType;
  homeId: number;
  homeTeam: string;
  homePoints: number;
  awayId: number;
  awayTeam: string;
  awayPoints: number;
}

export interface Team {
  id: number;
  school: string;
  conference: string | null;
}

export interface PollRank {
  teamId: number;
  school: string;
  rank: number;
}

export interface Poll {
  /** e.g. 'AP Top 25', 'Playoff Committee Rankings', 'Coaches Poll' */
  poll: string;
  ranks: PollRank[];
}

export interface PollWeek {
  season: number;
  week: number;
  seasonType: SeasonType;
  polls: Poll[];
}

/** One committed season file under data/seasons/. */
export interface SeasonData {
  season: number;
  teams: Team[];
  games: Game[];
  polls: PollWeek[];
}

/** Ratings are a plain map: team id -> rating points. */
export type Ratings = Map<number, number>;
