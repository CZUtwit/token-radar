# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/CZUtwit/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/CZUtwit/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: every pre-token protocol in DefiLlama's snapshot, ranked
by an implied launch value, with a farm plan for each one. Entered on
[make.fun](https://make.fun/?ref=d2874d5s&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01).

## The model (radar-5)

Implied value is fitted, not picked — and every term is tested held-out
before it is allowed in:

```
implied value = fitted launch value × token odds

log10(market cap) = a + b × log10(TVL) + c × growth
token odds        = logistic(log TVL, log age, category token rate, growth)
```

- **Fitted launch value**: a log-log regression on the 91 traded protocols
  that pass the same exclusion rules, with a P25–P75 band priced per
  category from that category's leave-one-out residuals, shrunk toward the
  global band. Leave-one-out median miss ×2.91, ten-fold ×3.15,
  walk-forward ×2.06 — against ×4.68 / ×4.55 / ×4.26 for a flat median
  multiple. 50.5% of comparables are priced within 3x of their real cap
  (flat: 37.4%).
- **Token odds**: a logistic fit on all 442 protocols the rules do not
  exclude, scored by Brier score (0.181 vs a 0.247 base rate; 0.185
  ten-fold; 0.225 vs 0.352 walk-forward). The term selection itself is
  checked nested: picked on the older half, scored on the newer half
  (0.228 vs 0.225 for every term, 0.352 for the base rate).
- **Term selection**: age, chain count and the category effect were all
  tested and dropped — each one made a held-out test worse. A shuffled
  control term was tested the same way and failed too. The dashboard's
  Method tab shows the whole ablation.
- **Rank ranges**: every row carries a rank range from the bands — how far
  it could move if every band landed at its own end — and its three
  nearest traded comparables as anchors.
- **Farm plans**: seven steps per protocol, costed from stated assumptions
  (farmers share 5% of the launch value; one wallet per $100k of TVL), with
  a FARM / MARGINAL / SKIP verdict net of gas and opportunity cost. FARM
  takes both: the net stays positive at the low end of the band and pays
  at least $25 an hour there. Each row shows the net at three deposit
  tiers ($50 / $150 / $500), the largest deposit that still pays, and a
  week-by-week timeline — and the dashboard's scenario controls re-price
  every verdict live under the reader's own deposit, drop share and
  horizon.
- **The ledger, token first**: the 758 protocols are filed by token
  status first, then by rule — 110 priced comps, 306 with a token but no
  usable cap, and 144 pre-token protocols out by rule. The All-758 tab
  lists every protocol the board does not rank, with its group and why.

The board covers all 40 protocols on the snapshot's watchlist, plus every
other rankable pre-token protocol — 198 rows, with a ledger accounting for
all 758 snapshot protocols. Wrapped, staked and bridged products, exchanges
and versioned pools are left out. Each row carries its own model breakdown,
its odds terms and its farm economics.

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
- `dashboard/` — the static page: board, scenario controls, value-by-odds matrix, detail views, filters, live view, all-758 view.
- `screenshots/` — the board, a detail view, a filtered view and the matrix.
- `vendor/makefun-board.ts` — make.fun's dossier library, from the kit.

---

<sub>Entered on [make.fun](https://make.fun/?ref=d2874d5s&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)</sub>
