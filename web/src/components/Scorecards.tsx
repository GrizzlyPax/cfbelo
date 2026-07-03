import type { LabResult } from '../lab';

const fmt = (n: number, digits = 4): string => (Number.isNaN(n) ? 'n/a' : n.toFixed(digits));

/** Both scorecards, equal billing, never blended — the lab is neutral. */
export function Scorecards({ result }: { result: LabResult }) {
  const { predictive: pred, agreement, names } = result;
  const name = (id: number) => names.get(id) ?? `#${id}`;

  return (
    <div className="scorecards">
      <div className="scorecard">
        <h3>Predictive accuracy</h3>
        <dl>
          <div>
            <dt>Brier score</dt>
            <dd>
              {fmt(pred.brier)} <small>(0.25 = coin flip)</small>
            </dd>
          </div>
          <div>
            <dt>Log loss</dt>
            <dd>{fmt(pred.logLoss)}</dd>
          </div>
          <div>
            <dt>Pick accuracy</dt>
            <dd>{fmt(pred.pickAccuracy * 100, 1)}%</dd>
          </div>
          <div>
            <dt>Spread calibration</dt>
            <dd>
              {fmt(1 / pred.pointsPerRating, 1)} <small>rating pts / point</small>
            </dd>
          </div>
          <div>
            <dt>Spread MAE</dt>
            <dd>
              {fmt(pred.spreadMae, 2)} <small>points</small>
            </dd>
          </div>
          <div>
            <dt>Games graded</dt>
            <dd>{pred.games}</dd>
          </div>
        </dl>
      </div>

      <div className="scorecard">
        <h3>Committee agreement</h3>
        {agreement === null ? (
          <p className="muted">No committee or AP poll in this season file.</p>
        ) : (
          <>
            <p className="muted">vs final {agreement.source}</p>
            <dl>
              <div>
                <dt>Top-25 overlap</dt>
                <dd>{fmt(agreement.card.top25Overlap * 100, 0)}%</dd>
              </div>
              <div>
                <dt>Spearman</dt>
                <dd>{fmt(agreement.card.spearman, 3)}</dd>
              </div>
            </dl>
            {agreement.card.fieldDiff.inConfigOnly.length === 0 ? (
              <p className="field-diff">
                Your top-{agreement.card.fieldDiff.size} field matches the committee exactly.
              </p>
            ) : (
              <p className="field-diff">
                Your top-{agreement.card.fieldDiff.size} puts <b className="in">IN</b>{' '}
                {agreement.card.fieldDiff.inConfigOnly.map(name).join(', ')} and leaves{' '}
                <b className="out">OUT</b> {agreement.card.fieldDiff.inReferenceOnly.map(name).join(', ')}.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
