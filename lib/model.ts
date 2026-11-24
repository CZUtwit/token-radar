// Token Launch Radar — the model, radar-3 (token-radar-01).
//
// One sealed DefiLlama snapshot in, one ranked board out. The board ranks every
// pre-token protocol the snapshot can rank: the whole watchlist, plus every
// pre-token protocol below the floor that is not a wrapped, staked or bridged
// product, an exchange, or a versioned pool. Live-token protocols are never
// ranked; they price the board twice over.
//
// The value model is fitted, not picked. On the clean traded comparables
// (traded protocols that pass the same exclusion rules, with a usable
// market-cap-to-TVL ratio), the launch value is a log-log regression:
//
//   log10(market cap) = a + b * log10(TVL) + c * growth
//
// Every candidate term — age, chain count, a category effect, and a shuffled
// control term that must not help — is tested held-out two ways (leave-one-out
// and walk-forward: earlier listings price later ones). A term enters the
// model only when it lowers the combined held-out miss by at least 1%
// without raising either test by more than 2%. Age, chains and the category
// effect all failed; the fitted model keeps size and growth only, and the
// board shows the whole ablation so the reader can see what was tried and
// what was dropped. A shuffled control term is tested the same way: it must
// fail the rule, which is what shows the rule can tell a real term from noise.
//
// The odds model is a logistic regression on every protocol the rules do not
// exclude, fitted to whether it records a token, from log TVL, log age, the
// category's shrunk token rate and 7-day growth. It is scored by Brier score
// against the base rate, in-sample and walk-forward.
//
//   if it launches = 10 ^ fitted log market cap, with a P25-P75 band from the
//                      leave-one-out residuals
//   implied value   = if it launches x token odds        (the expected value)
//   rank            = by implied value, highest first
//
// Each farm plan is costed, not just listed. The board states its assumptions:
// farmers share 5% of the launch value; one farming wallet per $100k of TVL
// (at least 1000 wallets); gas and a 4% annual opportunity cost on the deposit.
// A row is FARM when its net stays positive at the low end of its band,
// MARGINAL when it pays at the point estimate only, SKIP when it does not pay.
//
// Everything the dashboard claims — the ablation, the Brier scores, the band
// honesty, the 758-protocol ledger, the checksum — is computed here from the
// snapshot at build time, and the dashboard recomputes the checks in the
// browser from board.json. Nothing is hand-written: no names, no numbers.

/** One protocol entry of the sealed snapshot: exactly its ten fields. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's stated assumptions, as the dashboard states them. */
export interface ModelConstants {
  /** Farmers' share of the launch value, as a fraction. */
  drop_share: number;
  /** One farming wallet per this much TVL. */
  tvl_per_farmer: number;
  /** Fewest farming wallets a protocol is assumed to have. */
  min_farmers: number;
  /** Most farming wallets a protocol is assumed to have. */
  max_farmers: number;
  /** Annual opportunity cost on the deposit, as a fraction. */
  opportunity_apy: number;
  /** Gas for the setup transactions on a large plan, in dollars. */
  gas_large: number;
  /** Gas for the setup transactions on a small plan, in dollars. */
  gas_small: number;
  /** Gas for each weekly action, in dollars. */
  gas_weekly: number;
  /** Gas to claim, in dollars. */
  gas_claim: number;
  /** Token odds are clamped to this range. */
  odds_floor: number;
  odds_cap: number;
  /** Growth is clamped to this range, in percent. */
  growth_floor: number;
  growth_cap: number;
  /** Category token rates shrink toward the base rate with this prior weight. */
  category_prior: number;
}

export const MODEL: ModelConstants = {
  drop_share: 0.05,
  tvl_per_farmer: 100_000,
  min_farmers: 1000,
  max_farmers: 100_000,
  opportunity_apy: 0.04,
  gas_large: 8,
  gas_small: 4,
  gas_weekly: 2,
  gas_claim: 3,
  odds_floor: 0.02,
  odds_cap: 0.98,
  growth_floor: -50,
  growth_cap: 100,
  category_prior: 3,
};

/** The model's version label, shown on the dashboard. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One farm step: the action, what it costs, how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of the value-model ablation: a candidate term and its held-out miss. */
export interface AblationRow {
  term: string;
  loo_miss: number;
  wf_miss: number;
  verdict: 'kept' | 'not kept' | 'baseline' | 'control';
}

/** One row of the odds-model ablation: a candidate term and its Brier score. */
export interface OddsAblationRow {
  term: string;
  brier: number;
  wf_brier: number;
  verdict: 'kept' | 'not kept' | 'baseline';
}

/** The fitted value model, with its evidence. */
export interface ValueEvidence {
  comps: number;
  intercept: number;
  slope_log_tvl: number;
  coef_growth: number;
  /** The kept terms, in order, with their fitted coefficients. */
  terms: string[];
  coefficients: number[];
  residual_sd_log10: number;
  /** Multiplicative band factors from the leave-one-out residuals. */
  band_p25: number;
  band_p75: number;
  band_p10: number;
  band_p90: number;
  /** Share of comparables whose real cap lands inside the printed band. */
  honesty_p25_p75: number;
  honesty_p10_p90: number;
  ablation: AblationRow[];
}

/** The fitted odds model, with its evidence. */
export interface OddsEvidence {
  peers: number;
  with_token: number;
  base_rate: number;
  base_brier: number;
  brier: number;
  wf_brier: number;
  wf_base_brier: number;
  /** Standardized logistic weights, in feature order. */
  weights: number[];
  ablation: OddsAblationRow[];
}

