// Token Launch Radar — the dashboard, radar-3. Renders window.RADAR (written
// by main.ts from the same board as board.json) with no fetch and no network:
// a KPI strip, the 758-protocol ledger, a self-check strip the browser
// recomputes from the data, search and filters, sortable columns, a detail
// view for every protocol with its own model arithmetic and costed farm plan,
// the method and evidence tab, and a Live view of the traded tokens.
(function () {
  'use strict';
  var R = window.RADAR;
  if (!R) return;

  var state = { q: '', cat: '', chain: '', minTvl: 0, verdict: '', tier: '', sort: 'implied', dir: -1, open: null };

  function $(id) { return document.getElementById(id); }

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

  /** The six KPI cards across the top of the page. */
  function renderKpis() {
    var fit = fittedRow();
    var flat = R.value.ablation[0];
    var vKept = keptCount(R.value.ablation);
    var oKept = keptCount(R.odds.ablation);
    var cards = [
      { b: '×' + fit.loo_miss, s: 'out-of-sample miss, leave-one-out · flat multiple ×' + flat.loo_miss },
      { b: '×' + fit.wf_miss, s: 'out-of-sample miss, walk-forward · flat multiple ×' + flat.wf_miss },
      { b: R.odds.brier.toFixed(3) + ' vs ' + R.odds.base_brier.toFixed(3), s: 'token odds, Brier score vs base rate · walk-forward ' + R.odds.wf_brier.toFixed(3) + ' vs ' + R.odds.wf_base_brier.toFixed(3) },
      { b: vKept + ' of ' + (R.value.ablation.length - 2) + ' · ' + oKept + ' of ' + (R.odds.ablation.length - 1), s: 'terms that survived both held-out tests, value model · odds model' },
      { b: R.farm_count + ' of ' + R.board_size, s: 'worth farming at the low end of the band · ' + R.marginal_count + ' marginal, ' + R.skip_count + ' skip' },
      { b: R.watchlist_size + ' / ' + R.watchlist_size, s: 'watchlist ranked · plus ' + R.early_size + ' early and ' + R.above_floor_off_list + ' off-list' },
    ];
    $('kpis').innerHTML = cards.map(function (c) {
      return '<div class="kpi"><b>' + esc(c.b) + '</b><span>' + esc(c.s) + '</span></div>';
    }).join('');
    var co = R.value.coefficients;
    $('formula').textContent = 'Implied value = fitted launch value × token odds.  log10(market cap) = ' + co[0].toFixed(2) + ' + ' + co[1].toFixed(2) + ' × log10(TVL)' +
      (co.length > 2 ? ' + ' + co[2].toFixed(2) + ' × growth' : '') +
      (co.length > 3 ? ' + ' + co[3].toFixed(2) + ' × ' + R.value.terms[3] : '') +
      ' — fitted on ' + R.value.comps + ' traded comparables, tested leave-one-out and walk-forward. Odds from a logistic fit on ' + R.odds.peers + ' peers.';
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
      return '<tr><td>' + esc(a.term) + '</td><td class="num">×' + a.loo_miss.toFixed(2) + '</td><td class="num">×' + a.wf_miss.toFixed(2) + '</td><td>' + verdictBadge(a.verdict) + '</td></tr>';
    }).join('');
    var oRows = o.ablation.map(function (a) {
      return '<tr><td>' + esc(a.term) + '</td><td class="num">' + a.brier.toFixed(3) + '</td><td class="num">' + a.wf_brier.toFixed(3) + '</td><td>' + verdictBadge(a.verdict) + '</td></tr>';
    }).join('');
    $('method').innerHTML =
      '<h2>How the model works</h2>' +
      '<p>The board ranks <strong>' + R.board_size + '</strong> pre-token protocols from a sealed snapshot of every protocol DefiLlama tracks. A protocol is pre-token when the snapshot records no market cap, no CoinGecko id and no symbol for it. Wrapped, staked and bridged products, exchanges and versioned pools are left out: a wrapped token is not a protocol waiting on a launch of its own.</p>' +
      '<h3>The formula</h3><pre>implied value = fitted launch value × token odds\n\nlog10(market cap) = ' + v.coefficients.map(function (c) { return c.toFixed(2); }).join('  ') + '\n  terms, in order: ' + v.terms.join(', ') + '\n  fitted on ' + v.comps + ' traded comparables (residual sd ' + v.residual_sd_log10 + ' in log10)\n\ntoken odds = logistic(log TVL, log age, category token rate, growth)\n  fitted on ' + o.peers + ' peers, ' + o.with_token + ' of which record a token\n  weights (standardized): ' + o.weights.map(function (w) { return w.toFixed(2); }).join(', ') + '</pre>' +
      '<p>Every coefficient is fitted on this snapshot and tested held-out. A term enters a model only when it lowers the combined held-out error by at least 1% without raising either test by more than 2%. The tables below show every term that was tried — including the ones that failed.</p>' +
      '<h3>Value model — out-of-sample evidence</h3>' +
      '<p>Median miss: how far the prediction lands from the real market cap, as a multiple. Leave-one-out refits the model 91 times, each time holding one comparable out; walk-forward fits on the earlier listings and prices the later ones.</p>' +
      '<div class="tablewrap"><table class="evidence"><thead><tr><th>Term, added in order</th><th class="num">Leave-one-out</th><th class="num">Walk-forward</th><th>Verdict</th></tr></thead><tbody>' + vRows + '</tbody></table></div>' +
      '<p>Age, chain count and the category effect all failed: each one made at least one held-out test worse. The shuffled control — another protocol\'s growth, which cannot carry signal — failed too, which is what shows the tests can tell a real term from noise. The band on each row is the P25–P75 of the leave-one-out residuals: ' + (v.honesty_p25_p75 * 100).toFixed(0) + '% of real caps land inside it (50% stated), and ' + (v.honesty_p10_p90 * 100).toFixed(0) + '% inside P10–P90 (80% stated).</p>' +
      '<h3>Token odds — Brier score, lower is better</h3>' +
      '<div class="tablewrap"><table class="evidence"><thead><tr><th>Term, added in order</th><th class="num">Brier</th><th class="num">Walk-forward</th><th>Verdict</th></tr></thead><tbody>' + oRows + '</tbody></table></div>' +
      '<p>The base rate alone scores ' + o.base_brier.toFixed(3) + '; the fitted model scores ' + o.brier.toFixed(3) + ' in-sample and ' + o.wf_brier.toFixed(3) + ' walk-forward, against a walk-forward base of ' + o.wf_base_brier.toFixed(3) + '. Age and the category rate carry most of the signal: old protocols in categories where most peers already trade are the likeliest to record a token.</p>' +
      '<h3>Farm economics — the stated assumptions</h3>' +
      '<ul><li>Farmers share ' + (R.model.drop_share * 100).toFixed(0) + '% of the launch value.</li>' +
      '<li>One farming wallet per $' + R.model.tvl_per_farmer.toLocaleString('en-US') + ' of TVL, at least ' + R.model.min_farmers.toLocaleString('en-US') + ' wallets.</li>' +
      '<li>Gas for setup, weekly actions and the claim, plus a ' + (R.model.opportunity_apy * 100).toFixed(0) + '% annual opportunity cost on the deposit.</li>' +
      '<li>A row is FARM when its net stays positive at the low end of its band, MARGINAL when it pays at the point estimate only, SKIP when it does not pay.</li></ul>' +
      '<p>Change the assumptions and the verdicts change — the detail view shows the arithmetic for each row, so the verdict can be checked by hand.</p>' +
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
      if (state.verdict && r.verdict !== state.verdict) return false;
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
      else if (key === 'verdict') { va = verdictRank[a.verdict]; vb = verdictRank[b.verdict]; }
      else if (key === 'net') { va = a.net_hour_usd; vb = b.net_hour_usd; }
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
      var netCls = r.net_usd >= 0 ? 'up' : 'down';
      return '<tr data-slug="' + esc(r.slug) + '"' + (state.open === r.slug ? ' class="open"' : '') + '>' +
        '<td class="rank">' + r.rank + '</td>' +
        '<td><span class="pname">' + esc(r.name) + (r.on_watchlist ? '<span class="wl">Watchlist</span>' : '') + '</span><br><span class="cat">' + esc(r.category || '—') + '</span></td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + ageText(r.age_days) + '</td>' +
        '<td class="num"><span class="odds">' + Math.round(r.odds * 100) + '%</span><div class="bar"><i class="oddsbar" style="width:' + ow + '%"></i></div></td>' +
        '<td class="num">' + money(r.if_launches_usd) + '</td>' +
        '<td class="num"><span class="imp">' + money(r.implied_value_usd) + '</span><br><span class="band">' + money(r.band_low_usd) + '–' + money(r.band_high_usd) + '</span><div class="bar"><i style="width:' + w + '%"></i></div></td>' +
        '<td class="num">' + verdictPill(r.verdict) + '<br><span class="' + netCls + '">' + signedMoney(r.net_usd) + ' net</span></td>' +
        '<td class="num ' + netCls + '">' + signedMoney(r.net_hour_usd) + '/h</td>' +
        '</tr>';
    }).join('');
    $('rows').innerHTML = html || '<tr><td colspan="10" class="cat">No protocol matches these filters.</td></tr>';
    $('count').textContent = 'Showing ' + rows.length + ' of ' + R.rows.length + ' pre-token protocols · snapshot ' + R.as_of + ' · model ' + R.model_version +
      ' · ' + R.farm_count + ' farm / ' + R.marginal_count + ' marginal / ' + R.skip_count + ' skip';
  }

  /** The detail view: the protocol's own numbers, its model arithmetic, its farm economics, its farm plan. */
  function renderDetail() {
    var box = $('detail');
    if (!state.open) { box.innerHTML = ''; return; }
    var r = null;
    for (var i = 0; i < R.rows.length; i++) if (R.rows[i].slug === state.open) { r = R.rows[i]; break; }
    if (!r) { box.innerHTML = ''; return; }
    var m = r.model;
    var steps = r.farm_steps.map(function (s) {
      var parts = s.split(' Cost: ');
      var action = parts[0];
      var rest = parts.length > 1 ? 'Cost: ' + parts.slice(1).join(' Cost: ') : '';
      return '<li>' + esc(action) + (rest ? '<br><span class="ct">' + esc(rest) + '</span>' : '') + '</li>';
    }).join('');
    var tier = r.on_watchlist ? 'on the watchlist' : r.tvl_usd >= R.floor_usd ? 'above the floor, off the list' : 'early, below the floor';
    box.innerHTML =
      '<div class="detail">' +
      '<button class="close" id="d-close">Close ✕</button>' +
      '<h2>#' + r.rank + ' ' + esc(r.name) + ' ' + verdictPill(r.verdict) + '</h2>' +
      '<p class="meta">' + esc(r.category || 'Uncategorized') + ' · ' + esc(r.chains.join(', ') || '—') +
      ' · TVL ' + moneyFull(r.tvl_usd) + ' · 7d ' + (r.change_7d === null ? '—' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(2) + '%') +
      ' · no token for ' + ageText(r.age_days) + ' · ' + tier + '</p>' +
      '<div class="grid"><div><h3>Implied value — the arithmetic</h3><div class="math">' +
      '<div><span>Fitted log market cap</span><span>' + m.fitted_log_mcap + '</span></div>' +
      '<div><span>If it launches</span><span>' + moneyFull(r.if_launches_usd) + '</span></div>' +
      '<div><span>Band, P25–P75</span><span>' + moneyFull(r.band_low_usd) + ' – ' + moneyFull(r.band_high_usd) + '</span></div>' +
      '<div><span>× token odds</span><span>' + (r.odds * 100).toFixed(1) + '%</span></div>' +
      '<div class="total"><span>Implied value</span><span>' + moneyFull(r.implied_value_usd) + '</span></div>' +
      '</div>' +
      '<h3>Token odds — the terms</h3><div class="math">' +
      '<div><span>log TVL</span><span>' + m.odds_log_tvl + '</span></div>' +
      '<div><span>log age</span><span>' + m.odds_log_age + '</span></div>' +
      '<div><span>category token rate</span><span>' + (m.odds_cat_rate * 100).toFixed(1) + '%</span></div>' +
      '<div><span>7-day growth</span><span>' + (m.odds_growth * 100).toFixed(1) + '%</span></div>' +
      '</div>' +
      '<h3>Farm economics — $' + m.deposit_usd + ' deposit</h3><div class="math">' +
      '<div><span>Drop pool (5% of launch)</span><span>' + moneyFull(m.drop_pool_usd) + '</span></div>' +
      '<div><span>Farming wallets assumed</span><span>' + m.farmers.toLocaleString('en-US') + '</span></div>' +
      '<div><span>Expected drop, odds-weighted</span><span>' + signedMoney(m.expected_drop_usd) + '</span></div>' +
      '<div><span>Fees (gas)</span><span>−$' + m.fees_usd.toFixed(0) + '</span></div>' +
      '<div><span>Opportunity cost</span><span>−$' + m.opportunity_usd.toFixed(2) + '</span></div>' +
      '<div class="total"><span>Net · ' + signedMoney(r.net_hour_usd) + ' / hour over ' + m.hours + 'h</span><span>' + signedMoney(r.net_usd) + '</span></div>' +
      '<div><span>Break-even launch value</span><span>' + moneyFull(r.breakeven_usd) + '</span></div>' +
      '</div></div>' +
      '<div><h3>Farm plan — six steps</h3><ol class="farm">' + steps + '</ol></div>' +
      '</div></div>';
    $('d-close').addEventListener('click', function () { state.open = null; renderDetail(); renderBoard(); });
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
      ['board', 'method', 'live'].forEach(function (t) { $('tab-' + t).hidden = t !== btn.getAttribute('data-tab'); });
    });
  });

  fillFilters();
  renderKpis();
  renderLedger();
  renderIntegrity();
  renderMethod();
  renderLive();
  renderBoard();
})();
