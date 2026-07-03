import type { GameRecord } from './season';

/**
 * Backtest scorecards. Decided in the design doc: the lab is neutral —
 * predictive accuracy and committee agreement get equal billing, never
 * blended into one score.
 */

export interface PredictiveScorecard {
  games: number;
  brier: number;
  logLoss: number;
  /** Straight-up pick accuracy; a 0.5 forecast earns half credit. */
  pickAccuracy: number;
  /** Least-squares points-per-rating-point calibration (margin ≈ b * dr). */
  pointsPerRating: number;
  /** Mean absolute error of projected spread vs actual margin. */
  spreadMae: number;
}

const EPS = 1e-12;

export function predictiveScorecard(records: GameRecord[]): PredictiveScorecard {
  const n = records.length;
  if (n === 0) {
    return { games: 0, brier: NaN, logLoss: NaN, pickAccuracy: NaN, pointsPerRating: NaN, spreadMae: NaN };
  }

  let brierSum = 0;
  let logLossSum = 0;
  let picks = 0;
  let drMargin = 0;
  let drSq = 0;

  for (const r of records) {
    const outcome = r.game.homePoints > r.game.awayPoints ? 1 : 0;
    const p = Math.min(1 - EPS, Math.max(EPS, r.homeWinProb));
    brierSum += (p - outcome) ** 2;
    logLossSum += -(outcome * Math.log(p) + (1 - outcome) * Math.log(1 - p));
    if (r.homeWinProb === 0.5) picks += 0.5;
    else if ((r.homeWinProb > 0.5) === (outcome === 1)) picks += 1;

    const margin = r.game.homePoints - r.game.awayPoints;
    drMargin += r.homeDr * margin;
    drSq += r.homeDr * r.homeDr;
  }

  const pointsPerRating = drSq > 0 ? drMargin / drSq : 0;
  let maeSum = 0;
  for (const r of records) {
    const margin = r.game.homePoints - r.game.awayPoints;
    maeSum += Math.abs(pointsPerRating * r.homeDr - margin);
  }

  return {
    games: n,
    brier: brierSum / n,
    logLoss: logLossSum / n,
    pickAccuracy: picks / n,
    pointsPerRating,
    spreadMae: maeSum / n,
  };
}

export interface AgreementScorecard {
  /** Teams appearing in both top 25s, out of the reference list's size. */
  top25Overlap: number;
  /** Spearman rank correlation over the teams present in both lists. */
  spearman: number;
  /** Reference-ranked teams the config leaves out of the top N, and vice versa. */
  fieldDiff: { size: number; inConfigOnly: number[]; inReferenceOnly: number[] };
}

/**
 * Compare a config's ranking (team ids, best first) against a reference
 * ranking (committee/AP top 25). Spearman is computed over the intersection,
 * since the reference only ranks 25 teams.
 */
export function agreementScorecard(
  configRanking: number[],
  referenceRanking: number[],
  fieldSize = 12,
): AgreementScorecard {
  const refSet = new Set(referenceRanking);
  const cfgTop = configRanking.slice(0, referenceRanking.length);
  const overlapCount = cfgTop.filter((id) => refSet.has(id)).length;
  const top25Overlap = referenceRanking.length > 0 ? overlapCount / referenceRanking.length : NaN;

  const cfgRank = new Map(configRanking.map((id, i) => [id, i + 1]));
  const shared = referenceRanking.filter((id) => cfgRank.has(id));
  const spearman = spearmanCorrelation(
    shared.map((id) => cfgRank.get(id)!),
    shared.map((id) => referenceRanking.indexOf(id) + 1),
  );

  const cfgField = new Set(configRanking.slice(0, fieldSize));
  const refField = new Set(referenceRanking.slice(0, fieldSize));
  const fieldDiff = {
    size: fieldSize,
    inConfigOnly: [...cfgField].filter((id) => !refField.has(id)),
    inReferenceOnly: [...refField].filter((id) => !cfgField.has(id)),
  };

  return { top25Overlap, spearman, fieldDiff };
}

/** Spearman rank correlation of two equal-length rank vectors. */
export function spearmanCorrelation(ranksA: number[], ranksB: number[]): number {
  const n = ranksA.length;
  if (n !== ranksB.length) throw new Error('rank vectors must have equal length');
  if (n < 2) return NaN;
  const meanA = ranksA.reduce((s, v) => s + v, 0) / n;
  const meanB = ranksB.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    const da = ranksA[i]! - meanA;
    const db = ranksB[i]! - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  if (varA === 0 || varB === 0) return NaN;
  return cov / Math.sqrt(varA * varB);
}

export interface NarrativeMetrics {
  /** Largest single-season rating gains/drops: [teamId, delta]. */
  biggestRiser: { teamId: number; delta: number } | null;
  biggestFaller: { teamId: number; delta: number } | null;
}

export function narrativeMetrics(
  entering: Map<number, number>,
  final: Map<number, number>,
): NarrativeMetrics {
  let riser: { teamId: number; delta: number } | null = null;
  let faller: { teamId: number; delta: number } | null = null;
  for (const [teamId, end] of final) {
    const start = entering.get(teamId);
    if (start === undefined) continue;
    const delta = end - start;
    if (riser === null || delta > riser.delta) riser = { teamId, delta };
    if (faller === null || delta < faller.delta) faller = { teamId, delta };
  }
  return { biggestRiser: riser, biggestFaller: faller };
}