/** One group of the 758-protocol ledger. */
export interface LedgerGroup {
  key: string;
  label: string;
  count: number;
  detail: string;
}

/** The per-row model breakdown, so the implied value can be checked by hand. */
export interface ModelBreakdown {
  log_tvl: number;
  growth_pct: number;
  fitted_log_mcap: number;
  if_launches_usd: number;
  band_low_usd: number;
  band_high_usd: number;
  odds: number;
  odds_log_tvl: number;
  odds_log_age: number;
  odds_cat_rate: number;
  odds_growth: number;
  deposit_usd: number;
  farmers: number;
  drop_pool_usd: number;
  expected_drop_usd: number;
  fees_usd: number;
  opportunity_usd: number;
  hours: number;
  age_days: number | null;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  token_status: 'pre-token';
  on_watchlist: boolean;
  implied_value_usd: number;
  if_launches_usd: number;
  band_low_usd: number;
  band_high_usd: number;
  odds: number;
  verdict: 'FARM' | 'MARGINAL' | 'SKIP';
  net_usd: number;
  net_hour_usd: number;
  breakeven_usd: number;
  model: ModelBreakdown;
  farm_steps: string[];
}

/** A live-token protocol for the dashboard's Live view. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  mcap_tvl: number | null;
}

/** Everything the dashboard needs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  above_floor_off_list: number;
  total_implied_usd: number;
  total_if_launches_usd: number;
  farm_count: number;
  marginal_count: number;
  skip_count: number;
  value: ValueEvidence;
  odds: OddsEvidence;
  ledger: LedgerGroup[];
  /** FNV-1a checksum of the board, recomputed by the dashboard. */
  checksum: string;
  rows: BoardRow[];
  live: LiveRow[];
}

/** Why a snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from `listedAt` to `asOf`, clamped at zero; null when either is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a list; NaN when empty. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return NaN;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The q-th quantile of a list by linear interpolation; NaN when empty. */
function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return NaN;
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** How far off a prediction is: the larger of the two over the smaller. */
function missRatio(predicted: number, actual: number): number {
  return Math.max(predicted, actual) / Math.min(predicted, actual);
}

/**
 * Ordinary least squares by the normal equations with Gaussian elimination.
 * Returns null when the design is singular.
 */
function ols(X: number[][], y: number[]): number[] | null {
  const n = X.length;
  const k = X[0]!.length;
  const XtX: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
  const Xty: number[] = Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < k; a++) {
      Xty[a]! += X[i]![a]! * y[i]!;
      for (let b = 0; b < k; b++) XtX[a]![b]! += X[i]![a]! * X[i]![b]!;
    }
  }
  const A = XtX.map((r, i) => [...r, Xty[i]!]);
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[piv]![c]!)) piv = r;
    [A[c], A[piv]] = [A[piv]!, A[c]!];
    if (Math.abs(A[c]![c]!) < 1e-12) return null;
    for (let r = c + 1; r < k; r++) {
      const f = A[r]![c]! / A[c]![c]!;
      for (let j = c; j <= k; j++) A[r]![j]! -= f * A[c]![j]!;
    }
  }
  const beta: number[] = Array(k).fill(0);
  for (let r = k - 1; r >= 0; r--) {
    let s = A[r]![k]!;
    for (let j = r + 1; j < k; j++) s -= A[r]![j]! * beta[j]!;
    beta[r] = s / A[r]![r]!;
  }
  return beta;
}

/** A fitted logistic model: weights on standardized features, with the scalers. */
interface LogisticModel {
  weights: number[];
  means: number[];
  sds: number[];
}

/**
 * Logistic regression by batch gradient descent, deterministic: fixed
 * iterations, fixed step, a small L2 penalty on the slopes. Features are
 * standardized (except the intercept) so one step size fits all terms.
 */
function fitLogistic(X: number[][], y: number[], iterations = 800, step = 0.5): LogisticModel {
  const k = X[0]!.length;
  const means: number[] = Array(k).fill(0);
  const sds: number[] = Array(k).fill(1);
  for (let j = 1; j < k; j++) {
    means[j] = X.reduce((s, r) => s + r[j]!, 0) / X.length;
    sds[j] = Math.sqrt(X.reduce((s, r) => s + (r[j]! - means[j]!) ** 2, 0) / X.length) || 1;
  }
  const Xs = X.map((r) => r.map((v, j) => (j === 0 ? v : (v - means[j]!) / sds[j]!)));
  const w: number[] = Array(k).fill(0);
  for (let it = 0; it < iterations; it++) {
    const g: number[] = Array(k).fill(0);
    for (let i = 0; i < Xs.length; i++) {
      const z = Xs[i]!.reduce((s, x, j) => s + x * w[j]!, 0);
      const p = 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
      for (let j = 0; j < k; j++) g[j]! += (p - y[i]!) * Xs[i]![j]!;
    }
    for (let j = 0; j < k; j++) w[j]! -= (step / Xs.length) * g[j]! + (j > 0 ? 0.001 * w[j]! : 0);
  }
  return { weights: w, means, sds };
}

/** A logistic model's probability for one feature row. */
function predictLogistic(m: LogisticModel, x: number[]): number {
  const xs = x.map((v, j) => (j === 0 ? v : (v - m.means[j]!) / m.sds[j]!));
  const z = xs.reduce((s, v, j) => s + v * m.weights[j]!, 0);
  return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
}

