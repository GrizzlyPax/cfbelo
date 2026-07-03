import { GAME_TYPES, type GameType } from './types';

/**
 * A complete, self-contained description of a ranking system. Everything the
 * lab can toggle lives here, and every field round-trips through URL params
 * so any experiment is shareable as a link.
 */
export interface RuleConfig {
  name: string;
  /** Expected-score divisor: 600 (FIFA) vs 400 (chess). Lab range 400–800. */
  divisor: number;
  /** true = FIFA importance tiers; false = flat K for every game. */
  useImportanceTiers: boolean;
  /** K used for every game when importance tiers are off. */
  flatK: number;
  /** I value per tier (used when useImportanceTiers is true). */
  importance: Record<GameType, number>;
  /** Margin-of-victory multiplier (eloratings.net style). Off in FIFA mode. */
  movEnabled: boolean;
  /** Rating points added to the home team's dr. 0 disables (FIFA mode). */
  homeBonus: number;
  /** Loser of a CFP game cannot lose points (FIFA knockout rule). */
  knockoutImmunityCfp: boolean;
  /** Extend knockout immunity to conference championship games. */
  knockoutImmunityCcg: boolean;
  /** How first-ever ratings are assigned. Burn-in = run prior seasons first. */
  seeding: 'burn-in' | 'flat';
  initialRating: number;
  /** Between seasons, revert this fraction of the way toward the target. */
  reversionFraction: number;
  reversionTarget: 'global' | 'conference';
  /** Pinned rating of the pooled synthetic FCS entity. */
  fcsRating: number;
}

const FIFA_IMPORTANCE: Record<GameType, number> = {
  fcs: 5,
  nonconf: 15,
  conf: 25,
  rivalry: 30,
  ccg: 40,
  cfpR1: 50,
  cfpQfSf: 55,
  natty: 60,
  bowl: 15,
};

const FLAT_IMPORTANCE: Record<GameType, number> = {
  fcs: 20,
  nonconf: 20,
  conf: 20,
  rivalry: 20,
  ccg: 20,
  cfpR1: 20,
  cfpQfSf: 20,
  natty: 20,
  bowl: 20,
};

export const PRESETS: Record<string, RuleConfig> = {
  /** FIFA's post-2018 SUM method, ported faithfully to CFB. The anchor. */
  fifa: {
    name: 'fifa',
    divisor: 600,
    useImportanceTiers: true,
    flatK: 25,
    importance: { ...FIFA_IMPORTANCE },
    movEnabled: false,
    homeBonus: 0,
    knockoutImmunityCfp: true,
    knockoutImmunityCcg: true, // FIFA protects confederation finals — lean yes
    seeding: 'burn-in',
    initialRating: 1500,
    reversionFraction: 0.33,
    reversionTarget: 'global',
    fcsRating: 1100,
  },
  /** Classic CFB Elo: MOV multiplier, home advantage, flat K, chess divisor. */
  'classic-elo': {
    name: 'classic-elo',
    divisor: 400,
    useImportanceTiers: false,
    flatK: 20,
    importance: { ...FIFA_IMPORTANCE },
    movEnabled: true,
    homeBonus: 60,
    knockoutImmunityCfp: false,
    knockoutImmunityCcg: false,
    seeding: 'burn-in',
    initialRating: 1500,
    reversionFraction: 0.33,
    reversionTarget: 'global',
    fcsRating: 1100,
  },
  /** Flat start, flat K, no frills. Maximum chaos. */
  chaos: {
    name: 'chaos',
    divisor: 600,
    useImportanceTiers: false,
    flatK: 40,
    importance: { ...FLAT_IMPORTANCE },
    movEnabled: false,
    homeBonus: 0,
    knockoutImmunityCfp: false,
    knockoutImmunityCcg: false,
    seeding: 'flat',
    initialRating: 1500,
    reversionFraction: 0,
    reversionTarget: 'global',
    fcsRating: 1100,
  },
};

/** Serialize a config to URL query params (stable key order, compact keys). */
export function serializeConfig(config: RuleConfig): string {
  const p = new URLSearchParams();
  p.set('name', config.name);
  p.set('d', String(config.divisor));
  p.set('tiers', config.useImportanceTiers ? '1' : '0');
  p.set('k', String(config.flatK));
  p.set('i', GAME_TYPES.map((t) => config.importance[t]).join(','));
  p.set('mov', config.movEnabled ? '1' : '0');
  p.set('hb', String(config.homeBonus));
  p.set('koCfp', config.knockoutImmunityCfp ? '1' : '0');
  p.set('koCcg', config.knockoutImmunityCcg ? '1' : '0');
  p.set('seed', config.seeding);
  p.set('init', String(config.initialRating));
  p.set('rf', String(config.reversionFraction));
  p.set('rt', config.reversionTarget);
  p.set('fcs', String(config.fcsRating));
  return p.toString();
}

/**
 * Parse a config from URL query params. Missing keys fall back to `base`
 * (default: the fifa preset), so short URLs that only override a knob work.
 */
export function parseConfig(
  params: string | URLSearchParams,
  base: RuleConfig = PRESETS.fifa!,
): RuleConfig {
  const p = typeof params === 'string' ? new URLSearchParams(params) : params;
  const num = (key: string, fallback: number): number => {
    const raw = p.get(key);
    if (raw === null) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`config param '${key}' is not a number: ${raw}`);
    return n;
  };
  const flag = (key: string, fallback: boolean): boolean => {
    const raw = p.get(key);
    return raw === null ? fallback : raw === '1';
  };

  const importance: Record<GameType, number> = { ...base.importance };
  const iRaw = p.get('i');
  if (iRaw !== null) {
    const values = iRaw.split(',').map(Number);
    if (values.length !== GAME_TYPES.length || values.some((v) => !Number.isFinite(v))) {
      throw new Error(`config param 'i' must be ${GAME_TYPES.length} comma-separated numbers`);
    }
    GAME_TYPES.forEach((t, idx) => {
      importance[t] = values[idx]!;
    });
  }

  const seed = p.get('seed') ?? base.seeding;
  if (seed !== 'burn-in' && seed !== 'flat') throw new Error(`unknown seeding mode: ${seed}`);
  const rt = p.get('rt') ?? base.reversionTarget;
  if (rt !== 'global' && rt !== 'conference') throw new Error(`unknown reversion target: ${rt}`);

  return {
    name: p.get('name') ?? base.name,
    divisor: num('d', base.divisor),
    useImportanceTiers: flag('tiers', base.useImportanceTiers),
    flatK: num('k', base.flatK),
    importance,
    movEnabled: flag('mov', base.movEnabled),
    homeBonus: num('hb', base.homeBonus),
    knockoutImmunityCfp: flag('koCfp', base.knockoutImmunityCfp),
    knockoutImmunityCcg: flag('koCcg', base.knockoutImmunityCcg),
    seeding: seed,
    initialRating: num('init', base.initialRating),
    reversionFraction: num('rf', base.reversionFraction),
    reversionTarget: rt,
    fcsRating: num('fcs', base.fcsRating),
  };
}
