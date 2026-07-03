import type { RuleConfig } from './config';
import type { Game, GameType } from './types';

/**
 * FIFA SUM expected score:  W_e = 1 / (10^(-dr/divisor) + 1)
 * dr = own rating - opponent rating (plus home bonus when applicable).
 * Identical in shape to chess Elo; FIFA uses divisor 600 instead of 400.
 */
export function expectedScore(dr: number, divisor: number): number {
  return 1 / (Math.pow(10, -dr / divisor) + 1);
}

/**
 * eloratings.net margin-of-victory multiplier (classic mode only):
 *   win by 0–1  -> 1
 *   win by 2    -> 1.5
 *   win by N>=3 -> (11 + N) / 8
 */
export function movMultiplier(pointDiff: number): number {
  const d = Math.abs(pointDiff);
  if (d <= 1) return 1;
  if (d === 2) return 1.5;
  return (11 + d) / 8;
}

const KNOCKOUT_CFP: ReadonlySet<GameType> = new Set(['cfpR1', 'cfpQfSf', 'natty']);

/** Is this a game where the loser's update gets clamped at zero? */
export function isKnockoutProtected(gameType: GameType, config: RuleConfig): boolean {
  if (KNOCKOUT_CFP.has(gameType)) return config.knockoutImmunityCfp;
  if (gameType === 'ccg') return config.knockoutImmunityCcg;
  return false;
}

export interface GameUpdate {
  /** Pregame expected score for the home team — usable as a win probability. */
  homeWinProb: number;
  /** dr from the home team's perspective, including any home bonus. */
  homeDr: number;
  /** Importance actually applied (tier I, or flat K). */
  importance: number;
  homeDelta: number;
  awayDelta: number;
}

/**
 * Compute both teams' rating updates for one completed game.
 * Pure function: P_new = P_before + I * mov * (W - W_e), with the loser's
 * delta clamped at zero in knockout-protected games.
 */
export function updateForGame(
  homeRating: number,
  awayRating: number,
  game: Game,
  config: RuleConfig,
): GameUpdate {
  const homeDr = homeRating - awayRating + (game.neutralSite ? 0 : config.homeBonus);
  const homeWinProb = expectedScore(homeDr, config.divisor);
  const homeWon = game.homePoints > game.awayPoints;

  const importance = config.useImportanceTiers ? config.importance[game.gameType] : config.flatK;
  const mov = config.movEnabled ? movMultiplier(game.homePoints - game.awayPoints) : 1;

  // Each side's update uses its own W and W_e; they are symmetric, so the
  // away delta is the negation of the home delta until immunity applies.
  let homeDelta = importance * mov * ((homeWon ? 1 : 0) - homeWinProb);
  let awayDelta = -homeDelta;

  if (isKnockoutProtected(game.gameType, config)) {
    if (homeWon) awayDelta = Math.max(0, awayDelta);
    else homeDelta = Math.max(0, homeDelta);
  }

  return { homeWinProb, homeDr, importance, homeDelta, awayDelta };
}
