/**
 * CollegeFootballData.com API v2 adapter. The ONLY module that talks to the
 * network. Free tier is 1,000 calls/month — historical ingest is a one-time
 * job (~2 calls/season) and live mode is ~10 calls/week.
 *
 * Get a key at https://collegefootballdata.com/key and export CFBD_API_KEY.
 */

import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';

// Node's fetch ignores HTTPS_PROXY by default; honor it when present
// (managed/CI environments). No-op when no proxy env vars are set.
if (process.env.HTTPS_PROXY || process.env.https_proxy) {
  setGlobalDispatcher(new EnvHttpProxyAgent());
}

const BASE_URL = 'https://apinext.collegefootballdata.com';

/** Raw v2 /games row (fields we consume; the API returns more). */
export interface CfbdGame {
  id: number;
  season: number;
  week: number;
  seasonType: string;
  startDate: string;
  neutralSite: boolean;
  conferenceGame: boolean;
  completed: boolean;
  notes: string | null;
  homeId: number;
  homeTeam: string;
  homeClassification: string | null;
  homeConference: string | null;
  homePoints: number | null;
  awayId: number;
  awayTeam: string;
  awayClassification: string | null;
  awayConference: string | null;
  awayPoints: number | null;
}

export interface CfbdTeam {
  id: number;
  school: string;
  conference: string | null;
  classification: string | null;
}

export interface CfbdRankingWeek {
  season: number;
  seasonType: string;
  week: number;
  polls: Array<{
    poll: string;
    ranks: Array<{ rank: number; school: string; teamId?: number }>;
  }>;
}

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const key = process.env.CFBD_API_KEY;
  if (!key) {
    throw new Error('CFBD_API_KEY is not set. Get a free key at https://collegefootballdata.com/key');
  }
  const url = new URL(path, BASE_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) {
    throw new Error(`CFBD ${path} failed: ${res.status} ${res.statusText} — ${await res.text()}`);
  }
  return (await res.json()) as T;
}

/** All games for a season (regular + postseason), one call each. */
export async function fetchGames(year: number): Promise<CfbdGame[]> {
  const [regular, postseason] = await Promise.all([
    get<CfbdGame[]>('/games', { year: String(year), seasonType: 'regular' }),
    get<CfbdGame[]>('/games', { year: String(year), seasonType: 'postseason' }),
  ]);
  return [...regular, ...postseason];
}

export async function fetchFbsTeams(year: number): Promise<CfbdTeam[]> {
  return get<CfbdTeam[]>('/teams/fbs', { year: String(year) });
}

/** Full season of poll history (AP / Coaches / CFP committee). */
export async function fetchRankings(year: number): Promise<CfbdRankingWeek[]> {
  return get<CfbdRankingWeek[]>('/rankings', { year: String(year) });
}