/** The mean squared error of probabilities against 0/1 outcomes. */
function brierScore(predicted: number[], actual: number[]): number {
  return predicted.reduce((s, p, i) => s + (p - actual[i]!) ** 2, 0) / actual.length;
}

/** FNV-1a, 32-bit, as eight hex digits: the board's checksum. */
export function checksumOf(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** Whole words that mark a wrapped or staked product. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
/** Categories that are not a protocol waiting on a launch of its own. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
/** Exchange names a product name may not begin with. */
const EXCHANGES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool, not a wrapped, staked or bridged product. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGES.some((e) => p.name.startsWith(e))) return false;
  return true;
}

/** The first exclusion rule a protocol breaks, for the ledger; null when none. */
function exclusionReason(p: SnapshotProtocol): string | null {
  if (p.category === 'Bridge' || p.category === 'Canonical Bridge') return 'bridge';
  if (p.category === 'Liquid Staking' || p.category === 'Liquid Restaking' || p.category === 'Restaked BTC') return 'liquid-staking';
  if (p.category === 'CEX' || EXCHANGES.some((e) => p.name.startsWith(e))) return 'exchange';
  if (VERSIONED.test(p.name) || WRAPPED_WORD.test(p.name)) return 'versioned-wrapped';
  return null;
}

/** A live-token protocol's market-cap-to-TVL ratio, or null when it cannot price anything. */
function marketMultiple(p: SnapshotProtocol): number | null {
  if (p.mcap_usd === null || p.tvl_usd <= 0) return null;
  const m = p.mcap_usd / p.tvl_usd;
  if (!Number.isFinite(m) || m <= 0 || m >= 50) return null;
  return m;
}

/** The clean comparables: traded, not excluded, with a usable multiple. */
export function cleanComps(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => !isPreToken(p) && exclusionReason(p) === null && marketMultiple(p) !== null);
}

/** Growth clamped to the model's range, as a fraction. */
function growthFrac(p: SnapshotProtocol, model: ModelConstants): number {
  return Math.min(model.growth_cap, Math.max(model.growth_floor, finite(p.change_7d, 0))) / 100;
}

/** The fitted value model's features: intercept, log TVL, growth. */
type FeatureFn = (p: SnapshotProtocol) => number[];
const VALUE_FEATURES: Record<string, FeatureFn> = {
  size: (p) => [1, Math.log10(p.tvl_usd)],
  growth: (p) => [1, Math.log10(p.tvl_usd), growthFrac(p, MODEL)],
};

/** Leave-one-out median miss for one feature set. */
function looMiss(comps: SnapshotProtocol[], feat: FeatureFn): number {
  const misses: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const rest = comps.filter((_, j) => j !== i);
    const beta = ols(rest.map(feat), rest.map((p) => Math.log10(p.mcap_usd!)));
    if (beta === null) return NaN;
    const pred = feat(comps[i]!).reduce((s, x, k) => s + x * beta[k]!, 0);
    misses.push(missRatio(10 ** pred, comps[i]!.mcap_usd!));
  }
  return median(misses);
}

/** Walk-forward median miss: earlier listings fit, later listings are priced. */
function wfMiss(comps: SnapshotProtocol[], feat: FeatureFn): number {
  const dated = comps.filter((p) => p.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
  const half = Math.floor(dated.length / 2);
  const train = dated.slice(0, half);
  const test = dated.slice(half);
  const beta = ols(train.map(feat), train.map((p) => Math.log10(p.mcap_usd!)));
  if (beta === null) return NaN;
  return median(test.map((p) => missRatio(10 ** feat(p).reduce((s, x, k) => s + x * beta[k]!, 0), p.mcap_usd!)));
}

/** Leave-one-out median miss for the flat median multiple. */
function looMissFlat(comps: SnapshotProtocol[]): number {
  const misses: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const rest = comps.filter((_, j) => j !== i);
    misses.push(missRatio(comps[i]!.tvl_usd * median(rest.map((p) => marketMultiple(p)!)), comps[i]!.mcap_usd!));
  }
  return median(misses);
}

/** Walk-forward median miss for the flat median multiple. */
function wfMissFlat(comps: SnapshotProtocol[]): number {
  const dated = comps.filter((p) => p.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
  const half = Math.floor(dated.length / 2);
  const train = dated.slice(0, half);
  const test = dated.slice(half);
  const flat = median(train.map((p) => marketMultiple(p)!));
  return median(test.map((p) => missRatio(p.tvl_usd * flat, p.mcap_usd!)));
}

/** Leave-one-out median miss with a shrunk category effect on the residuals. */
function looMissCategory(comps: SnapshotProtocol[], shrinkK: number): number {
  const misses: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const rest = comps.filter((_, j) => j !== i);
    const beta = ols(rest.map(VALUE_FEATURES.size), rest.map((p) => Math.log10(p.mcap_usd!)));
    if (beta === null) return NaN;
    const byCat = new Map<string, number[]>();
    rest.forEach((p) => {
      const r = Math.log10(p.mcap_usd!) - (beta[0]! + beta[1]! * Math.log10(p.tvl_usd));
      const c = p.category ?? 'Uncategorized';
      const list = byCat.get(c) ?? [];
      list.push(r);
      byCat.set(c, list);
    });
    const c = comps[i]!.category ?? 'Uncategorized';
    const list = byCat.get(c) ?? [];
    const effect = list.length === 0 ? 0 : (list.reduce((s, v) => s + v, 0) / list.length) * (list.length / (list.length + shrinkK));
    misses.push(missRatio(10 ** (beta[0]! + beta[1]! * Math.log10(comps[i]!.tvl_usd) + effect), comps[i]!.mcap_usd!));
  }
  return median(misses);
}

