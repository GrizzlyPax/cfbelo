/**
 * The web app's compute layer: one pure function from (seasons, config) to
 * everything the views render. Recomputed synchronously on every knob change —
 * a full multi-season backtest is a few hundred thousand arithmetic ops.
 */
import {
  FCS_TEAM_ID,
  agreementScorecard,
  finalReferenceRanking,
  predictiveScorecard,
  runBacktest,
  topN,
  type AgreementScorecard,
  type GameRecord,
  type PredictiveScorecard,
  type RuleConfig,
  type SeasonData,
  type SeasonRun,
  type SeasonType,
} from '../../engine';

export interface WeekKey {
  seasonType: SeasonType;
  week: number;
}

export const weekLabel = (w: WeekKey): string =>
  w.seasonType === 'regular' ? `Week ${w.week}` : w.week > 1 ? `Postseason ${w.week}` : 'Postseason';

export interface RankedTeam {
  rank: number;
  teamId: number;
  school: string;
  conference: string | null;
  rating: number;
  wins: number;
  losses: number;
  /** Position in the reference (committee/AP) ranking, if ranked there. */
  referenceRank: number | null;
}

export interface LabResult {
  target: SeasonData;
  run: SeasonRun;
  /** Records from the burn-in seasons, for calibration before week 1. */
  priorRecords: GameRecord[];
  names: Map<number, string>;
  top25: RankedTeam[];
  predictive: PredictiveScorecard;
  agreement: { source: string; referenceIds: number[]; card: AgreementScorecard } | null;
  /** Distinct weeks of the target season, in play order. */
  weeks: WeekKey[];
  /** Target-season records grouped by week, parallel to `weeks`. */
  recordsByWeek: GameRecord[][];
}

export function computeLab(seasons: SeasonData[], config: RuleConfig): LabResult {
  const { runs } = runBacktest(seasons, config);
  const run = runs[runs.length - 1]!;
  const target = seasons[seasons.length - 1]!;
  const priorRecords = runs.slice(0, -1).flatMap((r) => r.records);

  const names = new Map(target.teams.map((t) => [t.id, t.school]));
  names.set(FCS_TEAM_ID, 'FCS (pooled)');
  const conferences = new Map(target.teams.map((t) => [t.id, t.conference]));

  const wins = new Map<number, number>();
  const losses = new Map<number, number>();
  const weeks: WeekKey[] = [];
  const recordsByWeek: GameRecord[][] = [];
  for (const rec of run.records) {
    const g = rec.game;
    const winnerId = g.homePoints > g.awayPoints ? g.homeId : g.awayId;
    const loserId = g.homePoints > g.awayPoints ? g.awayId : g.homeId;
    wins.set(winnerId, (wins.get(winnerId) ?? 0) + 1);
    losses.set(loserId, (losses.get(loserId) ?? 0) + 1);

    const last = weeks[weeks.length - 1];
    if (!last || last.seasonType !== g.seasonType || last.week !== g.week) {
      weeks.push({ seasonType: g.seasonType, week: g.week });
      recordsByWeek.push([]);
    }
    recordsByWeek[recordsByWeek.length - 1]!.push(rec);
  }

  const reference = finalReferenceRanking(target.polls);
  const referenceRankOf = new Map(reference?.ids.map((id, i) => [id, i + 1]) ?? []);

  const top25: RankedTeam[] = topN(run.finalRatings, 25).map((t, i) => ({
    rank: i + 1,
    teamId: t.teamId,
    school: names.get(t.teamId) ?? `#${t.teamId}`,
    conference: conferences.get(t.teamId) ?? null,
    rating: t.rating,
    wins: wins.get(t.teamId) ?? 0,
    losses: losses.get(t.teamId) ?? 0,
    referenceRank: referenceRankOf.get(t.teamId) ?? null,
  }));

  const agreement = reference
    ? {
        source: reference.source,
        referenceIds: reference.ids,
        card: agreementScorecard(top25.map((t) => t.teamId), reference.ids, 12),
      }
    : null;

  return {
    target,
    run,
    priorRecords,
    names,
    top25,
    predictive: predictiveScorecard(run.records),
    agreement,
    weeks,
    recordsByWeek,
  };
}

/** Least-squares points-per-rating-point over a pool of graded games. */
export function pointsPerRating(records: GameRecord[]): number {
  let drMargin = 0;
  let drSq = 0;
  for (const r of records) {
    const margin = r.game.homePoints - r.game.awayPoints;
    drMargin += r.homeDr * margin;
    drSq += r.homeDr * r.homeDr;
  }
  return drSq > 0 ? drMargin / drSq : 0;
}

/** Minimum graded games before we trust the spread calibration. */
export const CALIBRATION_MIN_GAMES = 30;

/**
 * Spread calibration available when viewing week `weekIdx` as "upcoming":
 * every burn-in game plus every target-season game already played.
 * Returns null when the pool is too small to be meaningful.
 */
export function calibrationBeforeWeek(result: LabResult, weekIdx: number): number | null {
  const pool = result.priorRecords.concat(result.recordsByWeek.slice(0, weekIdx).flat());
  if (pool.length < CALIBRATION_MIN_GAMES) return null;
  const ppr = pointsPerRating(pool);
  return ppr > 0 ? ppr : null;
}
