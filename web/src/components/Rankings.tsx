import type { LabResult } from '../lab';

export function Rankings({ result }: { result: LabResult }) {
  const refSource = result.agreement?.source ?? null;
  return (
    <table className="rankings">
      <thead>
        <tr>
          <th className="num">#</th>
          <th>Team</th>
          <th>Conference</th>
          <th className="num">W–L</th>
          <th className="num">Rating</th>
          {refSource !== null && (
            <th className="num" title={`Position in the final ${refSource}`}>
              Cmte
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {result.top25.map((t) => (
          <tr key={t.teamId}>
            <td className="num">{t.rank}</td>
            <td>{t.school}</td>
            <td className="muted">{t.conference ?? '—'}</td>
            <td className="num">
              {t.wins}–{t.losses}
            </td>
            <td className="num mono">{t.rating.toFixed(1)}</td>
            {refSource !== null && (
              <td className={t.referenceRank === null ? 'num muted' : 'num'}>
                {t.referenceRank ?? 'NR'}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
