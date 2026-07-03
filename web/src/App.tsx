import { useEffect, useMemo, useState } from 'react';
import { PRESETS, parseConfig, serializeConfig, type RuleConfig, type SeasonData } from '../../engine';
import { ConfigPanel } from './components/ConfigPanel';
import { Rankings } from './components/Rankings';
import { Scorecards } from './components/Scorecards';
import { UpcomingGames } from './components/UpcomingGames';
import { availableSeasons, isDemoSeason, loadSeasonRange } from './data';
import { computeLab } from './lab';

const realSeasons = availableSeasons.filter((y) => !isDemoSeason(y));
const defaultSeason = realSeasons[realSeasons.length - 1] ?? availableSeasons[availableSeasons.length - 1] ?? 2099;

function initialState(): { config: RuleConfig; season: number; burnIn: number } {
  const params = new URLSearchParams(location.search);
  let config: RuleConfig;
  try {
    config = parseConfig(params);
  } catch {
    config = { ...PRESETS.fifa! };
  }
  // Number(null) is 0, so guard on presence before parsing.
  const seasonParam = params.has('season') ? Number(params.get('season')) : NaN;
  const burnInParam = params.has('burnin') ? Number(params.get('burnin')) : NaN;
  return {
    config,
    season: availableSeasons.includes(seasonParam) ? seasonParam : defaultSeason,
    burnIn: Number.isInteger(burnInParam) && burnInParam >= 0 && burnInParam <= 11 ? burnInParam : 3,
  };
}

type Tab = 'rankings' | 'upcoming';

export default function App() {
  const [{ config, season, burnIn }, setState] = useState(initialState);
  const [seasons, setSeasons] = useState<SeasonData[] | null>(null);
  const [tab, setTab] = useState<Tab>('rankings');
  const [copied, setCopied] = useState(false);

  const setConfig = (next: RuleConfig) => setState((s) => ({ ...s, config: next }));

  useEffect(() => {
    let alive = true;
    setSeasons(null);
    void loadSeasonRange(season, burnIn).then((loaded) => {
      if (alive) setSeasons(loaded);
    });
    return () => {
      alive = false;
    };
  }, [season, burnIn]);

  useEffect(() => {
    const query = `${serializeConfig(config)}&season=${season}&burnin=${burnIn}`;
    try {
      history.replaceState(null, '', `?${query}`);
    } catch {
      // Sandboxed embeds (opaque origin) forbid history updates; the app
      // still works, links just aren't self-updating there.
    }
  }, [config, season, burnIn]);

  const result = useMemo(
    () => (seasons !== null && seasons.length > 0 ? computeLab(seasons, config) : null),
    [seasons, config],
  );

  const copyLink = () => {
    const link = `${location.origin}${location.pathname}?${serializeConfig(config)}&season=${season}&burnin=${burnIn}`;
    navigator.clipboard.writeText(link).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {
        // Clipboard unavailable (sandboxed embed / permission denied).
        window.prompt('Copy this config link:', link);
      },
    );
  };

  return (
    <div className="app">
      <header>
        <h1>
          CFBELO <span className="subtitle">rules lab</span>
        </h1>
        <div className="header-controls">
          <label>
            Season{' '}
            <select
              value={season}
              onChange={(e) => setState((s) => ({ ...s, season: Number(e.target.value) }))}
            >
              {availableSeasons.map((y) => (
                <option key={y} value={y}>
                  {y}
                  {isDemoSeason(y) ? ' (demo)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Burn-in{' '}
            <select
              value={burnIn}
              onChange={(e) => setState((s) => ({ ...s, burnIn: Number(e.target.value) }))}
            >
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} season{n === 1 ? '' : 's'}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={copyLink}>
            {copied ? 'Copied!' : 'Share config'}
          </button>
        </div>
      </header>

      <div className="layout">
        <ConfigPanel config={config} onChange={setConfig} />

        <main>
          {result === null ? (
            <p className="muted loading">Loading season data…</p>
          ) : (
            <>
              {seasons !== null && seasons.length - 1 < burnIn && (
                <p className="muted small">
                  Only {seasons.length - 1} burn-in season{seasons.length - 1 === 1 ? '' : 's'}{' '}
                  available before {season}.
                </p>
              )}
              <Scorecards result={result} />
              <nav className="tabs">
                <button
                  type="button"
                  className={tab === 'rankings' ? 'active' : ''}
                  onClick={() => setTab('rankings')}
                >
                  Rankings
                </button>
                <button
                  type="button"
                  className={tab === 'upcoming' ? 'active' : ''}
                  onClick={() => setTab('upcoming')}
                >
                  Upcoming games
                </button>
              </nav>
              {tab === 'rankings' ? (
                <Rankings result={result} />
              ) : (
                <UpcomingGames key={season} result={result} />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
