import { PRESETS, serializeConfig, type GameType, type RuleConfig } from '../../../engine';

const TIER_LABELS: Record<GameType, string> = {
  fcs: 'vs FCS opponent',
  nonconf: 'Non-conference',
  conf: 'Conference',
  rivalry: 'Rivalry',
  ccg: 'Conf championship',
  cfpR1: 'CFP first round',
  cfpQfSf: 'CFP quarter/semi',
  natty: 'National championship',
  bowl: 'Non-CFP bowl',
};

interface Props {
  config: RuleConfig;
  onChange: (next: RuleConfig) => void;
}

export function ConfigPanel({ config, onChange }: Props) {
  const set = (patch: Partial<RuleConfig>) => onChange({ ...config, ...patch, name: 'custom' });
  const serialized = serializeConfig({ ...config, name: '' });

  return (
    <aside className="config-panel">
      <div className="preset-row">
        {Object.entries(PRESETS).map(([key, preset]) => (
          <button
            key={key}
            type="button"
            className={serializeConfig({ ...preset, name: '' }) === serialized ? 'preset active' : 'preset'}
            onClick={() => onChange({ ...preset })}
          >
            {key}
          </button>
        ))}
      </div>

      <section>
        <h3>Expected score</h3>
        <Slider
          label="Divisor"
          hint="600 = FIFA, 400 = chess"
          value={config.divisor}
          min={300}
          max={800}
          step={25}
          onChange={(divisor) => set({ divisor })}
        />
      </section>

      <section>
        <h3>Importance</h3>
        <Toggle
          label="FIFA importance tiers"
          checked={config.useImportanceTiers}
          onChange={(useImportanceTiers) => set({ useImportanceTiers })}
        />
        {config.useImportanceTiers ? (
          (Object.keys(TIER_LABELS) as GameType[]).map((tier) => (
            <Slider
              key={tier}
              label={TIER_LABELS[tier]}
              value={config.importance[tier]}
              min={0}
              max={80}
              step={5}
              onChange={(v) => set({ importance: { ...config.importance, [tier]: v } })}
            />
          ))
        ) : (
          <Slider
            label="Flat K (every game)"
            value={config.flatK}
            min={5}
            max={60}
            step={5}
            onChange={(flatK) => set({ flatK })}
          />
        )}
      </section>

      <section>
        <h3>Game adjustments</h3>
        <Toggle
          label="Margin-of-victory multiplier"
          hint="eloratings.net curve; off in FIFA mode"
          checked={config.movEnabled}
          onChange={(movEnabled) => set({ movEnabled })}
        />
        <Slider
          label="Home advantage"
          hint="rating pts added to home dr; 0 = off"
          value={config.homeBonus}
          min={0}
          max={120}
          step={5}
          onChange={(homeBonus) => set({ homeBonus })}
        />
      </section>

      <section>
        <h3>Knockout immunity</h3>
        <Toggle
          label="CFP games"
          hint="loser cannot drop points"
          checked={config.knockoutImmunityCfp}
          onChange={(knockoutImmunityCfp) => set({ knockoutImmunityCfp })}
        />
        <Toggle
          label="Conference championships"
          checked={config.knockoutImmunityCcg}
          onChange={(knockoutImmunityCcg) => set({ knockoutImmunityCcg })}
        />
      </section>

      <section>
        <h3>Season boundaries</h3>
        <label className="select-row">
          <span>Seeding</span>
          <select
            value={config.seeding}
            onChange={(e) => set({ seeding: e.target.value as RuleConfig['seeding'] })}
          >
            <option value="burn-in">burn-in seasons</option>
            <option value="flat">flat start</option>
          </select>
        </label>
        <Slider
          label="Reversion fraction"
          hint="pull toward target between seasons"
          value={config.reversionFraction}
          min={0}
          max={1}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(reversionFraction) => set({ reversionFraction })}
        />
        <label className="select-row">
          <span>Reversion target</span>
          <select
            value={config.reversionTarget}
            onChange={(e) => set({ reversionTarget: e.target.value as RuleConfig['reversionTarget'] })}
          >
            <option value="global">global mean</option>
            <option value="conference">conference mean</option>
          </select>
        </label>
        <Slider
          label="FCS pool rating"
          value={config.fcsRating}
          min={900}
          max={1400}
          step={25}
          onChange={(fcsRating) => set({ fcsRating })}
        />
      </section>
    </aside>
  );
}

function Slider({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}) {
  return (
    <label className="slider-row" title={hint}>
      <span className="slider-label">
        {label}
        <b>{format ? format(value) : value}</b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle-row" title={hint}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
