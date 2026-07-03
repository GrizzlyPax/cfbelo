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
 * Classify a game into an importance tier from its own fields.
 *
 * Notes-based detection only goes so far: CFBD's `notes` field labels CFP
 * games from 2017 on ('CFP SEMIFINAL', 'College Football Playoff First
 * Round') and CCGs only in 2022–2024; 2014 semis say just 'SEMIFINAL' and
 * 2015–2016 semis plus most CCGs have null notes. refineGameTypes() below
 * fills those gaps structurally after the whole season is assembled.
 * - FCS tier: either side is not FBS-classified.
 * - Everything else in the postseason is a non-CFP bowl.
 * - Regular season: rivalry list, then conference flag, else non-conference.
 */
export function classifyGame(raw: CfbdGame): GameType {
  const fbs = (c: string | null) => (c ?? '').toLowerCase() === 'fbs';
  if (!fbs(raw.homeClassification) || !fbs(raw.awayClassification)) return 'fcs';

  const notes = (raw.notes ?? '').toLowerCase();
  const isCfp = notes.includes('college football playoff') || notes.includes('cfp');
  if (isCfp && notes.includes('national championship')) return 'natty';
  if (isCfp && notes.includes('first round')) return 'cfpR1';
  if (notes.includes('quarterfinal') || notes.includes('semifinal')) return 'cfpQfSf';
  if (isCfp) return 'cfpQfSf';
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

/**
 * Manual classification corrections for games no general rule can reach.
 * Both are 2020 COVID one-offs: Notre Dame played its only season as an ACC
 * member (the teams table still says Independents, so the structural rule
 * can't see the ACC title game), and the Pac-12 CCG was home-hosted inside
 * a full week-16 conference slate with no neutral game to tiebreak on.
 */
const CCG_OVERRIDES: ReadonlyArray<{ season: number; home: string; away: string }> = [
  { season: 2020, home: 'Notre Dame', away: 'Clemson' },
  { season: 2020, home: 'USC', away: 'Oregon' },
];

/**
 * Second classification pass over the assembled season, filling the gaps
 * notes can't cover (see classifyGame). Two structural rules:
 *
 * CCGs — for each conference, take its final week of intra-conference play
 * (week >= 14). Exactly one game that week -> the CCG. Several (e.g. 2021's
 * rescheduled Cal–USC alongside the real Pac-12 title game) -> the unique
 * neutral-site one. Conferences whose final week has a full slate (pre-2017
 * Big 12 round robin, most of COVID 2020) correctly get none.
 * "Same conference" comes from the teams table, NOT the conferenceGame flag
 * (2025 CCGs are filed as regular-season week 15 with conferenceGame=false).
 * FBS Independents and sub-4-team leagues (the 2-team 2025 Pac-12) hold no
 * CCG, and Army–Navy is excluded outright: it's played the week after
 * championship Saturday and would otherwise poison its conference's final
 * week. Conferences with a notes-detected CCG are skipped. In live mode a
 * mid-season update can transiently mislabel a lone late-season game, but
 * update.ts rebuilds the file every run, so it self-heals as weeks arrive.
 *
 * Semifinals (4-team era, 2014–2023) — a postseason game between two teams
 * of the final CFP committee top 4 that isn't the championship is a
 * semifinal, whatever its notes say (2015–2016 semis have null notes).
 */
export function refineGameTypes(games: Game[], teams: Team[], polls: PollWeek[]): Game[] {
  const refined = games.map((g) => ({ ...g }));
  const confOf = new Map(teams.map((t) => [t.id, t.conference]));
  const confSize = new Map<string, number>();
  for (const t of teams) {
    if (t.conference != null) confSize.set(t.conference, (confSize.get(t.conference) ?? 0) + 1);
  }

  for (const o of CCG_OVERRIDES) {
    const g = refined.find(
      (g) => g.season === o.season && g.homeTeam === o.home && g.awayTeam === o.away,
    );
    if (g) g.gameType = 'ccg';
  }

  const ccgFound = new Set(
    refined
      .filter((g) => g.gameType === 'ccg')
      .map((g) => confOf.get(g.homeId))
      .filter((c): c is string => c != null),
  );
  const isArmyNavy = (g: Game) =>
    (g.homeTeam === 'Army' && g.awayTeam === 'Navy') ||
    (g.homeTeam === 'Navy' && g.awayTeam === 'Army');
  const byConf = new Map<string, Game[]>();
  for (const g of refined) {
    if (g.seasonType !== 'regular' || g.week < 14) continue;
    if (g.gameType !== 'conf' && g.gameType !== 'rivalry' && g.gameType !== 'nonconf') continue;
    if (isArmyNavy(g)) continue;
    const conf = confOf.get(g.homeId);
    if (conf == null || conf !== confOf.get(g.awayId)) continue;
    if (conf === 'FBS Independents' || (confSize.get(conf) ?? 0) < 4) continue;
    if (!byConf.has(conf)) byConf.set(conf, []);
    byConf.get(conf)!.push(g);
  }
  for (const [conf, confGames] of byConf) {
    if (ccgFound.has(conf)) continue;
    const lastWeek = Math.max(...confGames.map((g) => g.week));
    const candidates = confGames.filter((g) => g.week === lastWeek);
    const pick =
      candidates.length === 1
        ? candidates[0]!
        : candidates.filter((g) => g.neutralSite).length === 1
          ? candidates.find((g) => g.neutralSite)!
          : null;
    if (pick) pick.gameType = 'ccg';
  }

  const fourTeamEra = refined.length > 0 && refined[0]!.season <= 2023;
  if (fourTeamEra) {
    const committee = [...polls]
      .sort(
        (a, b) =>
          (a.seasonType === b.seasonType ? 0 : a.seasonType === 'regular' ? -1 : 1) ||
          a.week - b.week,
      )
      .flatMap((w) => w.polls.filter((p) => p.poll === 'Playoff Committee Rankings'))
      .pop();
    if (committee) {
      const top4 = new Set(committee.ranks.slice(0, 4).map((r) => r.teamId));
      for (const g of refined) {
        if (g.seasonType !== 'postseason' || g.gameType !== 'bowl') continue;
        if (top4.has(g.homeId) && top4.has(g.awayId)) g.gameType = 'cfpQfSf';
      }
    }
  }

  return refined;
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
  const polls = normalizeRankings(rawRankings, teams);
  return { season, teams, games: refineGameTypes(games, teams, polls), polls };
}
