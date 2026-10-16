/* ============================================================
 * 视图层 A：工作台 · 标的档案 · 映射关系 · 持仓成交 · 风险链 · 客户识别
 * ============================================================ */
window.Views = (function (UI) {
  'use strict';
  var $ = UI.$, $$ = UI.$$, esc = UI.esc, fmt = UI.fmt, DB = window.DB;
  var charts = {};   /* echarts 实例注册表 */
  var V = {};        /* 各视图公开接口 */

  function chart(id) {
    if (charts[id]) return charts[id];
    var el = document.getElementById(id);
    if (!el || typeof echarts === 'undefined') return null;
    charts[id] = echarts.init(el, null, { renderer: 'svg' });
    return charts[id];
  }
  function resizeVisible() { Object.keys(charts).forEach(function (k) { charts[k].resize(); }); }
  var C = UI.themeColors();
  var FONT = "'WorkSans','Noto Sans CJK SC','WenQuanYi Micro Hei',sans-serif";

  /* ============ 1. 工作台 ============ */
  var dashPrev = {};
  V.dash = {
    render: function () {
      V.dash.refresh();
    },
    refresh: function () {
      var gs = DB.groupAgg();
      var highGroups = gs.filter(function (g) { return g.risk === '高'; }).length;
      var openAlerts = DB.alerts.filter(function (a) { return a.status === '未处理'; }).length;
      var totalEquity = DB.clients.reduce(function (s, c) { return s + c.equity; }, 0);
      var totalMargin = DB.clients.reduce(function (s, c) { return s + (c.margin || 0); }, 0);
      var instCount = DB.instruments.length;
      var kpis = [
        { k: 'kpi1', label: '统一标的（主数据）', val: instCount, unit: '条', trend: '映射关系 ' + DB.mappings.length + ' 条' },
        { k: 'kpi2', label: '同一客户组', val: Object.keys(DB.groups).length, unit: '组', trend: '覆盖客户 ' + DB.clients.filter(function (c) { return c.groupId; }).length + ' / ' + DB.clients.length },
        { k: 'kpi3', label: '客户总权益', val: (totalEquity / 10000).toFixed(2), unit: '亿元', trend: '保证金占用 ' + (totalMargin / 10000).toFixed(2) + ' 亿元' },
        { k: 'kpi4', label: '未处理预警', val: openAlerts, unit: '条', warn: openAlerts > 0, trend: '高风险客户组 ' + highGroups + ' 个' },
        { k: 'kpi5', label: '接口在线', val: DB.feeds.filter(function (f) { return f.status === 'online'; }).length, unit: '/ ' + DB.feeds.length, trend: DB.feeds.filter(function (f) { return f.status === 'offline'; }).length ? '场外台账接口断开' : '全部正常' }
      ];
      var el = $('#dash-kpis');
      el.innerHTML = kpis.map(function (p) {
        var cls = '';
        if (p.warn) cls = 'warn';
        var prev = dashPrev[p.k];
        var trendHtml = '';
        if (prev != null && prev !== p.val) {
          var up = p.val > prev;
          trendHtml = '<div class="k-trend ' + (up ? 'up' : 'dn') + '">' + (up ? '▲' : '▼') + ' ' + Math.abs(p.val - prev).toFixed(p.val % 1 ? 2 : 0) + ' 较上期</div>';
        }
        dashPrev[p.k] = p.val;
        return '<div class="kpi ' + cls + '"><div class="k-label"><span>' + p.label + '</span></div><div class="k-val">' + fmt(p.val, p.val % 1 ? 2 : 0) + ' <small>' + p.unit + '</small></div><div class="k-trend" style="color:var(--muted)">' + esc(p.trend) + '</div>' + trendHtml + '</div>';
      }).join('');

      /* 敞口分布图 */
      var byVar = {};
      gs.forEach(function (g) { Object.keys(g.byVar || {}).forEach(function (v) { byVar[v] = (byVar[v] || 0) + g.byVar[v]; }); });
      var data = DB.varietyOrder.map(function (k) { return { name: DB.VARIETIES[k].name, value: Math.round(byVar[k] || 0) }; });
      var ch = chart('chart-dash-dist');
      if (ch) ch.setOption({
        color: [C.accent, C.accent2, C.hi, C.md, C.muted],
        tooltip: { trigger: 'item', appendToBody: true, textStyle: { fontFamily: FONT }, formatter: '{b}<br/>敞口 {c} 万元（{d}%）' },
        legend: { bottom: 0, icon: 'circle', itemWidth: 8, itemHeight: 8, textStyle: { color: C.muted, fontSize: 11, fontFamily: FONT } },
        series: [{ type: 'pie', radius: ['45%', '70%'], center: ['50%', '44%'],
          itemStyle: { borderColor: C.bg2, borderWidth: 2 },
          label: { show: false }, emphasis: { scaleSize: 6 },
          data: data }]
      });
      $('#dash-dist-time').textContent = '更新于 ' + DB.fmtTime();

      /* 预警流（前 8 条） */
      $('#dash-alerts').innerHTML = DB.alerts.slice(0, 8).map(function (a) {
        var lc = a.lvl === '高' ? 'solid-hi' : (a.lvl === '中' ? 'solid-md' : 'blue');
        return '<div class="alert-item"><span class="lvl">' + UI.tag(lc, a.lvl) + '</span><div class="ai-body"><div class="ai-t">' + esc(a.type) + ' · ' + esc(a.obj) + '</div><div class="ai-s">' + esc(a.metric) + '：当前 ' + a.val + ' / 阈值 ' + a.th + '</div><div class="ai-time">' + esc(a.time) + ' · ' + esc(a.status) + '</div></div></div>';
      }).join('') || '<div style="color:var(--muted);padding:20px;text-align:center">当前无预警</div>';

      /* 今日操作 */
      $('#dash-ops tbody').innerHTML = DB.logs.slice(0, 6).map(function (l) {
        return '<tr class="dis"><td class="mono" style="font-size:11.6px">' + esc(l.time) + '</td><td>' + esc(l.user) + '</td><td>' + UI.tag('blue', l.module) + '</td><td>' + esc(l.action) + '</td><td>' + esc(l.obj) + '</td><td style="color:var(--muted)">' + esc(l.detail) + '</td></tr>';
      }).join('');
    }
  };

  /* ============ 2. 标的档案 ============ */
  var masterTable = null;
  function statusTag(s) { return s === 'active' ? UI.tag('lo', '在市') : (s === 'delisting' ? UI.tag('md', '临近交割') : UI.tag('gray', s === 'suspended' ? '停牌' : s)); }
  V.master = {
    render: function () {
      masterTable = UI.Table({
        rows: function () { return DB.instruments; },
        tbody: '#tbl-master tbody', pager: '#m-pager', pageSize: 10,
        rowId: function (r) { return r.ukey; },
        filter: function (rows) {
          var ex = $('#m-f-ex').value, st = $('#m-f-st').value, as = $('#m-f-asset').value;
          return rows.filter(function (r) {
            return (!ex || r.exch === ex) && (!st || r.status === st) && (!as || r.asset === as);
          });
        },
        columns: [
          { k: 'ukey', cls: 'mono', html: function (r) { return '<b style="color:var(--accent)">' + esc(r.ukey) + '</b>'; } },
          { k: 'name' },
          { k: 'asset', html: function (r) { return UI.tag(r.asset === '现货' ? 'md' : (r.asset === '期权' ? 'hi' : 'blue'), r.asset); } },
          { k: 'exch', cls: 'ctr' },
          { k: 'exCode', cls: 'mono' },
          { k: 'inCode', cls: 'mono', html: function (r) { return '<span style="color:var(--muted)">' + esc(r.inCode) + '</span>'; } },
          { k: 'rel', html: function (r) { return '<span style="color:var(--muted)">' + esc(r.rel) + '</span>'; } },
          { k: 'status', cls: 'ctr', html: function (r) { return statusTag(r.status); } },
          { k: 'upd', html: function (r) { return '<span style="color:var(--muted);font-size:11.6px">' + esc(r.upd) + '</span>'; } },
          { cls: 'ctr', html: function (r) { return '<button class="btn sm link" data-act="detail">详情</button> <button class="btn sm link" data-act="edit">编辑</button>'; } }
        ],
        onRow: function (id, r) { if (r) masterDetail(r.ukey); },
        onRender: function (rows) { $('#m-count').textContent = rows.length + ' 条记录'; }
      });
      ['#m-search', '#m-f-ex', '#m-f-asset', '#m-f-st'].forEach(function (sel) {
        var el = $(sel);
        el.addEventListener('input', function () { masterTable.state.search = $('#m-search').value; masterTable.render(); });
        el.addEventListener('change', function () { masterTable.render(); });
      });
      $('#m-add').onclick = masterAdd;
      $('#m-export').onclick = function () {
        var rows = masterTable.filtered();
        UI.exportCSV('标的档案.csv', ['统一编码', '名称', '类别', '市场', '交易所代码', '内部代码', '关联合约', '状态', '更新时间'],
          rows.map(function (r) { return [r.ukey, r.name, r.asset, r.exch, r.exCode, r.inCode, r.rel, r.status, r.upd]; }));
        UI.toast('success', '导出成功', '已导出 ' + rows.length + ' 条标的档案');
        DB.pushLog('标的档案', '导出', 'CSV', '导出 ' + rows.length + ' 条记录');
      };
      /* 行内按钮代理 */
      $('#tbl-master').addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-act]');
        if (!btn) return;
        e.stopPropagation();
        var tr = btn.closest('tr');
        var ukey = tr.dataset.id;
        if (btn.dataset.act === 'detail') masterDetail(ukey);
        else masterEdit(ukey);
      });
      masterTable.render();
    }
  };

  function masterDetail(ukey) {
    var inst = DB.instruments.filter(function (r) { return r.ukey === ukey; })[0];
    if (!inst) return;
    var v = Object.keys(DB.VARIETIES).filter(function (k) { return inst.ukey.indexOf(DB.VARIETIES[k].ukey) === 0; }).map(function (k) { return DB.VARIETIES[k]; })[0];
    var maps = DB.mappings.filter(function (m) { return m.src === inst.ukey || m.dst === inst.ukey || m.src === inst.ukey + '（现货）'; });
    var html = ''
      + '<div class="dl">'
      + '<dt>统一编码</dt><dd class="mono" style="color:var(--accent);font-weight:700">' + esc(inst.ukey) + '</dd>'
      + '<dt>标的名称</dt><dd>' + esc(inst.name) + '</dd>'
      + '<dt>类别 / 市场</dt><dd>' + UI.tag(inst.asset === '现货' ? 'md' : 'blue', inst.asset) + ' ' + esc(inst.exch) + '</dd>'
      + '<dt>状态</dt><dd>' + statusTag(inst.status) + '</dd>'
      + (v ? '<dt>最新价</dt><dd class="mono">' + fmt(v.price, 1) + ' 元/' + v.unit + '（保证金率 ' + (v.marginRate * 100).toFixed(0) + '%）</dd>' : '')
      + '</div>'
      + '<div class="sec-label">编码映射</div>'
      + '<div class="table-wrap" style="max-height:150px"><table class="tbl"><thead><tr><th>系统</th><th>编码</th></tr></thead><tbody>'
      + '<tr class="dis"><td>交易所代码</td><td class="mono">' + esc(inst.exCode) + '</td></tr>'
      + '<tr class="dis"><td>内部代码</td><td class="mono">' + esc(inst.inCode) + '</td></tr>'
      + '<tr class="dis"><td>统一主键</dt><td class="mono">' + esc(inst.ukey) + '</td></tr>'
      + '</tbody></table></div>'
      + '<div class="sec-label">关联映射关系<span class="txt" style="font-weight:400;font-size:11px;color:var(--muted)">' + maps.length + ' 条</span></div>'
      + '<div class="table-wrap" style="max-height:200px"><table class="tbl"><thead><tr><th>类型</th><th>源</th><th>目标</th><th>说明</th></tr></thead><tbody>'
      + (maps.slice(0, 8).map(function (m) {
        return '<tr class="dis"><td>' + UI.tag('gray', m.type === 'cross-market' ? '跨市场' : (m.type === 'cross-term' ? '跨期限' : '基础资产')) + '</td><td class="mono" style="font-size:11px">' + esc(m.src) + '</td><td class="mono" style="font-size:11px">' + esc(m.dst) + '</td><td style="color:var(--muted);font-size:11.5px">' + esc(m.note) + '</td></tr>';
      }).join('') || '<tr class="dis"><td class="empty-row" colspan="4">暂无映射</td></tr>')
      + '</tbody></table></div>';
    UI.openDrawer('标的档案 · ' + esc(inst.name), esc(inst.ukey) + ' · 更新于 ' + esc(inst.upd), html,
      '<button class="btn" id="dw-edit">编辑档案</button><button class="btn primary" id="dw-map">维护映射</button>');
    $('#dw-edit').onclick = function () { masterEdit(ukey); };
    $('#dw-map').onclick = function () { mapAdd(); };
  }

  function masterAdd() {
    UI.openModal('新增标的',
      '<div class="form-row"><label>统一编码 <span class="req">*</span></label><input class="inp" name="ukey" placeholder="例：U-MET-CU-2712"></div>'
      + '<div class="form-row"><label>标的名称 <span class="req">*</span></label><input class="inp" name="name" placeholder="例：阴极铜2712"></div>'
      + '<div class="form-grid2">'
      + '<div class="form-row"><label>类别</label><select class="sel" name="asset"><option>期货</option><option>现货</option><option>期权</option></select></div>'
      + '<div class="form-row"><label>市场</label><select class="sel" name="exch"><option>SHFE</option><option>DCE</option><option>CZCE</option><option>INE</option><option>CFFEX</option><option>场外</option></select></div>'
      + '</div>'
      + '<div class="form-grid2">'
      + '<div class="form-row"><label>交易所代码</label><input class="inp" name="exCode" placeholder="例：CU2712"></div>'
      + '<div class="form-row"><label>内部代码</label><input class="inp" name="inCode" placeholder="例：INT-CU-2712"></div>'
      + '</div>'
      + '<div class="form-row"><label>关联合约 / 上级标的</label><input class="inp" name="rel" placeholder="例：U-MET-CU"></div>'
      + '<div class="form-tip">保存后将写入标的主数据并同步映射引擎。</div>',
      null,
      function () {
        var v = UI.modalVal();
        if (!v.ukey || !v.name) { UI.toast('warn', '请填写统一编码与名称'); return false; }
        if (DB.instruments.some(function (r) { return r.ukey === v.ukey; })) { UI.toast('warn', '统一编码已存在', v.ukey); return false; }
        DB.addInstrument({ ukey: v.ukey, name: v.name, asset: v.asset, exch: v.exch, exCode: v.exCode || '—', inCode: v.inCode || '—', rel: v.rel || '—', status: 'active' });
        DB.pushLog('标的档案', '新增标的', v.ukey, v.name + '（' + v.asset + ' / ' + v.exch + '）');
        masterTable.render();
        UI.toast('success', '新增成功', v.name + ' 已写入标的主数据');
      });
  }

  function masterEdit(ukey) {
    var inst = DB.instruments.filter(function (r) { return r.ukey === ukey; })[0];
    if (!inst) return;
    UI.openModal('编辑标的 · ' + esc(inst.ukey),
      '<div class="form-row"><label>标的名称</label><input class="inp" name="name" value="' + esc(inst.name) + '"></div>'
      + '<div class="form-grid2">'
      + '<div class="form-row"><label>交易所代码</label><input class="inp" name="exCode" value="' + esc(inst.exCode) + '"></div>'
      + '<div class="form-row"><label>内部代码</label><input class="inp" name="inCode" value="' + esc(inst.inCode) + '"></div>'
      + '</div>'
      + '<div class="form-grid2">'
      + '<div class="form-row"><label>状态</label><select class="sel" name="status"><option value="active"' + (inst.status === 'active' ? ' selected' : '') + '>在市</option><option value="suspended"' + (inst.status === 'suspended' ? ' selected' : '') + '>停牌</option><option value="delisting"' + (inst.status === 'delisting' ? ' selected' : '') + '>临近交割</option></select></div>'
      + '<div class="form-row"><label>关联合约</label><input class="inp" name="rel" value="' + esc(inst.rel) + '"></div>'
      + '</div>',
      null,
      function () {
        var v = UI.modalVal();
        DB.updateInstrument(ukey, { name: v.name, exCode: v.exCode, inCode: v.inCode, status: v.status, rel: v.rel });
        DB.pushLog('标的档案', '编辑标的', ukey, '更新名称/编码/状态');
        masterTable.render();
        UI.toast('success', '保存成功', ukey + ' 档案已更新');
      });
  }

  /* ============ 3. 映射关系 ============ */
  var mapType = 'cross-market';
  var mapSelected = null;
  function mapTypeLabel(t) { return t === 'cross-market' ? '跨市场' : (t === 'cross-term' ? '跨期限' : '基础资产'); }
  V.mapping = {
    render: function () {
      $$('#map-type-seg button').forEach(function (b) {
        b.onclick = function () {
          $$('#map-type-seg button').forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on');
          mapType = b.dataset.t;
          mapSelected = null;
          V.mapping.refresh();
        };
      });
      $('#map-add').onclick = mapAdd;
      V.mapping.refresh();
    },
    refresh: function () {
      var ms = DB.mappings.filter(function (m) { return m.type === mapType; });
      var nodes = {}, links = [];
      ms.forEach(function (m, i) {
        var a = m.src, b = m.dst;
        if (!nodes[a]) nodes[a] = { name: a, id: a, size: 16 };
        if (!nodes[b]) nodes[b] = { name: b, id: b, size: 16 };
        nodes[a].size = Math.min(46, nodes[a].size + 6);
        nodes[b].size = Math.min(46, nodes[b].size + 4);
        links.push({ source: a, target: b, value: 1, lineStyle: { width: 1.4, curveness: 0.12, type: mapType === 'underlying' ? 'dashed' : 'solid' } });
      });
      var ch = chart('chart-map');
      if (ch) {
        ch.setOption({
          tooltip: { appendToBody: true, textStyle: { fontFamily: FONT }, formatter: function (p) { return p.dataType === 'edge' ? p.data.source + ' → ' + p.data.target : p.data.id; } },
          series: [{
            type: 'graph', layout: 'force', roam: true, draggable: true,
            force: { repulsion: 320, edgeLength: [50, 120], gravity: 0.08 },
            symbolSize: function (v) { return v; },
            data: Object.keys(nodes).map(function (k) { return Object.assign(nodes[k], { label: { show: true, fontSize: 10.5, color: C.ink } }); }),
            links: links,
            itemStyle: { color: C.accent, borderColor: C.bg2, borderWidth: 1.5, shadowBlur: 6, shadowColor: 'rgba(22,86,200,.2)' },
            lineStyle: { color: C.muted, opacity: .55 },
            emphasis: { focus: 'adjacency', lineStyle: { width: 3, opacity: 1 } },
            edgeSymbol: ['none', 'arrow'], edgeSymbolSize: 6
          }]
        }, true);
        ch.off('click');
        ch.on('click', function (p) {
          if (p.dataType === 'node') { mapSelected = p.data.id; mapDetail(p.data.id); }
        });
      }
    }
  };
  function mapDetail(ukey) {
    var ms = DB.mappings.filter(function (m) { return m.type === mapType && (m.src === ukey || m.dst === ukey); });
    $('#map-detail-panel').style.display = '';
    $('#map-detail-title').textContent = '映射详情';
    $('#map-detail-sub').textContent = ukey + ' · ' + mapTypeLabel(mapType) + ' · ' + ms.length + ' 条';
    $('#tbl-mapdetail tbody').innerHTML = ms.map(function (m) {
      return '<tr class="dis"><td>' + UI.tag('blue', mapTypeLabel(m.type)) + '</td><td class="mono" style="font-size:11px">' + esc(m.src) + '</td><td class="mono" style="font-size:11px">' + esc(m.dst) + '</td><td style="color:var(--muted)">' + esc(m.note) + '</td><td class="mono" style="font-size:11px">' + esc(m.ctime) + '</td><td class="ctr"><button class="btn sm link">查看标的</button></td></tr>';
    }).join('') || '<tr class="dis"><td class="empty-row" colspan="6">该节点暂无' + mapTypeLabel(mapType) + '记录</td></tr>';
  }
  function mapAdd() {
    var opts = DB.instruments.slice(0, 60).map(function (r) { return '<option value="' + esc(r.ukey) + '">' + esc(r.ukey) + ' · ' + esc(r.name) + '</option>'; }).join('');
    UI.openModal('新增映射关系',
      '<div class="form-row"><label>映射类型</label><select class="sel" name="type"><option value="cross-market">同标的跨市场映射</option><option value="cross-term">同品种跨期限映射</option><option value="underlying">衍生品基础资产映射</option></select></div>'
      + '<div class="form-row"><label>源标的 <span class="req">*</span></label><select class="sel" name="src">' + opts + '</select></div>'
      + '<div class="form-row"><label>目标标的 <span class="req">*</span></label><select class="sel" name="dst">' + opts + '</select></div>'
      + '<div class="form-row"><label>关系说明</label><input class="inp" name="note" placeholder="例：期权挂接期货主力合约"></div>',
      null,
      function () {
        var v = UI.modalVal();
        if (v.src === v.dst) { UI.toast('warn', '源与目标不能相同'); return false; }
        DB.addMapping(v.type, v.src, v.dst, v.note || '手工维护');
        DB.pushLog('映射关系', '新增映射', v.src + ' → ' + v.dst, mapTypeLabel(v.type) + '：' + (v.note || ''));
        mapType = v.type;
        V.mapping.refresh();
        UI.toast('success', '映射已建立', v.src + ' → ' + v.dst);
      });
  }

  /* ============ 4. 持仓成交分析 ============ */
  var posState = { var: 'cu', metric: 'oi', type: 'line', hide: {} };
  var METRICS = { oi: '持仓量', vol: '成交量', delta: '净变动' };
  V.pos = {
    render: function () {
      var seg = $('#pos-var-seg');
      if (!seg.dataset.built) {
        seg.dataset.built = '1';
        DB.varietyOrder.forEach(function (k) {
          var b = document.createElement('button');
          b.textContent = DB.VARIETIES[k].name + ' ' + DB.VARIETIES[k].prefix;
          b.dataset.v = k;
          if (k === posState.var) b.classList.add('on');
          b.onclick = function () { posState.var = k; posState.hide = {}; V.pos.refresh(); };
          seg.appendChild(b);
        });
        $$('#pos-metric-seg button').forEach(function (b) { b.onclick = function () { posState.metric = b.dataset.m; V.pos.refresh(); }; });
        $$('#pos-chart-seg button').forEach(function (b) { b.onclick = function () { posState.type = b.dataset.c; V.pos.refresh(); }; });
        $('#pos-refresh').onclick = function () {
          DB.tick();
          V.pos.refresh();
          UI.toast('info', '行情已刷新', '模拟行情推送完成，图表与明细已更新');
        };
        $('#pos-export').onclick = posExport;
      }
      V.pos.refresh();
    },
    refresh: function () {
      $$('#pos-var-seg button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === posState.var); });
      $$('#pos-metric-seg button').forEach(function (b) { b.classList.toggle('on', b.dataset.m === posState.metric); });
      $$('#pos-chart-seg button').forEach(function (b) { b.classList.toggle('on', b.dataset.c === posState.type); });

      var v = DB.VARIETIES[posState.var];
      var data = v[posState.metric];
      /* 合约显隐 checkbox */
      var chkWrap = $('#pos-contract-chks');
      chkWrap.dataset.built || (chkWrap.dataset.built = '1', DB.CONTRACTS.forEach(function (c) {
        var l = document.createElement('label');
        l.className = 'chk';
        l.innerHTML = '<input type="checkbox" checked data-c="' + c + '">' + c;
        l.querySelector('input').onchange = function () { posState.hide[c] = !this.checked; V.pos.refresh(); };
        chkWrap.appendChild(l);
      }));
      $$('#pos-contract-chks input').forEach(function (inp) { inp.checked = !posState.hide[inp.dataset.c]; });

      var xs = DB.CONTRACTS.filter(function (c) { return !posState.hide[c]; });
      var vals = DB.CONTRACTS.map(function (c, i) { return data[i]; }).filter(function (v2, i) { return !posState.hide[DB.CONTRACTS[i]]; });
      var v2 = DB.VARIETIES[posState.var];

      $('#pos-chart-title').textContent = v2.name + ' ' + v2.prefix + ' · ' + METRICS[posState.metric];
      $('#pos-chart-sub').textContent = '最新价 ' + fmt(v2.price, 1) + ' 元/' + v2.unit + ' · 数据时间 ' + DB.fmtTime();

      var ch = chart('chart-pos');
      if (ch) {
        var isDelta = posState.metric === 'delta';
        ch.setOption({
          animationDuration: 300,
          tooltip: { trigger: 'axis', appendToBody: true, textStyle: { fontFamily: FONT } },
          grid: { left: 46, right: 20, top: 30, bottom: 34 },
          xAxis: { type: 'category', data: xs, axisLabel: { color: C.muted, fontFamily: 'IBMPlexMono', fontSize: 11 }, axisLine: { lineStyle: { color: C.rule } }, axisTick: { show: false } },
          yAxis: { type: 'value', name: isDelta ? '%' : '万手', nameTextStyle: { color: C.muted }, axisLabel: { color: C.muted, fontSize: 11 }, splitLine: { lineStyle: { color: C.rule, type: 'dashed' } } },
          series: [{
            type: posState.type === 'bar' ? 'bar' : 'line',
            data: vals, smooth: true, symbolSize: 7,
            lineStyle: { width: 2.5, color: C.accent }, itemStyle: { color: C.accent },
            barMaxWidth: 26,
            areaStyle: posState.type === 'line' ? { opacity: .07, color: C.accent } : undefined,
            markPoint: { data: [{ type: 'max', name: '最大' }], itemStyle: { color: C.hi }, label: { fontSize: 10, color: '#fff', fontFamily: FONT } }
          }]
        });
      }
      renderPosTable(v2);
    }
  };
  function renderPosTable(v) {
    var total = v.oi.reduce(function (a, b) { return a + b; }, 0);
    var rows = DB.CONTRACTS.map(function (c, i) {
      var key = v.prefix + c;
      var role = [], tip = '—';
      if (i === v.near) { role.push(UI.tag('md', '临近交割')); tip = '交割月限仓 · 持仓整数倍调整'; }
      if (i === v.main) { role.push(UI.tag('blue', '主力')); if (tip === '—') tip = '持仓集中度监测'; }
      if (i === v.second) { role.push(UI.tag('gray', '次主力')); if (tip === '—') tip = '移仓换月关注'; }
      if (i === v.third) { role.push(UI.tag('gray', '远月活跃')); if (tip === '—') tip = '远期建仓监测'; }
      if (!role.length) role.push(UI.tag('gray', '常规'));
      var conc = total > 0 ? v.oi[i] / total * 100 : 0;
      return { key: key, role: role.join(' '), oi: v.oi[i], vol: v.vol[i], delta: v.delta[i], conc: conc, tip: tip, idx: i };
    });
    $('#pos-table-sub').textContent = v.name + ' · 共 ' + rows.length + ' 个合约 · 主力 ' + v.prefix + DB.CONTRACTS[v.main];
    $('#tbl-pos tbody').innerHTML = rows.map(function (r) {
      var dColor = r.delta > 0 ? 'var(--hi)' : (r.delta < 0 ? 'var(--lo)' : 'var(--muted)');
      var concCls = r.conc >= 25 ? 'hi' : (r.conc >= 10 ? 'md' : 'lo');
      return '<tr class="dis' + (r.idx === v.main ? ' sel-row' : '') + '"><td class="mono"><b>' + r.key + '</b></td><td>' + r.role + '</td>'
        + '<td class="num" style="font-weight:600">' + r.oi.toFixed(1) + '</td><td class="num">' + r.vol.toFixed(1) + '</td>'
        + '<td class="num" style="color:' + dColor + ';font-weight:600">' + (r.delta > 0 ? '+' : '') + r.delta.toFixed(1) + '%</td>'
        + '<td>' + UI.barCell(r.conc, 10, 25) + '</td><td style="font-size:11.6px;color:var(--muted)">' + r.tip + '</td></tr>';
    }).join('');
  }
  function posExport() {
    var v = DB.VARIETIES[posState.var];
    UI.exportCSV('持仓成交_' + v.name + '.csv', ['合约', '持仓量(万手)', '成交量(万手)', '净变动(%)', '持仓集中度(%)'],
      DB.CONTRACTS.map(function (c, i) { return [v.prefix + c, v.oi[i], v.vol[i], v.delta[i], (v.oi[i] / v.oi.reduce(function (a, b) { return a + b; }, 0) * 100).toFixed(1)]; }));
    UI.toast('success', '导出成功', v.name + ' 期限结构已导出');
    DB.pushLog('持仓成交', '导出', v.name, '期限结构 CSV 导出');
  }

  /* ============ 5. 风险链穿透 ============ */
  var chainVar = 'cu';
  var chainPath = [];   /* 下钻路径 */
  V.chain = {
    render: function () {
      var seg = $('#chain-var-seg');
      if (!seg.dataset.built) {
        seg.dataset.built = '1';
        DB.varietyOrder.forEach(function (k) {
          var b = document.createElement('button');
          b.textContent = DB.VARIETIES[k].name;
          b.dataset.v = k;
          b.onclick = function () { chainVar = k; chainPath = []; V.chain.refresh(); };
          seg.appendChild(b);
        });
        $('#chain-back').onclick = function () { chainPath.pop(); V.chain.refresh(); };
      }
      V.chain.refresh();
    },
    refresh: function () {
      $$('#chain-var-seg button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === chainVar); });
      var v = DB.VARIETIES[chainVar];
      $('#chain-title').textContent = v.name + '（' + v.ukey + '）一体化风险链 · 最新价 ' + fmt(v.price, 1);
      /* 链数据：标的 → 合约(前5活跃) → 头寸(多/空) → 库存 + 合同 */
      var act = [v.main, v.second, v.near, v.third, 8].filter(function (x, i, a) { return a.indexOf(x) === i; });
      var nodes = [{ name: '标的·' + v.name }], links = [];
      act.forEach(function (i) {
        var c = v.prefix + DB.CONTRACTS[i];
        nodes.push({ name: '合约·' + c });
        links.push({ source: '标的·' + v.name, target: '合约·' + c, value: Math.max(.2, v.oi[i]) });
      });
      ['多头头寸', '空头头寸'].forEach(function (p) {
        nodes.push({ name: p });
        act.forEach(function (i) { links.push({ source: '合约·' + v.prefix + DB.CONTRACTS[i], target: p, value: Math.max(.1, v.oi[i] * .6) }); });
      });
      var inv = DB.inventory.filter(function (x) { return x.variety === chainVar; });
      var ct = DB.contracts.filter(function (x) { return x.variety === chainVar; });
      nodes.push({ name: '库存·仓单' }); nodes.push({ name: '合同·基差' });
      links.push({ source: '标的·' + v.name, target: '库存·仓单', value: Math.max(.3, inv.reduce(function (s, x) { return s + x.tons; }, 0) / 50000) });
      links.push({ source: '库存·仓单', target: '合同·基差', value: Math.max(.2, ct.length * .4) });
      links.push({ source: '标的·' + v.name, target: '合同·基差', value: .3 });

      var ch = chart('chart-chain');
      if (ch) {
        ch.setOption({
          animationDuration: 300,
          tooltip: { appendToBody: true, textStyle: { fontFamily: FONT }, trigger: 'item', formatter: function (p) { return p.dataType === 'edge' ? p.data.source + ' → ' + p.data.target : p.name; } },
          series: [{ type: 'sankey', left: 20, right: 140, top: 16, bottom: 16,
            nodeWidth: 13, nodeGap: 12, nodeAlign: 'left',
            emphasis: { focus: 'adjacency' },
            data: nodes.map(function (n) { return { name: n.name, itemStyle: { color: n.name.indexOf('标的') === 0 ? C.accent : (n.name.indexOf('合约') === 0 ? C.accent2 : (n.name.indexOf('库存') === 0 || n.name.indexOf('合同') === 0 ? C.md : C.muted)) } }; }),
            links: links,
            label: { color: C.ink, fontSize: 11, fontFamily: FONT },
            lineStyle: { color: 'gradient', opacity: .3, curveness: .5 }
          }]
        }, true);
        ch.off('click');
        ch.on('click', function (p) { if (p.dataType === 'node') chainDrill(p.name); });
      }
      if (chainPath.length) { renderChainDetail(chainPath[chainPath.length - 1]); }
      else { $('#chain-detail-panel').style.display = 'none'; }
    }
  };
  function chainDrill(nodeName) {
    var v = DB.VARIETIES[chainVar];
    var kind = nodeName.split('·')[0];
    chainPath = [nodeName];
    renderChainDetail(nodeName);
    UI.toast('info', '已下钻', nodeName);
  }
  function renderChainDetail(nodeName) {
    var v = DB.VARIETIES[chainVar];
    var kind = nodeName.split('·')[0];
    var panel = $('#chain-detail-panel');
    panel.style.display = '';
    $('#chain-detail-sub').textContent = nodeName + ' · 点击行可跳转对应视图';
    var head = $('#tbl-chain thead'), body = $('#tbl-chain tbody');
    var clientName = function (id) { var c = DB.clients.filter(function (x) { return x.id === id; })[0]; return c ? c.name : id; };

    if (kind === '合约') {
      var cIdx = DB.CONTRACTS.indexOf(nodeName.split('·')[1].replace(v.prefix, ''));
      $('#chain-detail-title').textContent = '合约持仓明细';
      head.innerHTML = '<tr><th>客户</th><th>归属组</th><th>方向</th><th class="num">持仓（手）</th><th class="num">保证金（万元）</th><th>业务类型</th></tr>';
      var holders = [];
      DB.clients.forEach(function (c) {
        (DB.exposures[c.id] || []).forEach(function (e) {
          if (e.variety === chainVar) {
            var lots = Math.round(Math.abs(e.net) / (v.price * v.lot) * 10000 * (e.net > 0 ? .62 : .38) / Math.max(1, DB.CONTRACTS.length - cIdx));
            if (lots > 0) holders.push({ c: c, e: e, lots: lots });
          }
        });
      });
      holders.sort(function (a, b) { return b.lots - a.lots; });
      body.innerHTML = holders.slice(0, 14).map(function (h) {
        return '<tr><td><b>' + esc(h.c.name) + '</b></td><td>' + (h.c.groupId ? UI.tag('blue', h.c.groupId) : UI.tag('gray', '未归组')) + '</td>'
          + '<td>' + (h.e.net > 0 ? UI.tag('hi', '多头') : UI.tag('lo', '空头')) + '</td>'
          + '<td class="num">' + fmt(h.lots) + '</td><td class="num">' + fmt(Math.abs(h.e.net) * v.marginRate) + '</td>'
          + '<td style="color:var(--muted)">' + esc(h.e.biz) + '</td></tr>';
      }).join('') || '<tr class="dis"><td class="empty-row" colspan="6">该合约暂无客户持仓</td></tr>';
    } else if (kind === '库存') {
      $('#chain-detail-title').textContent = '仓单库存记录';
      head.innerHTML = '<tr><th>仓单类型</th><th>仓储库</th><th>持有人</th><th class="num">数量（吨）</th><th>状态</th><th>与期货头寸关联</th></tr>';
      body.innerHTML = DB.inventory.filter(function (x) { return x.variety === chainVar; }).map(function (x) {
        return '<tr class="dis"><td>' + UI.tag('gray', x.type) + '</td><td>' + esc(x.wh) + '</td><td>' + esc(clientName(x.owner)) + '</td>'
          + '<td class="num">' + fmt(x.tons) + '</td><td>' + UI.tag('lo', x.status) + '</td>'
          + '<td style="color:var(--muted)">' + esc((DB.exposures[x.owner] || []).filter(function (e) { return e.variety === chainVar; }).length ? '同品种期货套保持仓存在' : '暂无') + '</td></tr>';
      }).join('');
    } else if (kind === '合同') {
      $('#chain-detail-title').textContent = '基差贸易合同';
      head.innerHTML = '<tr><th>合同号</th><th>买方</th><th>卖方</th><th class="num">数量（吨）</th><th class="num">基差</th><th>结算月</th><th>状态</th></tr>';
      body.innerHTML = DB.contracts.filter(function (x) { return x.variety === chainVar; }).map(function (x) {
        return '<tr class="dis"><td class="mono">' + esc(x.no) + '</td><td>' + esc(clientName(x.a)) + '</td><td>' + esc(clientName(x.b)) + '</td>'
          + '<td class="num">' + fmt(x.tons) + '</td><td class="num">' + x.basis + '</td><td class="mono">' + x.settle + '</td><td>' + UI.tag(x.status === '履约中' ? 'lo' : 'md', x.status) + '</td></tr>';
      }).join('');
    } else {
      $('#chain-detail-title').textContent = '层级明细 · ' + nodeName;
      head.innerHTML = '<tr><th>提示</th></tr>';
      body.innerHTML = '<tr class="dis"><td style="padding:16px 12px;color:var(--muted)">请点击链路上的 合约 / 头寸 / 库存 / 合同 节点查看记录明细</td></tr>';
    }
  }

  /* ============ 6. 客户识别与归一 ============ */
  var clientTable = null, clientSel = [];
  V.client = {
    render: function () {
      clientTable = UI.Table({
        rows: function () { return DB.clients; },
        tbody: '#tbl-client tbody', pager: '#c-pager', pageSize: 10,
        rowId: function (r) { return r.id; },
        filter: function (rows) {
          var t = $('#c-f-type').value, g = $('#c-f-group').value;
          return rows.filter(function (c) {
            if (t && c.type !== t) return false;
            if (g === 'pending' && c.groupId) return false;
            if (g === 'grouped' && !c.groupId) return false;
            return true;
          });
        },
        columns: [
          { k: 'id', cls: 'mono' },
          { k: 'name', html: function (r) { return '<b>' + esc(r.name) + '</b>'; } },
          { k: 'type', html: function (r) { return UI.tag(r.type === '资管产品' ? 'md' : 'gray', r.type); } },
          { html: function (r) { return r.groupId ? UI.tag('blue', r.groupId) : UI.tag('gray', '待归一'); } },
          { k: 'role' },
          { k: 'equity', cls: 'num', html: function (r) { return fmt(r.equity); } },
          { k: 'margin', cls: 'num', html: function (r) { return fmt(DB.clientMargin(r)); } },
          { k: 'accounts', cls: 'ctr' },
          { k: 'basis', html: function (r) { return '<span style="color:var(--muted);font-size:11.6px">' + esc(r.basis) + '</span>'; } },
          { cls: 'ctr', html: function (r) { return r.groupId ? '<button class="btn sm link" data-act="out">移出归组</button>' : '<button class="btn sm link" data-act="detail">画像</button>'; } }
        ],
        onRow: function (id) { clientDetail(id); },
        onRender: function (rows) {
          $('#c-count').textContent = rows.length + ' 个客户 · 已归组 ' + rows.filter(function (c) { return c.groupId; }).length;
        }
      });
      ['#c-search', '#c-f-type', '#c-f-group'].forEach(function (sel) {
        var el = $(sel);
        el.addEventListener('input', function () { clientTable.state.search = $('#c-search').value; clientTable.render(); });
        el.addEventListener('change', function () { clientTable.render(); });
      });
      $('#c-check-all').onchange = function () {
        var on = this.checked;
        $$('#tbl-client tbody input[type=checkbox]').forEach(function (i) { i.checked = on; });
        syncClientSel();
      };
      $('#c-merge').onclick = clientMerge;
      $('#tbl-client').addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-act]');
        if (!btn) return;
        e.stopPropagation();
        var tr = btn.closest('tr');
        var id = tr.dataset.id;
        if (btn.dataset.act === 'out') {
          UI.openModal('移出归组确认', '<p style="font-size:12.8px;line-height:1.7">确认将该客户移出当前同一客户组？移出后其敞口将单独计量，风险聚合结果将实时重算。</p>', null, function () {
            var c = DB.clients.filter(function (x) { return x.id === id; })[0];
            DB.ungroup(id);
            clientTable.render();
            UI.toast('success', '已移出归组', c.name);
            if (window.Views2) window.Views2.refreshAll();
          });
        } else clientDetail(id);
      });
      clientTable.render();
    }
  };
  function syncClientSel() {
    clientSel = $$('#tbl-client tbody input[type=checkbox]:checked').map(function (i) { return i.value; });
    $('#c-sel-count').textContent = '已选 ' + clientSel.length + ' 个客户';
    $('#c-merge').disabled = clientSel.length < 2;
  }
  function rebuildClientChecks() {
    /* 在每行第一列注入复选框 */
    $$('#tbl-client tbody tr').forEach(function (tr) {
      if (tr.classList.contains('dis')) return;
      var td = document.createElement('td');
      td.className = 'ctr';
      td.innerHTML = '<input type="checkbox" value="' + tr.dataset.id + '" style="accent-color:var(--accent)"' + (clientSel.indexOf(tr.dataset.id) >= 0 ? ' checked' : '') + '>';
      tr.insertBefore(td, tr.firstChild);
      td.querySelector('input').addEventListener('click', function (e) { e.stopPropagation(); });
      td.querySelector('input').addEventListener('change', syncClientSel);
    });
  }
  /* 渲染后钩子（在 Table.render 里触发 onRender） */
  var origClientRender = null;
  function clientMerge() {
    if (clientSel.length < 2) return;
    var names = clientSel.map(function (id) { return DB.clients.filter(function (c) { return c.id === id; })[0].name; });
    UI.openModal('合并为同一客户',
      '<p style="font-size:12.6px;margin-bottom:12px">将以下 <b>' + clientSel.length + '</b> 个客户认定为同一客户，合并后共享客户组编码并聚合风险敞口：</p>'
      + '<div style="background:var(--bg);border:1px solid var(--rule);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12.3px;line-height:1.9">' + names.map(esc).join('<br>') + '</div>'
      + '<div class="form-row"><label>认定依据 <span class="req">*</span>（参照《示范实践第 4 号》）</label><select class="sel" name="basis">'
      + '<option>股权控制关系（控股 / 全资）</option><option>实际控制人同一</option><option>一致行动人</option><option>受益所有人同一</option><option>资管产品管理人受控</option></select></div>'
      + '<div class="form-row"><label>备注说明</label><textarea name="note" placeholder="例：经 CRM 核实，两公司法定代表人一致"></textarea></div>',
      null,
      function () {
        var v = UI.modalVal();
        var gid = DB.mergeClients(clientSel, v.basis);
        clientSel = [];
        $('#c-check-all').checked = false;
        clientTable.render();
        rebuildClientChecks();
        UI.toast('success', '客户归一完成', '已生成同一客户组 ' + gid + '（' + v.basis + '），风险聚合已重算');
        if (window.Views2) window.Views2.refreshAll();
      });
  }
  function clientDetail(id) {
    var c = DB.clients.filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    var exs = DB.exposures[c.id] || [];
    var rels = DB.relations.filter(function (r) { return r.src === id || r.dst === id; });
    var m = DB.clientMargin(c);
    var usage = c.equity > 0 ? m / c.equity * 100 : 0;
    var th = DB.threshold;
    var html = ''
      + '<div class="dl">'
      + '<dt>客户号</dt><dd class="mono" style="font-weight:700;color:var(--accent)">' + esc(c.id) + '</dd>'
      + '<dt>名称</dt><dd>' + esc(c.name) + '</dd>'
      + '<dt>类型 / 账户</dt><dd>' + esc(c.type) + ' · ' + c.accounts + ' 个账户</dd>'
      + '<dt>统一客户组</dt><dd>' + (c.groupId ? UI.tag('blue', c.groupId + ' ' + (DB.groups[c.groupId] || '')) : UI.tag('gray', '待归一')) + '</dd>'
      + '<dt>认定依据</dt><dd>' + esc(c.basis) + '</dd>'
      + '<dt>权益 / 保证金</dt><dd class="mono">' + fmt(c.equity) + ' / ' + fmt(m) + ' 万元</dd>'
      + '<dt>保证金占用率</dt><dd>' + UI.barCell(usage, th.usageWarn, th.usageHigh) + '</dd>'
      + '</div>'
      + '<div class="sec-label">业务线敞口明细</div>'
      + '<div class="table-wrap" style="max-height:220px"><table class="tbl"><thead><tr><th>品种</th><th>业务</th><th>方向</th><th class="num">敞口（万元）</th></tr></thead><tbody>'
      + exs.map(function (e) {
        return '<tr class="dis"><td>' + UI.tag('blue', DB.VARIETIES[e.variety].name) + '</td><td style="color:var(--muted)">' + esc(e.biz) + '</td>'
          + '<td>' + (e.net > 0 ? UI.tag('hi', '多') : UI.tag('lo', '空')) + '</td><td class="num">' + fmt(Math.abs(e.net)) + '</td></tr>';
      }).join('') || '<tr class="dis"><td class="empty-row" colspan="4">无敞口</td></tr>'
      + '</tbody></table></div>'
      + '<div class="sec-label">关联关系（' + rels.length + ' 条）</div>'
      + '<div class="table-wrap" style="max-height:170px"><table class="tbl"><thead><tr><th>关系类型</th><th>关联方</th><th>说明</th></tr></thead><tbody>'
      + rels.map(function (r) {
        var other = r.src === id ? r.dst : r.src;
        var oc = DB.clients.filter(function (x) { return x.id === other; })[0];
        return '<tr class="dis"><td>' + UI.tag('md', r.type) + '</td><td>' + esc(oc ? oc.name : other) + '</td><td style="color:var(--muted);font-size:11.6px">' + esc(r.note) + '</td></tr>';
      }).join('') || '<tr class="dis"><td class="empty-row" colspan="3">暂无关联关系记录</td></tr>'
      + '</tbody></table></div>';
    UI.openDrawer('客户画像', esc(c.id) + ' · ' + esc(c.name), html, '<button class="btn" id="dw-rel">查看关联图谱</button>');
    $('#dw-rel').onclick = function () {
      UI.closeDrawer();
      if (window.App) window.App.go('relation');
    };
  }

  /* ---------- 导出 ---------- */
  return { V: V, chart: chart, resizeVisible: resizeVisible, rebuildClientChecks: rebuildClientChecks,
    posState: posState, chainVar: function () { return chainVar; } };
})(window.UI);
