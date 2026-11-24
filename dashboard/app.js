// Token Launch Radar — the dashboard. Renders window.RADAR (written by main.ts
// from the same board as board.json) with no fetch and no network: search,
// category, chain, TVL and watchlist filters, sortable columns, a detail view
// for every protocol with its own model arithmetic and farm plan, and a Live
// view of the protocols whose token already trades.
(function () {
  'use strict';
  var R = window.RADAR;
  if (!R) return;

  var state = { q: '', cat: '', chain: '', minTvl: 0, watch: false, sort: 'implied', dir: -1, open: null };

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

  /** The rows the current filters keep, in the current sort order. */
  function visibleRows() {
    var q = state.q.trim().toLowerCase();
    var rows = R.rows.filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) === -1 && r.slug.indexOf(q) === -1) return false;
      if (state.cat && r.category !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) === -1) return false;
      if (r.tvl_usd < state.minTvl) return false;
      if (state.watch && !r.on_watchlist) return false;
      return true;
    });
    var key = state.sort;
    var dir = state.dir;
    rows.sort(function (a, b) {
      var va, vb;
      if (key === 'name') { va = a.name; vb = b.name; return dir * (va < vb ? -1 : va > vb ? 1 : 0); }
      if (key === 'tvl') { va = a.tvl_usd; vb = b.tvl_usd; }
      else if (key === 'growth') { va = a.change_7d === null ? -1e9 : a.change_7d; vb = b.change_7d === null ? -1e9 : b.change_7d; }
      else if (key === 'age') { va = a.age_days === null ? -1 : a.age_days; vb = b.age_days === null ? -1 : b.age_days; }
      else if (key === 'category') { va = a.category || ''; vb = b.category || ''; return dir * (va < vb ? -1 : va > vb ? 1 : 0); }
      else if (key === 'rank') { va = a.rank; vb = b.rank; }
      else { va = a.implied_value_usd; vb = b.implied_value_usd; }
      return dir * (va - vb);
    });
    return rows;
  }

  /** The board table, with an implied-value bar scaled to the top row. */
  function renderBoard() {
    var rows = visibleRows();
    var max = R.rows.length ? R.rows[0].implied_value_usd : 1;
    var html = rows.map(function (r) {
      var w = Math.max(2, Math.round((r.implied_value_usd / max) * 100));
      var chains = r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '');
      return '<tr data-slug="' + esc(r.slug) + '"' + (state.open === r.slug ? ' class="open"' : '') + '>' +
        '<td class="rank">' + r.rank + '</td>' +
        '<td><span class="pname">' + esc(r.name) + (r.on_watchlist ? '<span class="wl">Watchlist</span>' : '') + '</span></td>' +
        '<td class="cat">' + esc(r.category || '—') + '</td>' +
        '<td class="chains">' + esc(chains) + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + ageText(r.age_days) + '</td>' +
        '<td class="num"><span class="imp">' + money(r.implied_value_usd) + '</span><div class="bar"><i style="width:' + w + '%"></i></div></td>' +
        '</tr>';
    }).join('');
    $('rows').innerHTML = html || '<tr><td colspan="8" class="cat">No protocol matches these filters.</td></tr>';
    $('count').textContent = 'Showing ' + rows.length + ' of ' + R.rows.length + ' pre-token protocols · snapshot ' + R.as_of + ' · model ' + R.model_version;
  }

  /** The detail view: the protocol's own numbers, its model arithmetic, its category comps, its farm plan. */
  function renderDetail() {
    var box = $('detail');
    if (!state.open) { box.innerHTML = ''; return; }
    var r = null;
    for (var i = 0; i < R.rows.length; i++) if (R.rows[i].slug === state.open) { r = R.rows[i]; break; }
    if (!r) { box.innerHTML = ''; return; }
    var m = r.model;
    var comp = null;
    for (var j = 0; j < R.comps.length; j++) if (R.comps[j].category === (r.category || 'Uncategorized')) { comp = R.comps[j]; break; }
    var compLine = m.comps_from_category
      ? 'Category multiple from ' + m.comps_used + ' live-token comps in ' + esc(r.category || 'Uncategorized') + ' (median mcap/TVL ' + m.category_multiple + ').'
      : 'Fewer than 3 live-token comps in ' + esc(r.category || 'Uncategorized') + ', so the global median multiple ' + m.category_multiple + ' applies.';
    var tops = (comp && m.comps_from_category) ? comp.top.map(function (t) { return esc(t.name) + ' ' + t.mcap_tvl + '×'; }).join(' · ') : '';
    var steps = r.farm_steps.map(function (s) {
      var parts = s.split(' Cost: ');
      var action = parts[0];
      var rest = parts.length > 1 ? 'Cost: ' + parts.slice(1).join(' Cost: ') : '';
      return '<li>' + esc(action) + (rest ? '<br><span class="ct">' + esc(rest) + '</span>' : '') + '</li>';
    }).join('');
    box.innerHTML =
      '<div class="detail">' +
      '<button class="close" id="d-close">Close ✕</button>' +
      '<h2>#' + r.rank + ' ' + esc(r.name) + '</h2>' +
      '<p class="meta">' + esc(r.category || 'Uncategorized') + ' · ' + esc(r.chains.join(', ') || '—') +
      ' · TVL ' + moneyFull(r.tvl_usd) + ' · 7d ' + (r.change_7d === null ? '—' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(2) + '%') +
      ' · listed ' + (r.listed_at || 'unknown') + (r.on_watchlist ? ' · on the watchlist' : ' · below the watchlist floor') + '</p>' +
      '<div class="grid"><div><h3>Implied value — the arithmetic</h3><div class="math">' +
      '<div><span>TVL</span><span>' + moneyFull(r.tvl_usd) + '</span></div>' +
      '<div><span>× category multiple</span><span>' + m.category_multiple + '×</span></div>' +
      '<div><span>× growth (' + (m.growth_pct > 0 ? '+' : '') + m.growth_pct + '% 7d)</span><span>' + m.growth_multiplier + '×</span></div>' +
      '<div><span>× maturity (' + (m.age_days === null ? 'age unknown' : m.age_days + ' days') + ')</span><span>' + m.maturity_multiplier + '×</span></div>' +
      '<div><span>× chain breadth (' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + ')</span><span>' + m.chain_multiplier + '×</span></div>' +
      '<div class="total"><span>Implied value</span><span>' + moneyFull(r.implied_value_usd) + '</span></div>' +
      '</div><p class="comps">' + compLine + (tops ? '<br>Top comps: ' + tops + '.' : '') + '</p></div>' +
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

  /** Header stats and the method tab's row count. */
  function renderStats() {
    $('stats').innerHTML =
      '<div class="stat"><b>' + R.board_size + '</b><span>pre-token protocols ranked</span></div>' +
      '<div class="stat"><b>' + R.watchlist_size + ' / ' + R.watchlist_size + '</b><span>watchlist covered</span></div>' +
      '<div class="stat"><b>' + money(R.total_implied_usd) + '</b><span>total implied value</span></div>' +
      '<div class="stat"><b>' + R.as_of + '</b><span>snapshot date</span></div>';
    $('m-rows').textContent = R.board_size;
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
  $('f-watch').addEventListener('change', function (e) { state.watch = e.target.checked; refresh(); });
  $('f-sort').addEventListener('change', function (e) {
    state.sort = e.target.value;
    state.dir = state.sort === 'name' || state.sort === 'category' ? 1 : -1;
    refresh();
  });

  document.querySelectorAll('#board thead th').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.getAttribute('data-k');
      if (!k) return;
      if (state.sort === k) { state.dir = -state.dir; }
      else {
        state.sort = k;
        state.dir = (k === 'name' || k === 'category' || k === 'rank') ? 1 : -1;
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
      ['board', 'live', 'method'].forEach(function (t) { $('tab-' + t).hidden = t !== btn.getAttribute('data-tab'); });
    });
  });

  fillFilters();
  renderStats();
  renderLive();
  renderBoard();
})();