/** Walk-forward median miss with a shrunk category effect on the residuals. */
function wfMissCategory(comps: SnapshotProtocol[], shrinkK: number): number {
  const dated = comps.filter((p) => p.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
  const half = Math.floor(dated.length / 2);
  const train = dated.slice(0, half);
  const test = dated.slice(half);
  const beta = ols(train.map(VALUE_FEATURES.size), train.map((p) => Math.log10(p.mcap_usd!)));
  if (beta === null) return NaN;
  const byCat = new Map<string, number[]>();
  train.forEach((p) => {
    const r = Math.log10(p.mcap_usd!) - (beta[0]! + beta[1]! * Math.log10(p.tvl_usd));
    const c = p.category ?? 'Uncategorized';
    const list = byCat.get(c) ?? [];
    list.push(r);
    byCat.set(c, list);
  });
  return median(
    test.map((p) => {
      const c = p.category ?? 'Uncategorized';
      const list = byCat.get(c) ?? [];
      const effect = list.length === 0 ? 0 : (list.reduce((s, v) => s + v, 0) / list.length) * (list.length / (list.length + shrinkK));
      return missRatio(10 ** (beta[0]! + beta[1]! * Math.log10(p.tvl_usd) + effect), p.mcap_usd!);
    }),
  );
}
/** The fitted value model and every test it survived — and the ones it did not. */
export function fitValueModel(snapshot: Snapshot): { evidence: ValueEvidence; predict: (p: SnapshotProtocol) => number; looResiduals: number[] } {
  const comps = cleanComps(snapshot);
  const medianAge = median(comps.map((p) => ageDays(snapshot.as_of, p.listed_at)).filter((a): a is number => a !== null));
  const logAge = (p: SnapshotProtocol): number => Math.log10((ageDays(snapshot.as_of, p.listed_at) ?? medianAge) + 1);
  const logChains = (p: SnapshotProtocol): number => Math.log10(Math.max(p.chains.length, 1));
  const bySlug = [...comps].sort((a, b) => (a.slug < b.slug ? -1 : 1));
  const shuffledGrowth = new Map(bySlug.map((p, i) => [p.slug, growthFrac(bySlug[(i + 1) % bySlug.length]!, MODEL)]));

  // The ablation: each candidate term, held-out both ways. A term enters the
  // model only when it lowers the combined held-out miss by at least 1%
  // without raising either test by more than 2%, judged against the model so
  // far. The selection below runs that rule; the table reports the same
  // numbers. The 1% floor matters: with 91 comparables, a smaller move is
  // noise, and the shuffled control term is the proof — it improves one test
  // by chance and must still fail the rule.
  const flatLoo = looMissFlat(comps);
  const flatWf = wfMissFlat(comps);
  const sizeLoo = looMiss(comps, VALUE_FEATURES.size);
  const sizeWf = wfMiss(comps, VALUE_FEATURES.size);
  const keeps = (loo: number, wf: number, baseLoo: number, baseWf: number): boolean =>
    loo + wf < (baseLoo + baseWf) * 0.99 && loo <= baseLoo * 1.02 && wf <= baseWf * 1.02;

  const growthFeat: FeatureFn = (p) => [1, Math.log10(p.tvl_usd), growthFrac(p, MODEL)];
  const growthLoo = looMiss(comps, growthFeat);
  const growthWf = wfMiss(comps, growthFeat);
  const growthKept = keeps(growthLoo, growthWf, sizeLoo, sizeWf);

  const baseFeat = growthKept ? growthFeat : VALUE_FEATURES.size;
  const baseLoo = growthKept ? growthLoo : sizeLoo;
  const baseWf = growthKept ? growthWf : sizeWf;
  const ageFeat: FeatureFn = (p) => [...baseFeat(p), logAge(p)];
  const ageLoo = looMiss(comps, ageFeat);
  const ageWf = wfMiss(comps, ageFeat);
  const ageKept = keeps(ageLoo, ageWf, baseLoo, baseWf);

  const feat2 = ageKept ? ageFeat : baseFeat;
  const loo2 = ageKept ? ageLoo : baseLoo;
  const wf2 = ageKept ? ageWf : baseWf;
  const chainsFeat: FeatureFn = (p) => [...feat2(p), logChains(p)];
  const chainsLoo = looMiss(comps, chainsFeat);
  const chainsWf = wfMiss(comps, chainsFeat);
  const chainsKept = keeps(chainsLoo, chainsWf, loo2, wf2);

  const feat = chainsKept ? chainsFeat : feat2;
  const allFeat: FeatureFn = (p) => [1, Math.log10(p.tvl_usd), growthFrac(p, MODEL), logAge(p), logChains(p)];
  const allLoo = looMiss(comps, allFeat);
  const allWf = wfMiss(comps, allFeat);
  const catLoo = looMissCategory(comps, 3);
  const catWf = wfMissCategory(comps, 3);
  const catKept = keeps(catLoo, catWf, sizeLoo, sizeWf);
  const controlFeat: FeatureFn = (p) => [...feat(p), shuffledGrowth.get(p.slug)!];
  const controlLoo = looMiss(comps, controlFeat);
  const controlWf = wfMiss(comps, controlFeat);

  const beta = ols(comps.map(feat), comps.map((p) => Math.log10(p.mcap_usd!)));
  if (beta === null) throw new SnapshotError('the value model has no fit: the comparables are singular');
  const predict = (p: SnapshotProtocol): number => feat(p).reduce((s, x, k) => s + x * beta[k]!, 0);

  // Leave-one-out residuals under the fitted model, for the band and its honesty.
  const looResiduals: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const rest = comps.filter((_, j) => j !== i);
    const b = ols(rest.map(feat), rest.map((p) => Math.log10(p.mcap_usd!)));
    if (b === null) continue;
    looResiduals.push(Math.log10(comps[i]!.mcap_usd!) - feat(comps[i]!).reduce((s, x, k) => s + x * b[k]!, 0));
  }
  const bandP25 = 10 ** quantile(looResiduals, 0.25);
  const bandP75 = 10 ** quantile(looResiduals, 0.75);
  const bandP10 = 10 ** quantile(looResiduals, 0.1);
  const bandP90 = 10 ** quantile(looResiduals, 0.9);
  const inside = (lo: number, hi: number): number => looResiduals.filter((r) => r >= Math.log10(lo) && r <= Math.log10(hi)).length / looResiduals.length;

  const residuals = comps.map((p) => Math.log10(p.mcap_usd!) - predict(p));
  const residualSd = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / residuals.length);

  const evidence: ValueEvidence = {
    comps: comps.length,
    intercept: round4(beta[0]!),
    slope_log_tvl: round4(beta[1]!),
    coef_growth: round4(growthKept ? beta[2]! : 0),
    terms: ['intercept', 'log10(TVL)', ...(growthKept ? ['growth'] : []), ...(ageKept ? ['log age'] : []), ...(chainsKept ? ['log chains'] : [])],
    coefficients: beta.map(round4),
    residual_sd_log10: round4(residualSd),
    band_p25: round4(bandP25),
    band_p75: round4(bandP75),
    band_p10: round4(bandP10),
    band_p90: round4(bandP90),
    honesty_p25_p75: round4(inside(bandP25, bandP75)),
    honesty_p10_p90: round4(inside(bandP10, bandP90)),
    ablation: [
      { term: 'flat median multiple', loo_miss: round2(flatLoo), wf_miss: round2(flatWf), verdict: 'baseline' },
      { term: '+ size curve, in TVL', loo_miss: round2(sizeLoo), wf_miss: round2(sizeWf), verdict: 'kept' },
      { term: '+ 7-day TVL growth', loo_miss: round2(growthLoo), wf_miss: round2(growthWf), verdict: growthKept ? 'kept' : 'not kept' },
      { term: '+ age, years listed', loo_miss: round2(ageLoo), wf_miss: round2(ageWf), verdict: ageKept ? 'kept' : 'not kept' },
      { term: '+ chain count', loo_miss: round2(chainsLoo), wf_miss: round2(chainsWf), verdict: chainsKept ? 'kept' : 'not kept' },
      { term: '+ age + chains together', loo_miss: round2(allLoo), wf_miss: round2(allWf), verdict: 'not kept' },
      { term: '+ category effect, shrunk', loo_miss: round2(catLoo), wf_miss: round2(catWf), verdict: catKept ? 'kept' : 'not kept' },
      { term: '+ control: shuffled growth', loo_miss: round2(controlLoo), wf_miss: round2(controlWf), verdict: 'control' },
    ],
  };
  return { evidence, predict, looResiduals };
}

