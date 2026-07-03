# CFBELO — A Ranking-System Laboratory for College Football

**This is not a rankings website with a settings page. It's a laboratory.** Design a FIFA/Elo-style ranking system — toggle FIFA's actual quirks, adjust importance weights and constants — then run it across historical college football seasons and see, quantitatively, how it pans out. When the 2026 season kicks off, your config runs week-by-week on real results.

The anchor preset is FIFA's post-2018 **SUM** method, ported faithfully to CFB — importance tiers, no margin of victory, no home advantage, and knockout-loss immunity (you cannot drop points for losing a playoff game). Nobody has done this: existing CFB Elo systems all use MOV and/or home advantage, and none use FIFA's importance tiers.

## The formula

```
P_new = P_before + I × (W − W_e)
W_e   = 1 / (10^(−dr/600) + 1)     // dr = own rating − opponent rating
W     = 1 for a win, 0 for a loss
```

Everything is a knob: the 600 divisor (vs chess's 400), per-tier importance values, MOV multiplier on/off, home advantage on/off, knockout immunity on/off (CFP and CCG separately), seeding mode, and between-season reversion. Presets: `fifa`, `classic-elo`, `chaos`. Every config serializes to URL params, so every experiment is shareable.

| Game type | I (fifa preset) |
|---|---|
| vs FCS opponent | 5 |
| Non-conference (FBS) | 15 |
| Conference | 25 |
| Rivalry | 30 |
| Conference championship | 40 |
| CFP first round | 50 |
| CFP quarter/semifinal | 55 |
| National championship | 60 |
| Non-CFP bowl | 15 |

## Quickstart

```bash
npm install
npm test                # engine test suite
npm run dev             # the Rules Lab — http://localhost:5173, runs off committed data
npm run demo-data       # generate synthetic seasons 2098–2099 (no API key needed)
npm run backtest -- --season 2099 --burn-in 1 --preset fifa,classic-elo
```

`npm run build` produces the static site in `dist/` — no server, each season
lazy-loads as its own chunk.

With a free [CFBD API key](https://collegefootballdata.com/key):

```bash
CFBD_API_KEY=xxx npm run ingest        # one-time 2014–2025 backfill -> data/seasons/*.json
npm run backtest -- --season 2024 --burn-in 3 --preset fifa
npm run backtest -- --season 2024 --config "d=400&mov=1&hb=57"   # custom knobs
```

Backtests need no network: they run entirely off the committed JSON under `data/seasons/`.

## Scorecards — the lab is neutral

Every run produces **two scorecards with equal billing**, never blended into one score:

- **Predictive accuracy** — pregame `W_e` is a win probability: Brier score, log loss, straight-up pick accuracy, plus a per-config points-per-rating calibration and projected-spread MAE vs actual margins.
- **Committee agreement** — Spearman correlation and top-25 overlap vs the final CFP committee ranking (AP fallback), plus an explicit playoff-field diff: *"Your config puts 2023 Florida State in."*

The tension between them — configs that predict games well vs configs that think like the committee — is a feature to surface, not resolve.

## Architecture

```
engine/        pure TypeScript, zero I/O — the whole point
  types.ts     Game / Team / PollWeek / SeasonData models
  config.ts    RuleConfig + presets; config <-> URL params
  ratings.ts   expectedScore, MOV multiplier, per-game update (+immunity)
  season.ts    game log -> weekly snapshots; reversion; multi-season backtest
  metrics.ts   Brier, log loss, Spearman, top-25 overlap, field diff
data/
  cfbd.ts      CFBD API v2 adapter (the ONLY module that touches the network)
  normalize.ts raw API -> internal models; game-type classification; FCS pooling
  rivalries.ts protected rivalry list (I=30 tier)
  seasons/     committed JSON, one file per season
jobs/
  ingest.ts    one-time historical backfill (2014–2025)
  update.ts    weekly cron for live 2026 mode
  make-demo-season.ts  deterministic synthetic data for dev/tests
cli/
  backtest.ts  final top 25 + both scorecards per config
web/
  src/data.ts  lazy per-season chunks via import.meta.glob
  src/lab.ts   (seasons, config) -> everything the views render
  src/components/  ConfigPanel, Rankings, Scorecards, UpcomingGames
```

Key decision: the engine is pure functions over immutable committed game logs. A full 12-season backtest is a few hundred thousand arithmetic ops — trivially fast in the browser. Zero server. Everything is keyed on CFBD numeric team ids (name strings are inconsistent across sources). FCS opponents pool into one synthetic entity pinned at a low rating (configurable to track individually).

## Data notes / known caveats

- **Game-type classification is two-pass and validated against 2014–2025.** CFBD's `notes` field only labels CFP games from 2017 and CCGs in 2022–2024, so `refineGameTypes()` adds structural rules: semifinals in the 4-team era are postseason games between final-committee top-4 teams; a CCG is the lone intra-conference game (teams table, not the unreliable `conferenceGame` flag) in a conference's final week (≥14), neutral-site tiebreak. Two 2020 COVID one-offs are hardcoded overrides. Detected CCG and CFP games were checked game-by-game against the historical record for all 12 seasons. `npm run ingest` prints per-tier counts to re-verify after any re-ingest.
- The rivalry list in `data/rivalries.ts` is a curated first pass, not exhaustive.
- Ties are dropped (none in FBS since 1995); incomplete and FCS-vs-FCS games too.

## Roadmap

- [x] **M1 — Engine + CLI backtest + 2014–2025 historical dataset** (committed under `data/seasons/`)
- [x] **M2 — Rules Lab MVP:** static site (Vite + React), toggles/sliders, live-recomputed rankings + scorecard, UpcomingGames view with win prob + projected spread, graded on week advance; configs round-trip through the URL (`?d=400&mov=1&hb=57&season=2024`)
- [ ] **M3 — Season Replay** (week scrubber, animated top 25) + config compare
- [ ] **M4 — Live 2026 mode:** weekly cron (workflow is in `.github/workflows/update-live.yml`, dispatch-only until the season), movement arrows, risers/fallers. Ship before Week 1, late August 2026
- [ ] **M5 (stretch):** Monte Carlo playoff odds; Elo-to-spread vs Vegas closing lines (CFBD `/lines`)

## Open questions (tracked from the design doc)

- Tune default I values by backtest → publish `fifa-predictive` (best Brier) and `fifa-committee` (best agreement) presets alongside pure `fifa`; their disagreement is content.
- CCG knockout immunity defaults **on** (FIFA protects confederation finals) — revisit after backtesting.
- Display scale (raw vs FIFA-style offset) — cosmetic, decide at M2.
- Name: CFBELO is the working title (candidates: "Committee of One", "The Algorithm Poll", "Rules Lab").

## References

- [FIFA men's ranking procedure (SUM)](https://inside.fifa.com/fifa-world-ranking/procedure-men)
- [World Football Elo Ratings](https://eloratings.net/about) (MOV + home-advantage variant for classic mode)
- [CFBD API v2](https://apinext.collegefootballdata.com)
