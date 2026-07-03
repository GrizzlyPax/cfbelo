import { useState } from 'react';
import type { GameRecord } from '../../../engine';
import { calibrationBeforeWeek, weekLabel, type LabResult } from '../lab';

/**
 * Play through a season week by week: each week's games are shown as
 * predictions (win prob + projected spread) using only ratings earned
 * before kickoff, then graded when you reveal the results.
 */
export function UpcomingGames({ result }: { result: LabResult }) {
  const [weekIdx, setWeekIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const idx = Math.min(weekIdx, result.weeks.length - 1);
  const week = result.weeks[idx];
  const records = result.recordsByWeek[idx] ?? [];
  const ppr = calibrationBeforeWeek(result, idx);
  const name = (id: number) => result.names.get(id) ?? `#${id}`;

  if (!week) return <p className="muted">No games in this season file.</p>;

  const goTo = (nextIdx: number) => {
    setWeekIdx(Math.max(0, Math.min(result.weeks.length - 1, nextIdx)));
    setRevealed(false);
  };

  return (
    <div className="upcoming">
      <div className="week-nav">
        <button type="button" onClick={() => goTo(idx - 1)} disabled={idx === 0}>
          ◀
        </button>
        <select value={idx} onChange={(e) => goTo(Number(e.target.value))}>
          {result.weeks.map((w, i) => (
            <option key={`${w.seasonType}-${w.week}`} value={i}>
              {weekLabel(w)}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => goTo(idx + 1)} disabled={idx >= result.weeks.length - 1}>
          ▶
        </button>
        <span className="spacer" />
        {revealed ? (
          <button
            type="button"
            className="primary"
            onClick={() => goTo(idx + 1)}
            disabled={idx >= result.weeks.length - 1}
          >
            Next week ▶
          </button>
        ) : (
          <button type="button" className="primary" onClick={() => setRevealed(true)}>
            Reveal results
          </button>
        )}
      </div>

      {ppr === null && (
        <p className="muted small">
          Not enough graded games yet to calibrate projected spreads — win probabilities only.
        </p>
      )}

      {revealed && <WeekSummary records={records} ppr={ppr} />}

      <table className="games">
        <thead>
          <tr>
            <th>Matchup</th>
            <th>Tier</th>
            <th className="num">Win prob</th>
            <th className="num">Proj. spread</th>
            {revealed && (
              <>
                <th className="num">Final</th>
                <th className="num">Pick</th>
                {ppr !== null && <th className="num">Spread err</th>}
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <GameRow key={r.game.id} record={r} name={name} ppr={ppr} revealed={revealed} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GameRow({
  record: r,
  name,
  ppr,
  revealed,
}: {
  record: GameRecord;
  name: (id: number) => string;
  ppr: number | null;
  revealed: boolean;
}) {
  const g = r.game;
  const favProb = Math.max(r.homeWinProb, 1 - r.homeWinProb);
  const favorite = r.homeWinProb >= 0.5 ? name(g.homeId) : name(g.awayId);
  const projMargin = ppr === null ? null : ppr * r.homeDr;

  const homeWon = g.homePoints > g.awayPoints;
  const pickCorrect = r.homeWinProb === 0.5 ? null : (r.homeWinProb > 0.5) === homeWon;
  const actualMargin = g.homePoints - g.awayPoints;

  return (
    <tr>
      <td>
        {name(g.awayId)} <span className="muted">{g.neutralSite ? 'vs' : '@'}</span> {name(g.homeId)}
      </td>
      <td>
        <span className={`tier tier-${g.gameType}`}>{g.gameType}</span>
      </td>
      <td className="num mono" title={`${favorite} favored`}>
        <span className="prob-bar" style={{ ['--p' as string]: favProb }} />
        {favorite} {(favProb * 100).toFixed(0)}%
      </td>
      <td className="num mono">
        {projMargin === null
          ? '—'
          : Math.abs(projMargin) < 0.05
            ? 'PK'
            : `${projMargin > 0 ? name(g.homeId) : name(g.awayId)} −${Math.abs(projMargin).toFixed(1)}`}
      </td>
      {revealed && (
        <>
          <td className="num mono">
            {g.awayPoints}–{g.homePoints}
          </td>
          <td className={`num ${pickCorrect === null ? 'muted' : pickCorrect ? 'pick-right' : 'pick-wrong'}`}>
            {pickCorrect === null ? 'push' : pickCorrect ? '✓' : '✗'}
          </td>
          {ppr !== null && projMargin !== null && (
            <td className="num mono">{Math.abs(projMargin - actualMargin).toFixed(1)}</td>
          )}
        </>
      )}
    </tr>
  );
}

function WeekSummary({ records, ppr }: { records: GameRecord[]; ppr: number | null }) {
  let picks = 0;
  let brierSum = 0;
  let maeSum = 0;
  for (const r of records) {
    const homeWon = r.game.homePoints > r.game.awayPoints;
    if (r.homeWinProb === 0.5) picks += 0.5;
    else if ((r.homeWinProb > 0.5) === homeWon) picks += 1;
    brierSum += (r.homeWinProb - (homeWon ? 1 : 0)) ** 2;
    if (ppr !== null) {
      maeSum += Math.abs(ppr * r.homeDr - (r.game.homePoints - r.game.awayPoints));
    }
  }
  const n = records.length;
  if (n === 0) return null;
  return (
    <p className="week-summary">
      <b>
        {picks % 1 === 0 ? picks : picks.toFixed(1)}–{n - picks === Math.floor(n - picks) ? n - picks : (n - picks).toFixed(1)}
      </b>{' '}
      straight up · Brier {(brierSum / n).toFixed(3)}
      {ppr !== null && <> · spread MAE {(maeSum / n).toFixed(1)} pts</>}
    </p>
  );
}