/** The fitted odds model and its evidence. */
export function fitOddsModel(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
): {
  evidence: OddsEvidence;
  predict: (p: SnapshotProtocol) => number;
  features: (p: SnapshotProtocol) => { log_tvl: number; log_age: number; cat_rate: number; growth: number };
} {
  const peers = snapshot.protocols.filter((p) => exclusionReason(p) === null);
  const y = peers.map((p) => (isPreToken(p) ? 0 : 1));
  const baseRate = y.reduce((s, v) => s + v, 0) / y.length;
  const ages = peers.map((p) => ageDays(snapshot.as_of, p.listed_at)).filter((a): a is number => a !== null);
  const medianAge = median(ages);
  const logAge = (p: SnapshotProtocol): number => Math.log10((ageDays(snapshot.as_of, p.listed_at) ?? medianAge) + 1);

  // Each category's token rate, shrunk toward the base rate.
  const byCat = new Map<string, { n: number; t: number }>();
  for (const p of peers) {
    const c = p.category ?? 'Uncategorized';
    const s = byCat.get(c) ?? { n: 0, t: 0 };
    s.n++;
    if (!isPreToken(p)) s.t++;
    byCat.set(c, s);
  }
  const catRate = (p: SnapshotProtocol): number => {
    const s = byCat.get(p.category ?? 'Uncategorized');
    if (s === undefined) return baseRate;
    return (s.t + model.category_prior * baseRate) / (s.n + model.category_prior);
  };

  const terms: { name: string; fn: (p: SnapshotProtocol) => number }[] = [
    { name: 'size, in TVL', fn: (p) => Math.log10(p.tvl_usd) },
    { name: 'age, years listed', fn: logAge },
    { name: 'category token rate', fn: catRate },
    { name: '7-day TVL growth', fn: (p) => growthFrac(p, model) },
  ];
  const dated = peers.filter((p) => p.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
  const half = Math.floor(dated.length / 2);
  const train = dated.slice(0, half);
  const test = dated.slice(half);
  const trainBase = train.filter((p) => !isPreToken(p)).length / train.length;

  const score = (feat: FeatureFn): { brier: number; wf: number } => {
    const m = fitLogistic(peers.map(feat), y);
    const brier = brierScore(peers.map((p) => predictLogistic(m, feat(p))), y);
    const m2 = fitLogistic(train.map(feat), train.map((p) => (isPreToken(p) ? 0 : 1)));
    const wf = brierScore(test.map((p) => predictLogistic(m2, feat(p))), test.map((p) => (isPreToken(p) ? 0 : 1)));
    return { brier, wf };
  };
  const baseBrier = brierScore(peers.map(() => baseRate), y);
  const wfBaseBrier = brierScore(test.map(() => trainBase), test.map((p) => (isPreToken(p) ? 0 : 1)));
  // A term is kept when it lowers the combined Brier score by at least 1%
  // without raising either test by more than 2%, judged against the model
  // so far.
  const keeps = (b: number, w: number, baseB: number, baseW: number): boolean => b + w < (baseB + baseW) * 0.99 && b <= baseB * 1.02 && w <= baseW * 1.02;

  // Sequential selection: each term is tested against the model so far, and
  // the fitted model uses exactly the terms the rule kept.
  const keptTerms: { name: string; fn: (p: SnapshotProtocol) => number }[] = [];
  const ablation: OddsAblationRow[] = [{ term: 'base rate, no terms', brier: round4(baseBrier), wf_brier: round4(wfBaseBrier), verdict: 'baseline' }];
  let curBrier = baseBrier;
  let curWf = wfBaseBrier;
  for (const t of terms) {
    const trial: FeatureFn = (p) => [1, ...keptTerms.map((k) => k.fn(p)), t.fn(p)];
    const s = score(trial);
    const kept = keeps(s.brier, s.wf, curBrier, curWf);
    ablation.push({ term: `+ ${t.name}`, brier: round4(s.brier), wf_brier: round4(s.wf), verdict: kept ? 'kept' : 'not kept' });
    if (kept) {
      keptTerms.push(t);
      curBrier = s.brier;
      curWf = s.wf;
    }
  }
  const feat: FeatureFn = (p) => [1, ...keptTerms.map((k) => k.fn(p))];
  const full = fitLogistic(peers.map(feat), y);

  const evidence: OddsEvidence = {
    peers: peers.length,
    with_token: y.reduce((s, v) => s + v, 0),
    base_rate: round4(baseRate),
    base_brier: round4(baseBrier),
    brier: round4(curBrier),
    wf_brier: round4(curWf),
    wf_base_brier: round4(wfBaseBrier),
    weights: full.weights.map(round4),
    ablation,
  };
  const predict = (p: SnapshotProtocol): number => {
    const odds = predictLogistic(full, feat(p));
    return Math.min(model.odds_cap, Math.max(model.odds_floor, odds));
  };
  /** The odds features the model read for one protocol, for the breakdown. */
  const features = (p: SnapshotProtocol): { log_tvl: number; log_age: number; cat_rate: number; growth: number } => ({
    log_tvl: Math.log10(p.tvl_usd),
    log_age: logAge(p),
    cat_rate: catRate(p),
    growth: growthFrac(p, model),
  });
  return { evidence, predict, features };
}

/** The snapshot's protocols by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** A step as one string: action, cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** A second chain when the protocol runs on more than one, else the first. */
function secondChainOf(p: SnapshotProtocol): string {
  if (p.chains.length > 1) return p.chains[1]!;
  return chainOf(p);
}

/**
 * The category's two actions, in the words a farmer can follow. The first opens
 * the position; the second adds a different qualifying action, so the plan is
 * not one deposit repeated.
 */
function actionsFor(p: SnapshotProtocol, capital: number, chain: string, chain2: string): [string, string] {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return [
      `Supply $${capital} of USDC to ${n} on ${chain} and keep the position open.`,
      `Borrow a small amount against that supply, then repay half of it, so the position shows both sides of the market.`,
    ];
  }
  if (c.includes('dex') || c.includes('leveraged farm')) {
    return [
      `Provide $${capital} of liquidity to ${n}'s deepest pool on ${chain} and keep the position open.`,
      `Swap a small amount through ${n} on ${chain2} so the wallet shows volume on a second chain.`,
    ];
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis')) {
    return [
      `Deposit $${capital} of USDC as margin on ${n} and open one small hedged position.`,
      `Close and reopen a small position once a week so the account shows steady trading activity.`,
    ];
  }
  if (c.includes('prediction')) {
    return [
      `Fund $${capital} and take one position on ${n}'s most liquid market.`,
      `Take a second, opposite-side position in a different market so the account shows two markets.`,
    ];
  }
  if (c.includes('curator') || c.includes('allocator')) {
    return [
      `Deposit $${capital} into a ${n} vault on ${chain} and keep the shares.`,
      `Deposit a smaller amount into a second ${n} vault on ${chain2} to spread the position across vaults.`,
    ];
  }
  if (c.includes('stable')) {
    return [
      `Mint or deposit $${capital} of the stable asset through ${n} on ${chain}.`,
      `Move half of the minted asset into ${n}'s savings or staking option and hold it there.`,
    ];
  }
  if (c.includes('rwa')) {
    return [
      `Mint $${capital} of ${n}'s yield-bearing asset on ${chain} and hold it.`,
      `If the asset can be used as collateral, supply a small part of it to a lending market and keep the loan small.`,
    ];
  }
  if (c.includes('insurance')) {
    return [
      `Buy $${capital} of cover from ${n} on ${chain} and keep the policy active.`,
      `Renew or extend the cover once before it lapses so the account shows a second purchase.`,
    ];
  }
  if (c.includes('yield') || c.includes('aggregator')) {
    return [
      `Deposit $${capital} into ${n}'s highest-TVL strategy on ${chain} and keep the shares.`,
      `Claim the strategy's rewards once and redeposit them, so the account shows a harvest.`,
    ];
  }
  if (c.includes('chain')) {
    return [
      `Bridge $${capital} of USDC to the chain ${n} runs and use it in one of its own apps.`,
      `Make one transaction a week on the chain, such as a swap or a stake, to keep the address active.`,
    ];
  }
  if (c.includes('payment')) {
    return [
      `Fund $${capital} and make one payment through ${n} on ${chain}.`,
      `Set up a second payment in the following week so the account shows repeat use.`,
    ];
  }
  if (c.includes('governance') || c.includes('incentive')) {
    return [
      `Deposit $${capital} into ${n} on ${chain} and keep the position open.`,
      `Vote once in ${n}'s governance with the position, if a vote is live, and keep the receipt.`,
    ];
  }
  return [
    `Deposit $${capital} of USDC into ${n} on ${chain} and keep the position open.`,
    `Make a second, different action in ${n} on ${chain2}, such as a deposit, a swap or a vote.`,
  ];
}

