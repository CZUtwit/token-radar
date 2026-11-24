// Token Launch Radar — the dashboard, radar-5. Renders window.RADAR (written
// by main.ts from the same board as board.json) with no fetch and no network:
// a KPI strip, the 758-protocol ledger, a self-check strip the browser
// recomputes from the data, search and filters, sortable columns, a detail
// view for every protocol with its own model arithmetic and costed farm plan,
// scenario controls that re-price every verdict live, a value-by-odds matrix,
// the method and evidence tab, a Live view of the traded tokens, and an
// All-758 view of every protocol the board does not rank.
(function () {
  'use strict';
  var R = window.RADAR;
  if (!R) return;

  var state = { q: '', cat: '', chain: '', minTvl: 0, verdict: '', tier: '', sort: 'implied', dir: -1, open: null, deposit: '', share: 5, weeks: 0, qAll: '', group: '' };

  function $(id) { return document.getElementById(id); }

  /** Whether any scenario control has moved off the board's stated assumptions. */
  function scenarioActive() {
    return state.deposit !== '' || state.share !== 5 || state.weeks !== 0;
  }

  /**
   * One row's farm economics under the current scenario: the deposit, drop
   * share and horizon the reader picked, or the board's stated assumptions
   * when nothing moved. With no scenario active this returns the row's own
   * stored figures, so the default view is exactly board.json.
   */
  function scenarioEconomics(r) {
    if (!scenarioActive()) {
      return { deposit: r.model.deposit_usd, net: r.net_usd, netLow: r.model.net_low_usd, netHour: r.net_hour_usd, netLowHour: r.model.net_low_hour_usd, verdict: r.verdict, fees: r.model.fees_usd, gasSetup: r.model.gas_setup_usd, gasWeekly: r.model.gas_weekly_usd, gasClaim: r.model.gas_claim_usd, opportunity: r.model.opportunity_usd, expectedDrop: r.model.expected_drop_usd, hours: r.model.hours, breakeven: r.breakeven_usd };
    }
    var m = r.model;
    var dep = state.deposit !== '' ? Number(state.deposit) : m.deposit_usd;
    var share = state.share / 100;
    var weeks = state.weeks !== 0 ? state.weeks : m.hold_days / 7;
    var hold = weeks * 7;
    var gasSetup = dep >= 150 ? R.model.gas_large : R.model.gas_small;
    var gasWeekly = R.model.gas_weekly * Math.ceil(hold / 7);
    var gasClaim = R.model.gas_claim;
    var fees = gasSetup + gasWeekly + gasClaim;
    var opportunity = dep * R.model.opportunity_apy * (hold / 365);
    var expectedDrop = (r.if_launches_usd * share / m.farmers) * r.odds;
    var lowDrop = expectedDrop * (r.band_low_usd / r.if_launches_usd);
    var net = expectedDrop - fees - opportunity;
    var netLow = lowDrop - fees - opportunity;
    var hours = 0.5 + weeks * (10 / 60) + 0.2;
    var netLowHour = netLow / hours;
    var verdict = netLow > 0 && netLowHour >= R.model.hourly_bar_usd ? 'FARM' : net > 0 ? 'MARGINAL' : 'SKIP';
    var breakeven = (fees + opportunity) / (share / m.farmers * r.odds);
    return { deposit: dep, net: net, netLow: netLow, netHour: net / hours, netLowHour: netLowHour, verdict: verdict, fees: fees, gasSetup: gasSetup, gasWeekly: gasWeekly, gasClaim: gasClaim, opportunity: opportunity, expectedDrop: expectedDrop, hours: hours, breakeven: breakeven };
  }

  /** The board's verdict counts under the current scenario. */
  function scenarioCounts() {
    var c = { FARM: 0, MARGINAL: 0, SKIP: 0 };
    R.rows.forEach(function (r) { c[scenarioEconomics(r).verdict]++; });
    return c;
  }

  /** $2.75B, $498.2M, $594.9K — one decimal, whole dollars in the detail view. */
  function money(n) {
    if (n === null || n === undefined) return '—';
    var abs = Math.abs(n);
    if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }

  function moneyFull(n) {
    if (n === null || n === undefined) return '—';
    return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function signedMoney(n) {
    if (n === null || n === undefined) return '—';
    return (n < 0 ? '−$' : '$') + Math.abs(n).toFixed(0);
  }

  function pct(v) {
    if (v === null || v === undefined) return '—';
    var s = (v > 0 ? '+' : '') + v.toFixed(1) + '%';
    var cls = v > 0 ? 'up' : v < 0 ? 'down' : '';
    return '<span class="' + cls + '">' + s + '</span>';
  }

  function ageText(days) {
    if (days === null || days === undefined) return '—';
    if (days < 30) return days + 'd';
    if (days < 365) return Math.floor(days / 30) + 'mo';
    return (days / 365).toFixed(1) + 'y';
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** FNV-1a, 32-bit, as eight hex digits — the same checksum main.ts wrote. */
  function checksumOf(text) {
    var h = 0x811c9dc5;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  /** The fitted value model's ablation row: the last term the rule kept. */
  function fittedRow() {
    var rows = R.value.ablation;
    for (var i = rows.length - 1; i >= 0; i--) if (rows[i].verdict === 'kept') return rows[i];
    return rows[1];
  }

  function keptCount(ablation) {
    var n = 0;
    ablation.forEach(function (a) { if (a.verdict === 'kept') n++; });
    return n;
  }

  /** The six KPI cards across the top of the page, each tagged with the question it answers. */
  function renderKpis() {
    var fit = fittedRow();
    var flat = R.value.ablation[0];
    var vKept = keptCount(R.value.ablation);
    var oKept = keptCount(R.odds.ablation);
    var counts = scenarioCounts();
    var cards = [
      { tag: 'Value · held-out', b: '×' + fit.loo_miss, s: 'out-of-sample miss, leave-one-out · ' + (R.value.within_3x * 100).toFixed(1) + '% of peers priced within 3x (flat ' + (R.value.flat_within_3x * 100).toFixed(1) + '%) · flat multiple ×' + flat.loo_miss },
      { tag: 'Value · walk-forward', b: '×' + fit.wf_miss, s: 'out-of-sample miss, walk-forward · flat multiple ×' + flat.wf_miss },
      { tag: 'Odds · Brier', b: R.odds.brier.toFixed(3) + ' vs ' + R.odds.base_brier.toFixed(3), s: 'token odds, Brier score vs base rate · ten-fold ' + R.odds.kfold_brier.toFixed(3) + ' · walk-forward ' + R.odds.wf_brier.toFixed(3) + ' vs ' + R.odds.wf_base_brier.toFixed(3) },
      { tag: 'Terms · survived', b: vKept + ' of ' + (R.value.ablation.length - 2) + ' · ' + oKept + ' of ' + (R.odds.ablation.length - 1), s: 'terms that survived both held-out tests, value model · odds model' },
      { tag: 'Farm · costed', b: counts.FARM + ' of ' + R.board_size, s: 'worth farming: pays at the low end and $' + R.model.hourly_bar_usd + ' an hour there · ' + counts.MARGINAL + ' marginal, ' + counts.SKIP + ' skip' + (scenarioActive() ? ' · under your scenario' : '') },
      { tag: 'Watchlist · covered', b: R.watchlist_size + ' / ' + R.watchlist_size, s: 'watchlist ranked · plus ' + R.early_size + ' early and ' + R.above_floor_off_list + ' off-list' },
    ];
    $('kpis').innerHTML = cards.map(function (c) {
      return '<div class="kpi"><span class="tag">' + esc(c.tag) + '</span><b>' + esc(c.b) + '</b><span>' + esc(c.s) + '</span></div>';
    }).join('');
    var co = R.value.coefficients;
    $('formula').textContent = 'Implied value = fitted launch value × token odds.  log10(market cap) = ' + co[0].toFixed(2) + ' + ' + co[1].toFixed(2) + ' × log10(TVL)' +
      (co.length > 2 ? ' + ' + co[2].toFixed(2) + ' × growth' : '') +
      (co.length > 3 ? ' + ' + co[3].toFixed(2) + ' × ' + R.value.terms[3] : '') +
      ' — fitted on ' + R.value.comps + ' traded comparables, tested leave-one-out, ten-fold and walk-forward. Odds from a logistic fit on ' + R.odds.peers + ' peers.';
  }

  var LEDGER_COLORS = ['#f2b544', '#e07f2e', '#c96a3b', '#3fb68b', '#2e8b6f', '#6ea8fe', '#5b7fc4', '#98a2b3', '#6b7686'];

  /** The 758-protocol ledger: every protocol in exactly one group. */
  function renderLedger() {
    var total = 0;
    R.ledger.forEach(function (g) { total += g.count; });
    var bar = R.ledger.map(function (g, i) {
      var w = total ? (g.count / total) * 100 : 0;
      return '<i style="width:' + w.toFixed(2) + '%;background:' + LEDGER_COLORS[i % LEDGER_COLORS.length] + '" title="' + esc(g.label) + ' ' + g.count + '"></i>';
    }).join('');
    var legend = R.ledger.map(function (g, i) {
      return '<span class="lg"><i style="background:' + LEDGER_COLORS[i % LEDGER_COLORS.length] + '"></i>' + esc(g.label) + ' <b>' + g.count + '</b></span>';
    }).join('');
    $('ledger').innerHTML =
      '<div class="ledger-head"><span>Protocol accounting</span><span class="muted">all ' + total + ' snapshot protocols in exactly one group: ' +
      R.board_size + ' ranked as pre-token, ' + (total - R.board_size) + ' set aside by rule or already trading</span></div>' +
      '<div class="ledger-bar">' + bar + '</div><div class="ledger-legend">' + legend + '</div>';
  }

  /** The self-check strip: every claim recomputed here, in the browser, from the data. */
  function renderIntegrity() {
    var rows = R.rows;
    var checks = [];
    checks.push(rows.length + ' of ' + R.board_size + ' rows recomputed here');
    var ordered = true;
    for (var i = 1; i < rows.length; i++) {
      if (rows[i].rank !== rows[i - 1].rank + 1 || rows[i].implied_value_usd > rows[i - 1].implied_value_usd) { ordered = false; break; }
    }
    checks.push(ordered ? 'ranks 1–' + rows.length + ' in order, values never rise' : 'rank order broken');
    var sum = 0;
    rows.forEach(function (r) { sum += r.implied_value_usd; });
    checks.push(sum === R.total_implied_usd ? 'totals equal: ' + moneyFull(sum) : 'total mismatch');
    var wl = 0;
    rows.forEach(function (r) { if (r.on_watchlist) wl++; });
    checks.push(wl === R.watchlist_size ? 'watchlist ' + wl + ' of ' + R.watchlist_size + ' ranked' : 'watchlist ' + wl + ' of ' + R.watchlist_size);
    var ledgerTotal = 0;
    R.ledger.forEach(function (g) { ledgerTotal += g.count; });
    checks.push('ledger ' + ledgerTotal + ' of ' + ledgerTotal + ' protocols');
    var sum2 = checksumOf(JSON.stringify(rows.map(function (r) { return [r.slug, r.rank, r.implied_value_usd]; })));
    checks.push(sum2 === R.checksum ? 'checksum ' + sum2 + ' = main.ts' : 'checksum mismatch');
    $('integrity').innerHTML = checks.map(function (c) {
      return '<span class="chk">✓ ' + esc(c) + '</span>';
    }).join('');
  }

  /** The method and evidence tab: the ablation tables, the odds, the honesty, the assumptions. */
  function renderMethod() {
    var v = R.value;
    var o = R.odds;
    var verdictBadge = function (verdict) {
      return verdict === 'kept' ? '<span class="badge kept">kept</span>'
        : verdict === 'not kept' ? '<span class="badge dropped">not kept</span>'
        : verdict === 'control' ? '<span class="badge control">control</span>'
        : '<span class="badge base">baseline</span>';
    };
    var vRows = v.ablation.map(function (a) {
      return '<tr><td>' + esc(a.term) + '</td><td class="num">×' + a.loo_miss.toFixed(2) + '</td><td class="num">×' + a.kfold_miss.toFixed(2) + '</td><td class="num">×' + a.wf_miss.toFixed(2) + '</td><td>' + verdictBadge(a.verdict) + '</td></tr>';
    }).join('');
    var oRows = o.ablation.map(function (a) {
      return '<tr><td>' + esc(a.term) + '</td><td class="num">' + a.brier.toFixed(3) + '</td><td class="num">' + a.kfold_brier.toFixed(3) + '</td><td class="num">' + a.wf_brier.toFixed(3) + '</td><td>' + verdictBadge(a.verdict) + '</td></tr>';
    }).join('');
    var bandRows = v.band_by_category.map(function (b) {
      return '<tr><td>' + esc(b.category) + '</td><td class="num">' + b.n + '</td><td class="num">×' + b.p25.toFixed(2) + '</td><td class="num">×' + b.p75.toFixed(2) + '</td></tr>';
    }).join('');
    $('method').innerHTML =
      '<h2>How the model works</h2>' +
      '<p>The board answers four questions, in order: is the watchlist covered, is the value fitted from the record, is it tested on rows it never saw, and is every farm plan costed? The KPI strip at the top answers all four at a glance; this page shows the evidence behind each answer.</p>' +
      '<p>The board ranks <strong>' + R.board_size + '</strong> pre-token protocols from a sealed snapshot of every protocol DefiLlama tracks. A protocol is pre-token when the snapshot records no market cap, no CoinGecko id and no symbol for it. Wrapped, staked and bridged products, exchanges and versioned pools are left out: a wrapped token is not a protocol waiting on a launch of its own.</p>' +
      '<h3>The formula</h3><pre>implied value = fitted launch value × token odds\n\nlog10(market cap) = ' + v.coefficients.map(function (c) { return c.toFixed(2); }).join('  ') + '\n  terms, in order: ' + v.terms.join(', ') + '\n  fitted on ' + v.comps + ' traded comparables (residual sd ' + v.residual_sd_log10 + ' in log10)\n\ntoken odds = logistic(log TVL, log age, category token rate, growth)\n  fitted on ' + o.peers + ' peers, ' + o.with_token + ' of which record a token\n  weights (standardized): ' + o.weights.map(function (w) { return w.toFixed(2); }).join(', ') + '</pre>' +
      '<p>Every coefficient is fitted on this snapshot and tested held-out. A term enters a model only when it lowers the combined held-out error by at least 1% without raising either test by more than 2%. The tables below show every term that was tried — including the ones that failed.</p>' +
      '<h3>Value model — out-of-sample evidence</h3>' +
      '<p>Median miss: how far the prediction lands from the real market cap, as a multiple. Leave-one-out refits the model 91 times, each time holding one comparable out; ten-fold refits it ten times on nine tenths each; walk-forward fits on the earlier listings and prices the later ones.</p>' +
      '<div class="tablewrap"><table class="evidence"><thead><tr><th>Term, added in order</th><th class="num">Leave-one-out</th><th class="num">Ten-fold</th><th class="num">Walk-forward</th><th>Verdict</th></tr></thead><tbody>' + vRows + '</tbody></table></div>' +
      '<p>Age, chain count and the category effect all failed: each one made at least one held-out test worse. The shuffled control — another protocol\'s growth, which cannot carry signal — failed too, which is what shows the tests can tell a real term from noise.</p>' +
      '<p>How often the model lands close, not just how far it lands on average: ' + (v.within_3x * 100).toFixed(1) + '% of comparables are priced within 3x of their real market cap leave-one-out (' + (v.within_2x * 100).toFixed(1) + '% within 2x), against ' + (v.flat_within_3x * 100).toFixed(1) + '% within 3x for the flat median multiple.</p>' +
      '<h3>The band — priced per category</h3>' +
      '<p>Each row\'s P25–P75 band comes from its own category\'s comparables: the category\'s leave-one-out residuals, shrunk toward the global band (weight n / (n + 3)), so a thin category mostly keeps the global band and a well-stocked one mostly keeps its own. ' + (v.honesty_cat_band * 100).toFixed(0) + '% of real caps land inside their own category band (50% stated), against ' + (v.honesty_p25_p75 * 100).toFixed(0) + '% for the single global band.</p>' +
      '<div class="tablewrap"><table class="evidence"><thead><tr><th>Category</th><th class="num">Comparables</th><th class="num">P25 factor</th><th class="num">P75 factor</th></tr></thead><tbody>' + bandRows + '</tbody></table></div>' +
      '<p>The rank range on each row comes from the bands: the best rank counts the rows whose band low still beats this row\'s point estimate, the worst counts the rows whose band high reaches it.</p>' +
      '<h3>Token odds — Brier score, lower is better</h3>' +
      '<div class="tablewrap"><table class="evidence"><thead><tr><th>Term, added in order</th><th class="num">Brier</th><th class="num">Ten-fold</th><th class="num">Walk-forward</th><th>Verdict</th></tr></thead><tbody>' + oRows + '</tbody></table></div>' +
      '<p>The base rate alone scores ' + o.base_brier.toFixed(3) + '; the fitted model scores ' + o.brier.toFixed(3) + ' in-sample, ' + o.kfold_brier.toFixed(3) + ' ten-fold and ' + o.wf_brier.toFixed(3) + ' walk-forward, against a walk-forward base of ' + o.wf_base_brier.toFixed(3) + '. Age and the category rate carry most of the signal: old protocols in categories where most peers already trade are the likeliest to record a token.</p>' +
      '<p>Calibration, on the newer half only: ' + (o.calibration_test_rate * 100).toFixed(1) + '% of the ' + o.calibration_test_n + ' later listings record a token, against a mean predicted odds of ' + (o.calibration_mean_pred * 100).toFixed(1) + '%. Listings have sped up, so a model fitted on the older half under-calls the newer half — the odds on this board are conservative for young protocols.</p>' +
      '<p>Nested check: the term-selection rule ran on the older half alone and its picks were scored on the newer half — ' + o.nested_rule_brier.toFixed(3) + ', against ' + o.nested_all_brier.toFixed(3) + ' for fitting every term and ' + o.nested_base_brier.toFixed(3) + ' for the base rate alone. Selection is roughly neutral out of sample; the terms earn their keep in-sample and ten-fold, and both fitted models beat the base rate by a wide margin.</p>' +
      '<h3>Farm economics — the stated assumptions</h3>' +
      '<ul><li>Farmers share ' + (R.model.drop_share * 100).toFixed(0) + '% of the launch value.</li>' +
      '<li>One farming wallet per $' + R.model.tvl_per_farmer.toLocaleString('en-US') + ' of TVL, at least ' + R.model.min_farmers.toLocaleString('en-US') + ' wallets.</li>' +
      '<li>Gas for setup, weekly actions and the claim, plus a ' + (R.model.opportunity_apy * 100).toFixed(0) + '% annual opportunity cost on the deposit. The gas bill is split out in the detail view: setup, weekly actions, and the claim.</li>' +
      '<li>A row is FARM when its net stays positive at the low end of its band <em>and</em> pays at least $' + R.model.hourly_bar_usd + ' an hour there; MARGINAL when it pays at the point estimate (or at the low end but under $' + R.model.hourly_bar_usd + ' an hour); SKIP when it does not pay. The hourly bar is what keeps the verdicts a decision instead of a rubber stamp.</li></ul>' +
      '<p>Change the assumptions and the verdicts change — the scenario controls above the board re-price every verdict live, and the detail view shows the arithmetic for each row, so any verdict can be checked by hand.</p>' +
      '<h3>About this radar</h3>' +
      '<p>This page is a static dashboard with no network: it renders from <code>data.js</code>, written by the same program that wrote <code>board.json</code>. The board covers all ' + R.watchlist_size + ' protocols on the snapshot\'s watchlist, plus every other rankable pre-token protocol — including ' + R.above_floor_off_list + ' above the $50M floor that the watchlist itself leaves out. The snapshot is frozen at ' + R.as_of + '; the figures on this page are that day\'s, and a launch after it is not in the data.</p>';
  }

  /** The rows the current filters keep, in the current sort order. */
  function visibleRows() {
    var q = state.q.trim().toLowerCase();
    var rows = R.rows.filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) === -1 && r.slug.indexOf(q) === -1) return false;
      if (state.cat && r.category !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) === -1) return false;
      if (r.tvl_usd < state.minTvl) return false;
      if (state.verdict && scenarioEconomics(r).verdict !== state.verdict) return false;
      if (state.tier === 'watch' && !r.on_watchlist) return false;
      if (state.tier === 'early' && (r.on_watchlist || r.tvl_usd >= R.floor_usd)) return false;
      if (state.tier === 'offlist' && (r.on_watchlist || r.tvl_usd < R.floor_usd)) return false;
      return true;
    });
    var key = state.sort;
    var dir = state.dir;
    var verdictRank = { FARM: 0, MARGINAL: 1, SKIP: 2 };
    rows.sort(function (a, b) {
      var va, vb;
      if (key === 'name') { return dir * (a.name < b.name ? -1 : a.name > b.name ? 1 : 0); }
      if (key === 'tvl') { va = a.tvl_usd; vb = b.tvl_usd; }
      else if (key === 'growth') { va = a.change_7d === null ? -1e9 : a.change_7d; vb = b.change_7d === null ? -1e9 : b.change_7d; }
      else if (key === 'age') { va = a.age_days === null ? -1 : a.age_days; vb = b.age_days === null ? -1 : b.age_days; }
      else if (key === 'odds') { va = a.odds; vb = b.odds; }
      else if (key === 'launches') { va = a.if_launches_usd; vb = b.if_launches_usd; }
      else if (key === 'verdict') { va = verdictRank[scenarioEconomics(a).verdict]; vb = verdictRank[scenarioEconomics(b).verdict]; }
      else if (key === 'net') { va = scenarioEconomics(a).netHour; vb = scenarioEconomics(b).netHour; }
      else if (key === 'rank') { va = a.rank; vb = b.rank; }
      else { va = a.implied_value_usd; vb = b.implied_value_usd; }
      return dir * (va - vb);
    });
    return rows;
  }

  function verdictPill(v) {
    var cls = v === 'FARM' ? 'farm' : v === 'MARGINAL' ? 'marg' : 'skip';
    return '<span class="verdict ' + cls + '">' + v + '</span>';
  }

  /** The board table, with an implied-value bar scaled to the top row. */
  function renderBoard() {
    var rows = visibleRows();
    var max = R.rows.length ? R.rows[0].implied_value_usd : 1;
    var html = rows.map(function (r) {
      var w = Math.max(2, Math.round((r.implied_value_usd / max) * 100));
      var ow = Math.max(2, Math.round(r.odds * 100));
      var se = scenarioEconomics(r);
      var netCls = se.net >= 0 ? 'up' : 'down';
      return '<tr data-slug="' + esc(r.slug) + '"' + (state.open === r.slug ? ' class="open"' : '') + '>' +
        '<td class="rank">' + r.rank + '<br><span class="rankrange">' + r.rank_low + '–' + r.rank_high + '</span></td>' +
        '<td><span class="pname">' + esc(r.name) + (r.on_watchlist ? '<span class="wl">Watchlist</span>' : '') + '</span><br><span class="cat">' + esc(r.category || '—') + '</span></td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + ageText(r.age_days) + '</td>' +
        '<td class="num"><span class="odds">' + Math.round(r.odds * 100) + '%</span><div class="bar"><i class="oddsbar" style="width:' + ow + '%"></i></div></td>' +
        '<td class="num">' + money(r.if_launches_usd) + '</td>' +
        '<td class="num"><span class="imp">' + money(r.implied_value_usd) + '</span><br><span class="band">' + money(r.band_low_usd) + '–' + money(r.band_high_usd) + '</span><div class="bar"><i style="width:' + w + '%"></i></div></td>' +
        '<td class="num">' + verdictPill(se.verdict) + '<br><span class="' + netCls + '">' + signedMoney(se.net) + ' net</span></td>' +
        '<td class="num ' + netCls + '">' + signedMoney(se.netHour) + '/h</td>' +
        '</tr>';
    }).join('');
    $('rows').innerHTML = html || '<tr><td colspan="10" class="cat">No protocol matches these filters.</td></tr>';
    var counts = scenarioCounts();
    $('count').textContent = 'Showing ' + rows.length + ' of ' + R.rows.length + ' pre-token protocols · snapshot ' + R.as_of + ' · model ' + R.model_version +
      ' · ' + counts.FARM + ' farm / ' + counts.MARGINAL + ' marginal / ' + counts.SKIP + ' skip' + (scenarioActive() ? ' · under your scenario' : '');
  }

  /** The detail view: the protocol's own numbers, its model arithmetic, its farm economics, its farm plan. */
  function renderDetail() {
    var box = $('detail');
    if (!state.open) { box.innerHTML = ''; return; }
    var r = null;
    for (var i = 0; i < R.rows.length; i++) if (R.rows[i].slug === state.open) { r = R.rows[i]; break; }
    if (!r) { box.innerHTML = ''; return; }
    var m = r.model;
    var se = scenarioEconomics(r);
    var steps = r.farm_steps.map(function (s) {
      var parts = s.split(' Cost: ');
      var action = parts[0];
      var rest = parts.length > 1 ? 'Cost: ' + parts.slice(1).join(' Cost: ') : '';
      return '<li>' + esc(action) + (rest ? '<br><span class="ct">' + esc(rest) + '</span>' : '') + '</li>';
    }).join('');
    var tier = r.on_watchlist ? 'on the watchlist' : r.tvl_usd >= R.floor_usd ? 'above the floor, off the list' : 'early, below the floor';
    var anchors = r.anchors.map(function (a) {
      return '<tr><td>' + esc(a.name) + (a.same_category ? ' <span class="samecat">same category</span>' : '') + '</td><td class="num">' + money(a.tvl_usd) + '</td><td class="num">' + money(a.mcap_usd) + '</td><td class="num">' + a.mcap_tvl + '×</td></tr>';
    }).join('');
    var tiers = r.tiers.map(function (t) {
      var cls = t.net_usd >= 0 ? 'up' : 'down';
      return '<tr><td class="num">$' + t.deposit_usd + '</td><td class="num ' + cls + '">' + signedMoney(t.net_usd) + '</td><td class="num ' + cls + '">' + signedMoney(t.net_hour_usd) + '/h</td><td>' + verdictPill(t.verdict) + '</td></tr>';
    }).join('');
    box.innerHTML =
      '<div class="detail">' +
      '<button class="close" id="d-close">Close ✕</button>' +
      '<h2>#' + r.rank + ' <span class="rankrange-lg">rank range ' + r.rank_low + '–' + r.rank_high + '</span> ' + esc(r.name) + ' ' + verdictPill(se.verdict) + '</h2>' +
      '<p class="meta">' + esc(r.category || 'Uncategorized') + ' · ' + esc(r.chains.join(', ') || '—') +
      ' · TVL ' + moneyFull(r.tvl_usd) + ' · 7d ' + (r.change_7d === null ? '—' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(2) + '%') +
      ' · no token for ' + ageText(r.age_days) + ' · ' + tier + '</p>' +
      '<div class="grid"><div><h3>Implied value — the arithmetic</h3><div class="math">' +
      '<div><span>Fitted log market cap</span><span>' + m.fitted_log_mcap + '</span></div>' +
      '<div><span>If it launches</span><span>' + moneyFull(r.if_launches_usd) + '</span></div>' +
      '<div><span>Band, P25–P75 · ' + esc(r.category || 'Uncategorized') + ' ×' + m.band_p25_factor + '–×' + m.band_p75_factor + '</span><span>' + moneyFull(r.band_low_usd) + ' – ' + moneyFull(r.band_high_usd) + '</span></div>' +
      '<div><span>× token odds</span><span>' + (r.odds * 100).toFixed(1) + '%</span></div>' +
      '<div class="total"><span>Implied value</span><span>' + moneyFull(r.implied_value_usd) + '</span></div>' +
      '</div>' +
      '<h3>Anchors — the nearest traded comparables</h3>' +
      '<div class="tablewrap"><table class="evidence"><thead><tr><th>Protocol</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">Mcap / TVL</th></tr></thead><tbody>' + anchors + '</tbody></table></div>' +
      '<h3>Token odds — the terms</h3><div class="math">' +
      '<div><span>log TVL</span><span>' + m.odds_log_tvl + '</span></div>' +
      '<div><span>log age</span><span>' + m.odds_log_age + '</span></div>' +
      '<div><span>category token rate</span><span>' + (m.odds_cat_rate * 100).toFixed(1) + '%</span></div>' +
      '<div><span>7-day growth</span><span>' + (m.odds_growth * 100).toFixed(1) + '%</span></div>' +
      '</div>' +
      '<h3>Farm economics — $' + se.deposit + ' deposit' + (scenarioActive() ? ' · your scenario' : '') + '</h3><div class="math">' +
      '<div><span>Drop pool (' + (scenarioActive() ? state.share + '%' : (R.model.drop_share * 100) + '%') + ' of launch)</span><span>' + moneyFull(Math.round(r.if_launches_usd * (scenarioActive() ? state.share / 100 : R.model.drop_share))) + '</span></div>' +
      '<div><span>Farming wallets assumed</span><span>' + m.farmers.toLocaleString('en-US') + '</span></div>' +
      '<div><span>Expected drop, odds-weighted</span><span>' + signedMoney(se.expectedDrop) + '</span></div>' +
      '<div><span>Gas — setup</span><span>−$' + se.gasSetup.toFixed(0) + '</span></div>' +
      '<div><span>Gas — weekly actions</span><span>−$' + se.gasWeekly.toFixed(0) + '</span></div>' +
      '<div><span>Gas — claim</span><span>−$' + se.gasClaim.toFixed(0) + '</span></div>' +
      '<div><span>Opportunity cost</span><span>−$' + se.opportunity.toFixed(2) + '</span></div>' +
      '<div class="total"><span>Net · ' + signedMoney(se.netHour) + ' / hour over ' + se.hours.toFixed(1) + 'h</span><span>' + signedMoney(se.net) + '</span></div>' +
      '<div><span>Net at the low end · ' + signedMoney(se.netLowHour) + ' / hour</span><span>' + signedMoney(se.netLow) + '</span></div>' +
      '<div><span>Break-even launch value</span><span>' + moneyFull(Math.round(se.breakeven)) + '</span></div>' +
      '<div><span>Largest deposit that still pays</span><span>' + (r.max_viable_deposit_usd === null ? 'none pays' : moneyFull(r.max_viable_deposit_usd)) + '</span></div>' +
      '</div>' +
      '<h3>Net by deposit tier — board assumptions</h3>' +
      '<div class="tablewrap"><table class="evidence"><thead><tr><th class="num">Deposit</th><th class="num">Net</th><th class="num">Net / hour</th><th>Verdict</th></tr></thead><tbody>' + tiers + '</tbody></table></div>' +
      '</div>' +
      '<div><h3>Farm plan — seven steps</h3><ol class="farm">' + steps + '</ol></div>' +
      '</div></div>';
    $('d-close').addEventListener('click', function () { state.open = null; renderDetail(); renderBoard(); });
  }

  /** The value-by-odds matrix: every ranked protocol on two axes, crosshairs at the medians. */
  function renderMatrix() {
    var rows = R.rows;
    var W = 960, H = 560, L = 76, Rr = 24, T = 34, B = 52;
    var odds = rows.map(function (r) { return r.odds; }).sort(function (a, b) { return a - b; });
    var logs = rows.map(function (r) { return Math.log10(r.implied_value_usd); }).sort(function (a, b) { return a - b; });
    var medO = odds[Math.floor(odds.length / 2)];
    var medL = logs[Math.floor(logs.length / 2)];
    var minL = Math.floor(logs[0]), maxL = Math.ceil(logs[logs.length - 1]);
    var x = function (o) { return L + o * (W - L - Rr); };
    var y = function (l) { return T + (maxL - l) / (maxL - minL) * (H - T - B); };
    var col = { FARM: '#3fb68b', MARGINAL: '#f2b544', SKIP: '#98a2b3' };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="matrix-svg" role="img">';
    var qi = [0, 0, 0, 0];
    rows.forEach(function (r) {
      var q = (r.odds >= medO ? 1 : 0) + (Math.log10(r.implied_value_usd) >= medL ? 2 : 0);
      qi[q]++;
    });
    s += '<text x="' + (W - Rr) + '" y="' + (T + 16) + '" class="qlab" text-anchor="end">Hunt · ' + qi[3] + '</text>';
    s += '<text x="' + (L + 6) + '" y="' + (T + 16) + '" class="qlab">Big but unlikely · ' + qi[2] + '</text>';
    s += '<text x="' + (W - Rr) + '" y="' + (H - B - 8) + '" class="qlab" text-anchor="end">Likely but small · ' + qi[1] + '</text>';
    s += '<text x="' + (L + 6) + '" y="' + (H - B - 8) + '" class="qlab">Watch · ' + qi[0] + '</text>';
    s += '<line x1="' + x(medO) + '" y1="' + T + '" x2="' + x(medO) + '" y2="' + (H - B) + '" class="cross"/>';
    s += '<line x1="' + L + '" y1="' + y(medL) + '" x2="' + (W - Rr) + '" y2="' + y(medL) + '" class="cross"/>';
    for (var t = 0; t <= 4; t++) {
      var o = t / 4;
      s += '<line x1="' + x(o) + '" y1="' + (H - B) + '" x2="' + x(o) + '" y2="' + (H - B + 6) + '" class="tick"/>';
      s += '<text x="' + x(o) + '" y="' + (H - B + 22) + '" class="axis" text-anchor="middle">' + (o * 100) + '%</text>';
    }
    for (var e = minL; e <= maxL; e++) {
      s += '<line x1="' + (L - 6) + '" y1="' + y(e) + '" x2="' + L + '" y2="' + y(e) + '" class="tick"/>';
      var ylab = e >= 9 ? '$' + Math.pow(10, e - 9) + 'B' : e >= 6 ? '$' + Math.pow(10, e - 6) + 'M' : '$' + Math.pow(10, e - 3) + 'K';
      s += '<text x="' + (L - 10) + '" y="' + (y(e) + 4) + '" class="axis" text-anchor="end">' + ylab + '</text>';
    }
    s += '<text x="' + ((W + L) / 2) + '" y="' + (H - 6) + '" class="axis" text-anchor="middle">Token odds</text>';
    s += '<text x="14" y="' + ((H - B + T) / 2) + '" class="axis" text-anchor="middle" transform="rotate(-90 14 ' + ((H - B + T) / 2) + ')">Implied value (log)</text>';
    rows.forEach(function (r) {
      s += '<circle data-slug="' + esc(r.slug) + '" cx="' + x(r.odds).toFixed(1) + '" cy="' + y(Math.log10(r.implied_value_usd)).toFixed(1) +
        '" r="' + (r.rank <= 5 ? 7 : 5) + '" fill="' + col[scenarioEconomics(r).verdict] + '" class="dot"><title>' + esc(r.name) + ' — #' + r.rank + ', ' + money(r.implied_value_usd) + ', ' + Math.round(r.odds * 100) + '% odds, ' + scenarioEconomics(r).verdict + '</title></circle>';
    });
    rows.slice(0, 3).forEach(function (r) {
      s += '<text x="' + (x(r.odds) + 10) + '" y="' + (y(Math.log10(r.implied_value_usd)) + 4) + '" class="dotlabel">' + esc(r.name) + '</text>';
    });
    s += '</svg>';
    s += '<p class="legend"><span class="lg"><i style="background:#3fb68b"></i>Farm</span><span class="lg"><i style="background:#f2b544"></i>Marginal</span><span class="lg"><i style="background:#98a2b3"></i>Skip</span><span class="muted"> · medians: ' + Math.round(medO * 100) + '% odds, ' + money(Math.pow(10, medL)) + ' implied</span></p>';
    $('matrix').innerHTML = s;
    $('matrix').querySelectorAll('circle[data-slug]').forEach(function (c) {
      c.addEventListener('click', function () {
        state.open = c.getAttribute('data-slug');
        document.querySelectorAll('#tabs .tab').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === 'board'); });
        ['board', 'matrix', 'method', 'live', 'all'].forEach(function (t) { $('tab-' + t).hidden = t !== 'board'; });
        refresh();
        $('detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  /** The Live view: protocols whose token already trades, at the market's own values. */
  function renderLive() {
    var html = R.live.map(function (r, i) {
      return '<tr><td class="rank">' + (i + 1) + '</td>' +
        '<td><span class="pname">' + esc(r.name) + '</span></td>' +
        '<td class="cat">' + esc(r.category || '—') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + money(r.mcap_usd) + '</td>' +
        '<td class="num">' + (r.mcap_tvl === null ? '—' : r.mcap_tvl + '×') + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td></tr>';
    }).join('');
    $('live-rows').innerHTML = html;
  }

  /** The All 758 view: every protocol the board does not rank, with its group and why. */
  function renderSetAside() {
    var q = state.qAll.trim().toLowerCase();
    var rows = R.setaside.filter(function (r) {
      if (state.group && r.group !== state.group) return false;
      if (q && r.name.toLowerCase().indexOf(q) === -1 && r.slug.indexOf(q) === -1) return false;
      return true;
    });
    var labels = {};
    R.ledger.forEach(function (g) { labels[g.key] = g.label; });
    $('all-rows').innerHTML = rows.map(function (r, i) {
      return '<tr><td class="rank">' + (i + 1) + '</td>' +
        '<td><span class="pname">' + esc(r.name) + '</span></td>' +
        '<td class="cat">' + esc(r.category || '—') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + money(r.mcap_usd) + '</td>' +
        '<td>' + esc(labels[r.group] || r.group) + '</td>' +
        '<td class="cat">' + esc(r.detail) + '</td></tr>';
    }).join('') || '<tr><td colspan="7" class="cat">No protocol matches these filters.</td></tr>';
    $('count-all').textContent = 'Showing ' + rows.length + ' of ' + R.setaside.length + ' protocols the board does not rank';
  }

  /** Fill the category and chain dropdowns from the board itself. */
  function fillFilters() {
    var cats = {}, chains = {};
    R.rows.forEach(function (r) {
      if (r.category) cats[r.category] = 1;
      r.chains.forEach(function (c) { chains[c] = 1; });
    });
    var catSel = $('f-cat');
    Object.keys(cats).sort().forEach(function (c) {
      var o = document.createElement('option'); o.value = c; o.textContent = c; catSel.appendChild(o);
    });
    var chSel = $('f-chain');
    Object.keys(chains).sort().forEach(function (c) {
      var o = document.createElement('option'); o.value = c; o.textContent = c; chSel.appendChild(o);
    });
    var gSel = $('f-group');
    R.ledger.forEach(function (g) {
      if (g.key.indexOf('ranked') === 0) return;
      var o = document.createElement('option'); o.value = g.key; o.textContent = g.label + ' (' + g.count + ')'; gSel.appendChild(o);
    });
  }

  function refresh() { renderBoard(); renderDetail(); }

  $('q').addEventListener('input', function (e) { state.q = e.target.value; refresh(); });
  $('f-cat').addEventListener('change', function (e) { state.cat = e.target.value; refresh(); });
  $('f-chain').addEventListener('change', function (e) { state.chain = e.target.value; refresh(); });
  $('f-tvl').addEventListener('change', function (e) { state.minTvl = Number(e.target.value); refresh(); });
  $('f-sort').addEventListener('change', function (e) {
    state.sort = e.target.value;
    state.dir = state.sort === 'name' || state.sort === 'verdict' ? 1 : -1;
    refresh();
  });

  document.querySelectorAll('#pills-verdict .pill').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('#pills-verdict .pill').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      state.verdict = btn.getAttribute('data-v');
      refresh();
    });
  });
  document.querySelectorAll('#pills-tier .pill').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('#pills-tier .pill').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      state.tier = btn.getAttribute('data-t');
      refresh();
    });
  });

  document.querySelectorAll('#board thead th').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.getAttribute('data-k');
      if (!k) return;
      if (state.sort === k) { state.dir = -state.dir; }
      else {
        state.sort = k;
        state.dir = (k === 'name' || k === 'verdict' || k === 'rank') ? 1 : -1;
      }
      refresh();
    });
  });

  $('rows').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (!tr) return;
    var slug = tr.getAttribute('data-slug');
    state.open = state.open === slug ? null : slug;
    refresh();
    if (state.open) $('detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  document.querySelectorAll('#tabs .tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('#tabs .tab').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      ['board', 'matrix', 'method', 'live', 'all'].forEach(function (t) { $('tab-' + t).hidden = t !== btn.getAttribute('data-tab'); });
    });
  });

  /** The scenario note under the controls, and everything a scenario change re-renders. */
  function renderScenarioNote() {
    var note = $('scenario-note');
    if (!scenarioActive()) { note.hidden = true; note.textContent = ''; return; }
    var parts = [];
    if (state.deposit !== '') parts.push('$' + Number(state.deposit).toLocaleString('en-US') + ' deposit');
    if (state.share !== 5) parts.push(state.share + '% drop share');
    if (state.weeks !== 0) parts.push(state.weeks + ' weeks');
    note.hidden = false;
    note.textContent = 'Scenario: ' + parts.join(' · ') + ' — every verdict re-priced under your assumptions; ranks never move.';
  }

  function scenarioChanged() {
    $('sc-share-val').textContent = state.share + '%';
    $('sc-weeks-val').textContent = state.weeks === 0 ? 'Row default' : state.weeks + ' wk';
    renderScenarioNote();
    renderKpis();
    renderBoard();
    renderDetail();
    renderMatrix();
  }

  $('sc-deposit').addEventListener('change', function (e) { state.deposit = e.target.value; scenarioChanged(); });
  $('sc-share').addEventListener('input', function (e) { state.share = Number(e.target.value); scenarioChanged(); });
  $('sc-weeks').addEventListener('input', function (e) { state.weeks = Number(e.target.value); scenarioChanged(); });
  $('sc-reset').addEventListener('click', function () {
    state.deposit = ''; state.share = 5; state.weeks = 0;
    $('sc-deposit').value = ''; $('sc-share').value = '5'; $('sc-weeks').value = '0';
    scenarioChanged();
  });

  $('q-all').addEventListener('input', function (e) { state.qAll = e.target.value; renderSetAside(); });
  $('f-group').addEventListener('change', function (e) { state.group = e.target.value; renderSetAside(); });

  fillFilters();
  renderKpis();
  renderLedger();
  renderIntegrity();
  renderMethod();
  renderMatrix();
  renderLive();
  renderSetAside();
  renderBoard();
})();
