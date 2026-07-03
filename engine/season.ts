import type { RuleConfig } from './config';
import { updateForGame, type GameUpdate } from './ratings';
import { FCS_TEAM_ID, type Game, type Ratings, type SeasonData, type SeasonType, type Team } from './types';

/** One game's full audit trail: pregame state, prediction, and deltas. */
export interface GameRecord extends GameUpdate {
  game: Game;
  homeRatingBefore: number;
  awayRatingBefore: number;
}

/** Ratings frozen at the end of each (seasonType, week) bucket. */
export interface WeeklySnapshot {
  season: number;
  seasonType: SeasonType;
  week: number;
  ratings: Ratings;
}

export interface SeasonRun {
  season: number;
  records: GameRecord[];
  snapshots: WeeklySnapshot[];
  finalRatings: Ratings;
}

function ratingOf(ratings: Ratings, teamId: number, config: RuleConfig): number {
  if (teamId === FCS_TEAM_ID) return config.fcsRating;
  return ratings.get(teamId) ?? config.initialRating;
}

/** Chronological order; postseason after regular season, then by week/date. */
export function sortGames(games: Game[]): Game[] {
  return [...games].sort((a, b) => {
    if (a.seasonType !== b.seasonType) return a.seasonType === 'regular' ? -1 : 1;
    if (a.week !== b.week) return a.week - b.week;
    if (a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1;
    return a.id - b.id;
  });
}

/**
 * Run one season's game log through the engine. Mutates nothing: takes the
 * entering ratings, returns per-game records, per-week snapshots, and the
 * final ratings. The pooled FCS entity's rating is pinned and never updated.
 */
export function runSeason(seasonData: SeasonData, entering: Ratings, config: RuleConfig): SeasonRun {
  const ratings: Ratings = new Map(entering);
  const records: GameRecord[] = [];
  const snapshots: WeeklySnapshot[] = [];
  const games = sortGames(seasonData.games);

  let bucket: { seasonType: SeasonType; week: number } | null = null;
  const closeBucket = () => {
    if (bucket === null) return;
    snapshots.push({
      season: seasonData.season,
      seasonType: bucket.seasonType,
      week: bucket.week,
      ratings: new Map(ratings),
    });
  };

  for (const game of games) {
    if (bucket === null || bucket.seasonType !== game.seasonType || bucket.week !== game.week) {
      closeBucket();
      bucket = { seasonType: game.seasonType, week: game.week };
    }
    const homeRatingBefore = ratingOf(ratings, game.homeId, config);
    const awayRatingBefore = ratingOf(ratings, game.awayId, config);
    const update = updateForGame(homeRatingBefore, awayRatingBefore, game, config);
    if (game.homeId !== FCS_TEAM_ID) ratings.set(game.homeId, homeRatingBefore + update.homeDelta);
    if (game.awayId !== FCS_TEAM_ID) ratings.set(game.awayId, awayRatingBefore + update.awayDelta);
    records.push({ game, homeRatingBefore, awayRatingBefore, ...update });
  }
  closeBucket();

  return { season: seasonData.season, records, snapshots, finalRatings: ratings };
}

/** Flat seed: every team starts at the configured initial rating. */
export function flatSeed(teams: Team[], config: RuleConfig): Ratings {
  return new Map(teams.map((t) => [t.id, config.initialRating]));
}

/**
 * Between-season reversion: pull each rating `reversionFraction` of the way
 * toward the target mean ('global' = one shared mean, 'conference' = each
 * team's conference mean) to model roster turnover.
 */
export function applyReversion(
  ratings: Ratings,
  config: RuleConfig,
  conferenceOf: (teamId: number) => string | null,
): Ratings {
  const f = config.reversionFraction;
  if (f <= 0) return new Map(ratings);

  const targetFor = (teamId: number): number => {
    if (config.reversionTarget === 'conference') {
      const conf = conferenceOf(teamId);
      if (conf !== null) {
        const members = [...ratings.entries()].filter(([id]) => conferenceOf(id) === conf);
        if (members.length > 0) {
          return members.reduce((sum, [, r]) => sum + r, 0) / members.length;
        }
      }
    }
    return config.initialRating;
  };

  return new Map(
    [...ratings.entries()].map(([id, r]) => [id, r + f * (targetFor(id) - r)]),
  );
}

export interface BacktestResult {
  config: RuleConfig;
  /** One run per season, in chronological order (burn-in seasons included). */
  runs: SeasonRun[];
}

/**
 * Run a sequence of seasons through the engine, applying between-season
 * reversion, carrying ratings forward. Teams appearing for the first time
 * (new FBS members) enter at the initial rating.
 */
export function runBacktest(seasons: SeasonData[], config: RuleConfig): BacktestResult {
  const ordered = [...seasons].sort((a, b) => a.season - b.season);
  const runs: SeasonRun[] = [];
  let ratings: Ratings = new Map();

  for (const seasonData of ordered) {
    if (runs.length === 0) {
      ratings = flatSeed(seasonData.teams, config);
    } else {
      const confByTeam = new Map(seasonData.teams.map((t) => [t.id, t.conference]));
      ratings = applyReversion(ratings, config, (id) => confByTeam.get(id) ?? null);
      for (const team of seasonData.teams) {
        if (!ratings.has(team.id)) ratings.set(team.id, config.initialRating);
      }
    }
    const run = runSeason(seasonData, ratings, config);
    runs.push(run);
    ratings = run.finalRatings;
  }

  return { config, runs };
}

/** Top-N teams by rating, excluding the synthetic FCS entity. */
export function topN(ratings: Ratings, n: number): Array<{ teamId: number; rating: number }> {
  return [...ratings.entries()]
    .filter(([id]) => id !== FCS_TEAM_ID)
    .map(([teamId, rating]) => ({ teamId, rating }))
    .sort((a, b) => b.rating - a.rating || a.teamId - b.teamId)
    .slice(0, n);
}