/** A protocol's farm plan: six steps, the last carrying the costed verdict. */
export function farmSteps(p: SnapshotProtocol, age: number | null, verdict: BoardRow['verdict'], net: number, breakeven: number, deposit: number): FarmStep[] {
  const chain = chainOf(p);
  const chain2 = secondChainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const [first, second] = actionsFor(p, capital, chain, chain2);
  const gas = capital >= 150 ? 8 : 4;
  const verdictLine =
    verdict === 'FARM'
      ? `This plan pays even at the low end of the band: expected net $${net.toFixed(0)} on a $${deposit} deposit after fees.`
      : verdict === 'MARGINAL'
        ? `This plan pays at the point estimate only: expected net $${net.toFixed(0)} on a $${deposit} deposit after fees, and it loses at the low end of the band.`
        : `This plan does not pay at a $${deposit} deposit: expected net $${net.toFixed(0)} after fees. It pays only if the launch tops about $${breakeven >= 1_000_000 ? `${(breakeven / 1_000_000).toFixed(1)}M` : `${Math.round(breakeven).toLocaleString('en-US')}`}.`;
  return [
    {
      text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.',
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    { text: first, cost: `$${capital} of capital and about $${gas} of gas`, time: '15 minutes to set up' },
    { text: second, cost: 'about $3 of gas, no new capital', time: '10 minutes' },
    {
      text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.',
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `${verdictLine} Before you withdraw, open ${p.name}'s own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
  ];
}

/** The ranked board: the whole watchlist, then every other rankable pre-token protocol. */
export function buildBoard(
  snapshot: Snapshot,
  value: ReturnType<typeof fitValueModel>,
  odds: ReturnType<typeof fitOddsModel>,
  model: ModelConstants = MODEL,
): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const watch = new Set(snapshot.watchlist);
  const ev = value.evidence;
  const rows = [...chosen.values()].map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const fittedLog = value.predict(p);
    const ifLaunches = 10 ** fittedLog;
    const bandLow = ifLaunches * ev.band_p25;
    const bandHigh = ifLaunches * ev.band_p75;
    const oddsValue = odds.predict(p);
    const implied = Math.max(1, Math.round(ifLaunches * oddsValue));

    // The farm economics, from the stated assumptions.
    const deposit = capitalFor(p);
    const hold = holdDaysFor(age);
    const farmers = Math.min(model.max_farmers, Math.max(model.min_farmers, Math.round(p.tvl_usd / model.tvl_per_farmer)));
    const dropPool = ifLaunches * model.drop_share;
    const expectedDrop = (dropPool / farmers) * oddsValue;
    const gas = deposit >= 150 ? model.gas_large : model.gas_small;
    const fees = gas + model.gas_weekly * Math.ceil(hold / 7) + model.gas_claim;
    const opportunity = deposit * model.opportunity_apy * (hold / 365);
    const net = expectedDrop - fees - opportunity;
    const netLow = (bandLow * model.drop_share / farmers) * oddsValue - fees - opportunity;
    const verdict: BoardRow['verdict'] = netLow > 0 ? 'FARM' : net > 0 ? 'MARGINAL' : 'SKIP';
    const hours = 0.5 + (hold / 7) * (10 / 60) + 0.2;
    const breakeven = (fees + opportunity) / (model.drop_share / farmers * oddsValue);

    const oddsFeat = odds.features(p);
    const breakdown: ModelBreakdown = {
      log_tvl: round4(Math.log10(p.tvl_usd)),
      growth_pct: round4(growthFrac(p, model) * 100),
      fitted_log_mcap: round4(fittedLog),
      if_launches_usd: Math.round(ifLaunches),
      band_low_usd: Math.round(bandLow),
      band_high_usd: Math.round(bandHigh),
      odds: round4(oddsValue),
      odds_log_tvl: round4(oddsFeat.log_tvl),
      odds_log_age: round4(oddsFeat.log_age),
      odds_cat_rate: round4(oddsFeat.cat_rate),
      odds_growth: round4(oddsFeat.growth),
      deposit_usd: deposit,
      farmers,
      drop_pool_usd: Math.round(dropPool),
      expected_drop_usd: round2(expectedDrop),
      fees_usd: round2(fees),
      opportunity_usd: round2(opportunity),
      hours: round2(hours),
      age_days: age,
    };
    return {
      p,
      implied,
      ifLaunches,
      bandLow,
      bandHigh,
      oddsValue,
      verdict,
      net,
      netLow,
      hours,
      breakeven,
      breakdown,
    };
  });
  rows.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return rows.map((r, i) => ({
    rank: i + 1,
    slug: r.p.slug,
    name: r.p.name,
    category: r.p.category,
    chains: r.p.chains,
    tvl_usd: r.p.tvl_usd,
    change_7d: r.p.change_7d,
    age_days: r.breakdown.age_days,
    token_status: 'pre-token',
    on_watchlist: watch.has(r.p.slug),
    implied_value_usd: r.implied,
    if_launches_usd: Math.round(r.ifLaunches),
    band_low_usd: Math.round(r.bandLow),
    band_high_usd: Math.round(r.bandHigh),
    odds: round4(r.oddsValue),
    verdict: r.verdict,
    net_usd: round2(r.net),
    net_hour_usd: round2(r.net / r.hours),
    breakeven_usd: Math.round(r.breakeven),
    model: r.breakdown,
    farm_steps: farmSteps(r.p, r.breakdown.age_days, r.verdict, r.net, r.breakeven, r.breakdown.deposit_usd).map(stepText),
  }));
}

/** The 758-protocol ledger: every protocol in exactly one group. */
export function buildLedger(snapshot: Snapshot, board: BoardRow[]): LedgerGroup[] {
  const ranked = new Set(board.map((r) => r.slug));
  const watch = new Set(snapshot.watchlist);
  const groups: Record<string, number> = {
    'ranked-watchlist': 0,
    'ranked-early': 0,
    'ranked-offlist': 0,
    'priced-comp': 0,
    'token-no-cap': 0,
    'out-bridge': 0,
    'out-liquid-staking': 0,
    'out-exchange': 0,
    'out-versioned-wrapped': 0,
  };
  for (const p of snapshot.protocols) {
    if (ranked.has(p.slug)) {
      if (watch.has(p.slug)) groups['ranked-watchlist']!++;
      else if (p.tvl_usd >= snapshot.floor_usd) groups['ranked-offlist']!++;
      else groups['ranked-early']!++;
      continue;
    }
    const reason = exclusionReason(p);
    if (reason !== null) {
      groups[`out-${reason}`]!++;
      continue;
    }
    if (!isPreToken(p) && marketMultiple(p) !== null) groups['priced-comp']!++;
    else groups['token-no-cap']!++;
  }
  const labels: Record<string, [string, string]> = {
    'ranked-watchlist': ['Ranked · watchlist', 'on the house list'],
    'ranked-early': ['Ranked · early, below the floor', 'pre-token, under $50M TVL'],
    'ranked-offlist': ['Ranked · off-list, above the floor', 'pre-token, over $50M, not on the list'],
    'priced-comp': ['Token trades · priced comp', 'fitted the value model'],
    'token-no-cap': ['Token recorded · no usable cap', 'has a token, no market cap to price from'],
    'out-bridge': ['Out · bridge', 'moves value, launches nothing of its own'],
    'out-liquid-staking': ['Out · liquid staking', 'a staked-token product'],
    'out-exchange': ['Out · exchange', 'an exchange or its product'],
    'out-versioned-wrapped': ['Out · versioned or wrapped', 'a pool or a wrapped product'],
  };
  return Object.entries(groups).map(([key, count]) => ({ key, label: labels[key]![0], count, detail: labels[key]![1] }));
}

/** The live-token protocols, by market cap, for the dashboard's Live view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mcap_tvl: marketMultiple(p) === null ? null : round4(marketMultiple(p)!),
    }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const value = fitValueModel(snapshot);
  const odds = fitOddsModel(snapshot, model);
  const board = buildBoard(snapshot, value, odds, model);
  const live = liveRows(snapshot);
  const ledger = buildLedger(snapshot, board);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const aboveOff = board.filter((r) => !r.on_watchlist && r.tvl_usd >= snapshot.floor_usd).length;
  const checksum = checksumOf(JSON.stringify(board.map((r) => [r.slug, r.rank, r.implied_value_usd])));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    above_floor_off_list: aboveOff,
    total_implied_usd: board.reduce((n, r) => n + r.implied_value_usd, 0),
    total_if_launches_usd: board.reduce((n, r) => n + r.if_launches_usd, 0),
    farm_count: board.filter((r) => r.verdict === 'FARM').length,
    marginal_count: board.filter((r) => r.verdict === 'MARGINAL').length,
    skip_count: board.filter((r) => r.verdict === 'SKIP').length,
    value: value.evidence,
    odds: odds.evidence,
    ledger,
    checksum,
    rows: board,
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
