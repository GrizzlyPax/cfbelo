/**
 * CLI backtest: run one or more configs over a historical season (with
 * burn-in seasons before it) and print the final top 25 plus both
 * scorecards — predictive accuracy and committee agreement, equal billing.
 *
 *   npm run backtest -- --season 2099 --burn-in 1                 # demo data
 *   npm run backtest -- --season 2024 --burn-in 3 --preset fifa,classic-elo
 *   npm run backtest -- --season 2024 --config "d=400&mov=1&hb=57"
 */
import { readdir, readFile } from 'node:fs/promises';
import { parseConfig, PRESETS, serializeConfig, type RuleConfig } from '../engine/config';
import { agreementScorecard, narrativeMetrics, predictiveScorecard } from '../engine/metrics';
import { runBacktest, topN } from '../engine/season';
import type { PollWeek, SeasonData } from '../engine/types';

function parseArgs(argv: string[]): Map<string, string> {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        args.set(a.slice(2), next);
        i++;
      } else {
        args.set(a.slice(2), '1');
      }
    }
  }
  return args;
}

async function loadSeasons(first: number, last: number): Promise<SeasonData[]> {
  const dir = new URL('../data/seasons/', import.meta.url);
  let files: string[] = [];
  try {
    files = await readdir(dir);
  } catch {
    /* no data directory yet */
  }
  const seasons: SeasonData[] = [];
  for (let year = first; year <= last; year++) {
    if (!files.includes(`${year}.json`)) {
      throw new Error(
        `data/seasons/${year}.json not found. Run 'npm run ingest' (needs CFBD_API_KEY) or 'npm run demo-data' for the synthetic 2098–2099 seasons.`,
      );
    }
    seasons.push(JSON.parse(await readFile(new URL(`${year}.json`, dir), 'utf8')) as SeasonData);
  }
  return seasons;
}

/** Final committee ranking of the season (falls back to the last AP poll). */
function finalReferenceRanking(polls: PollWeek[]): { source: string; ids: number[] } | null {
  const weeks = [...polls].sort(
    (a, b) =>
      (a.seasonType === b.seasonType ? 0 : a.seasonType === 'regular' ? -1 : 1) || a.week - b.week,
  );
  for (const preferred of ['Playoff Committee Rankings', 'AP Top 25']) {
    for (let i = weeks.length - 1; i >= 0; i--) {
      const poll = weeks[i]!.polls.find((p) => p.poll === preferred);
      if (poll && poll.ranks.length > 0) {
        return { source: preferred, ids: poll.ranks.map((r) => r.teamId) };
      }
    }
  }
  return null;
}

const fmt = (n: number, digits = 4) => (Number.isNaN(n) ? 'n/a' : n.toFixed(digits));

function report(seasons: SeasonData[], target: SeasonData, config: RuleConfig): void {
  const { runs } = runBacktest(seasons, config);
  const run = runs[runs.length - 1]!;
  const names = new Map(target.teams.map((t) => [t.id, t.school]));

  console.log(`\n=== ${config.name} — season ${target.season} (burn-in: ${seasons.length - 1} seasons) ===`);
  console.log(`config: ${serializeConfig(config)}\n`);

  console.log('Final top 25:');
  const top = topN(run.finalRatings, 25);
  top.forEach((t, i) => {
    console.log(`  ${String(i + 1).padStart(2)}. ${(names.get(t.teamId) ?? `#${t.teamId}`).padEnd(24)} ${t.rating.toFixed(1)}`);
  });

  const pred = predictiveScorecard(run.records);
  console.log('\nPredictive scorecard:');
  console.log(`  games:           ${pred.games}`);
  console.log(`  Brier score:     ${fmt(pred.brier)}   (0.25 = coin flip; lower is better)`);
  console.log(`  log loss:        ${fmt(pred.logLoss)}`);
  console.log(`  pick accuracy:   ${fmt(pred.pickAccuracy * 100, 1)}%`);
  console.log(`  spread calib:    ${fmt(1 / pred.pointsPerRating, 1)} rating pts per point of margin`);
  console.log(`  spread MAE:      ${fmt(pred.spreadMae, 2)} points`);

  const reference = finalReferenceRanking(target.polls);
  console.log('\nCommittee agreement:');
  if (!reference) {
    console.log('  no committee/AP poll in this season file');
  } else {
    const agree = agreementScorecard(top.map((t) => t.teamId), reference.ids, 12);
    console.log(`  vs final ${reference.source}`);
    console.log(`  top-25 overlap:  ${fmt(agree.top25Overlap * 100, 0)}%`);
    console.log(`  Spearman:        ${fmt(agree.spearman, 3)}`);
    const name = (id: number) => names.get(id) ?? `#${id}`;
    if (agree.fieldDiff.inConfigOnly.length === 0) {
      console.log(`  top-${agree.fieldDiff.size} field matches the committee exactly`);
    } else {
      console.log(`  your top-${agree.fieldDiff.size} puts IN:  ${agree.fieldDiff.inConfigOnly.map(name).join(', ')}`);
      console.log(`  and leaves OUT:      ${agree.fieldDiff.inReferenceOnly.map(name).join(', ')}`);
    }
  }

  const enteringRatings = runs.length > 1 ? runs[runs.length - 2]!.finalRatings : run.snapshots[0]?.ratings;
  if (enteringRatings) {
    const narr = narrativeMetrics(enteringRatings, run.finalRatings);
    const name = (id: number) => names.get(id) ?? `#${id}`;
    console.log('\nNarrative:');
    if (narr.biggestRiser) console.log(`  biggest riser:   ${name(narr.biggestRiser.teamId)} (+${narr.biggestRiser.delta.toFixed(1)})`);
    if (narr.biggestFaller) console.log(`  biggest faller:  ${name(narr.biggestFaller.teamId)} (${narr.biggestFaller.delta.toFixed(1)})`);
  }
}

const args = parseArgs(process.argv.slice(2));
const season = Number(args.get('season') ?? 2099);
const burnIn = Number(args.get('burn-in') ?? 1);

const configs: RuleConfig[] = [];
if (args.has('config')) {
  configs.push(parseConfig(args.get('config')!));
  if (!args.get('config')!.includes('name=')) configs[0]!.name = 'custom';
}
for (const presetName of (args.get('preset') ?? (configs.length ? '' : 'fifa')).split(',').filter(Boolean)) {
  const preset = PRESETS[presetName];
  if (!preset) throw new Error(`unknown preset '${presetName}' (have: ${Object.keys(PRESETS).join(', ')})`);
  configs.push(preset);
}

const seasons = await loadSeasons(season - burnIn, season);
const target = seasons[seasons.length - 1]!;
for (const config of configs) {
  report(seasons, target, config);
}
