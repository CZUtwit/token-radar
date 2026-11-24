# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/CZUtwit/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/CZUtwit/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: every pre-token protocol in DefiLlama's snapshot, ranked
by an implied launch value, with a farm plan for each one. Entered on
[make.fun](https://make.fun/?ref=d2874d5s&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01).

## The model

Implied value comes only from the snapshot's own figures — no hardcoded names:

```
implied = TVL × category multiple × growth × maturity × breadth
```

- **Category multiple**: the median market-cap/TVL ratio of the live-token
  protocols in the same category (3+ comps, else the global median), clamped
  to [0.05, 1.5]. Live tokens price the board; they are never ranked on it.
- **Growth**: `1 + clamp(7-day TVL change, −50%, +100%) × 0.5`.
- **Maturity**: `0.6 + min(age in days, 1095) / 1095 × 0.4`.
- **Breadth**: `1 + min(chains − 1, 4) × 0.03`.

The board covers all 40 protocols on the snapshot's watchlist, plus every
other rankable pre-token protocol below the floor — 198 rows. Wrapped, staked
and bridged products, exchanges and versioned pools are left out. Each row
carries its own model breakdown and a six-step farm plan with costs and times.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

This writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and
`dossier.json` to `out/`. Open `out/dashboard/index.html` in a browser; the
page renders with no network.

## Layout

- `main.ts` — the entry program: snapshot in, board and dossier out.
- `lib/model.ts` — the model, the farm plans and the board checks.
- `dashboard/` — the static page: board, detail views, filters, live view.
- `screenshots/` — the board, a detail view and a filtered view.
- `vendor/makefun-board.ts` — make.fun's dossier library, from the kit.

---

<sub>Entered on [make.fun](https://make.fun/?ref=d2874d5s&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)</sub>
