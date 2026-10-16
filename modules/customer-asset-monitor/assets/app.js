/* ============================================================
 * 视图层 B + 路由 + 实时引擎 + 全局搜索
 * 关联图谱 · 风险聚合 · 预警中心 · 数据接口 · 操作日志 · 帮助
 * ============================================================ */
(function (UI, Views) {
  'use strict';
  var $ = UI.$, $$ = UI.$$, esc = UI.esc, fmt = UI.fmt, DB = window.DB;
  var V2 = {};  /* 剩余视图 */
  var C = UI.themeColors();
  var FONT = "'WorkSans','Noto Sans CJK SC','WenQuanYi Micro Hei',sans-serif";

  /* ============ 7. 关联图谱 ============ */
  var relSel = null;
  var relFilter = { 股权: true, 控制: true, 一致行动人: true, 产品归属: true };
  V2.relation = {
    render: function () {
      $$('#view-relation .chk input').forEach(function (inp) {
        inp.onchange = function () {
          relFilter[inp.dataset.rel] = inp.checked;
          V2.relation.refresh();
        };
      });
      $('#rel-add').onclick = relAdd;
      V2.relation.refresh();
    },
    refresh: function () {
      var types = Object.keys(relFilter).filter(function (k) { return relFilter[k]; });
      var edges = DB.relations.filter(function (r) { return relFilter[r.type]; });
      var nodeMap = {};
      edges.forEach(function (e) {
        [e.src, e.dst].forEach(function (id) {
          if (!nodeMap[id]) {
            var c = DB.clients.filter(function (x) { return x.id === id; })[0];
            nodeMap[id] = { id: id, name: c ? c.name : id, type: c ? c.type : '法人', equity: c ? c.equity : 0, groupId: c ? c.groupId : null, symbolSize: Math.max(22, Math.min(60, Math.sqrt(c ? c.equity : 100) * 1.4)) };
          }
        });
      });
      var typeColor = { 股权: C.accent, 控制: C.accent2, 一致行动人: C.md, 产品归属: C.hi };
      var ch = Views.chart('chart-rel');
      if (ch) {
        ch.setOption({
          tooltip: { appendToBody: true, textStyle: { fontFamily: FONT }, formatter: function (p) {
            if (p.dataType === 'edge') { var r = p.data; return r.srcName + ' → ' + r.dstName + '<br/>' + r.type + (r.note ? '：' + r.note : ''); }
            return p.data.name + '<br/>权益 ' + fmt(p.data.equity) + ' 万元 · ' + (p.data.groupId ? '组 ' + p.data.groupId : '未归组');
          } },
          legend: [{ data: types, bottom: 6, orient: 'horizontal', icon: 'circle', itemWidth: 8, itemHeight: 8, textStyle: { color: C.muted, fontSize: 11, fontFamily: FONT } }],
          series: [{
            type: 'graph', layout: 'force', roam: true, draggable: true,
            force: { repulsion: 260, edgeLength: [60, 140], gravity: 0.06, layoutAnimation: true },
            categories: types.map(function (t) { return { name: t }; }),
            data: Object.keys(nodeMap).map(function (k) {
              var n = nodeMap[k];
              return { id: k, name: n.name, equity: n.equity, groupId: n.groupId, type: n.type, symbolSize: n.symbolSize,
                itemStyle: { color: n.groupId ? C.accent : '#B9C3D3', borderColor: C.bg2, borderWidth: 2 },
                label: { show: true, fontSize: 11, color: C.ink, fontFamily: FONT, position: 'right' } };
            }),
            links: edges.map(function (e) {
              return { source: e.src, target: e.dst, type: e.type, srcName: nodeMap[e.src] ? nodeMap[e.src].name : e.src, dstName: nodeMap[e.dst] ? nodeMap[e.dst].name : e.dst, note: e.note,
                lineStyle: { color: typeColor[e.type] || C.muted, width: e.pct ? Math.max(1, e.pct / 25) : 1.5, curveness: 0.2 },
                label: { show: e.pct != null, formatter: e.pct + '%', fontSize: 10, color: C.muted } };
            }),
            edgeSymbol: ['none', 'arrow'], edgeSymbolSize: 7,
            emphasis: { focus: 'adjacency', lineStyle: { width: 3 } }
          }]
        }, true);
        ch.off('click');
        ch.on('click', function (p) { if (p.dataType === 'node') { relSel = p.data.id; relDetail(p.data.id); } });
      }
    }
  };
  function relDetail(id) {
    var c = DB.clients.filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    var rels = DB.relations.filter(function (r) { return r.src === id || r.dst === id; });
    var exs = DB.exposures[id] || [];
    var m = DB.clientMargin(c), usage = c.equity > 0 ? m / c.equity * 100 : 0;
    var html = '<div class="dl">'
      + '<dt>客户号</dt><dd class="mono" style="color:var(--accent);font-weight:700">' + esc(c.id) + '</dd>'
      + '<dt>名称</dt><dd>' + esc(c.name) + '</dd>'
      + '<dt>类型</dt><dd>' + esc(c.type) + ' · ' + c.accounts + ' 账户</dd>'
      + '<dt>归组</dt><dd>' + (c.groupId ? UI.tag('blue', c.groupId + ' ' + (DB.groups[c.groupId] || '')) : UI.tag('gray', '未归组')) + '</dd>'
      + '<dt>权益</dt><dd class="mono">' + fmt(c.equity) + ' 万元</dd>'
      + '<dt>保证金占用率</dt><dd>' + UI.barCell(usage, DB.threshold.usageWarn, DB.threshold.usageHigh) + '</dd>'
      + '</div>'
      + '<div class="sec-label">关联关系（' + rels.length + ' 条）</div>'
      + rels.map(function (r) {
        var other = r.src === id ? r.dst : r.src;
        var oc = DB.clients.filter(function (x) { return x.id === other; })[0];
        return '<div style="padding:6px 0;border-bottom:1px solid var(--rule);font-size:12.3px"><span class="tag ' + (r.type === '股权' ? 'blue' : (r.type === '控制' ? 'md' : 'gray')) + '">' + esc(r.type) + '</span> <b>' + esc(oc ? oc.name : other) + '</b><div style="color:var(--muted);font-size:11.5px;margin-top:2px">' + esc(r.note) + (r.pct != null ? '（持股 ' + r.pct + '%）' : '') + '</div></div>';
      }).join('') || '<div style="color:var(--muted);padding:12px 0;text-align:center">暂无关联关系</div>';
    $('#rel-detail').innerHTML = html;
    $('#rel-add').disabled = false;
  }
  function relAdd() {
    if (!relSel) return;
    var opts = DB.clients.filter(function (c) { return c.id !== relSel; }).map(function (c) { return '<option value="' + c.id + '">' + esc(c.id) + ' · ' + esc(c.name) + '</option>'; }).join('');
    UI.openModal('添加关联关系', '源客户：' + relSel + '<div class="form-row"><label>目标客户 <span class="req">*</span></label><select class="sel" name="dst">' + opts + '</select></div>'
      + '<div class="form-row"><label>关系类型 <span class="req">*</span></label><select class="sel" name="type"><option>股权</option><option>控制</option><option>一致行动人</option><option>产品归属</option></select></div>'
      + '<div class="form-row"><label>关系说明</label><input class="inp" name="note" placeholder="例：80% 控股"></div>',
      null,
      function () {
        var v = UI.modalVal();
        if (!v.dst) { UI.toast('warn', '请选择目标客户'); return false; }
        DB.addRelation(relSel, v.dst, v.type, v.note || '手工维护');
        V2.relation.refresh();
        relDetail(relSel);
        UI.toast('success', '关系已添加', relSel + ' → ' + v.dst + '（' + v.type + '）');
        if (window.Views) Views.V.client && (DB.pushLog('关联图谱', '添加关系', relSel + ' → ' + v.dst, v.type + '：' + (v.note || '')));
      });
  }

  /* ============ 8. 风险聚合监控 ============ */
  var aggSort = 'usage', aggOnlyRisk = true;
  V2.agg = {
    render: function () {
      $$('#agg-sort-seg button').forEach(function (b) { b.onclick = function () { aggSort = b.dataset.s; V2.agg.refresh(); }; });
      $('#agg-only-risk').onchange = function () { aggOnlyRisk = this.checked; V2.agg.refresh(); };
      $('#agg-threshold').onclick = aggThreshold;
      $('#agg-recalc').onclick = function () {
        V2.agg.refresh();
        UI.toast('success', '聚合完成', '已重新计算所有客户组敞口与风险等级');
        DB.pushLog('风险聚合', '重新聚合', '全系统', '手工触发重新聚合');
      };
      V2.agg.refresh();
    },
    refresh: function () {
      var gs = DB.groupAgg();
      gs = gs.filter(function (g) { return g.groupId; });  /* 仅显示已归组 */
      if (aggOnlyRisk) gs = gs.filter(function (g) { return g.risk !== '低'; });
      gs.sort(function (a, b) {
        if (aggSort === 'usage') return b.usage - a.usage;
        if (aggSort === 'exposure') return b.exposure - a.exposure;
        return b.equity - a.equity;
      });
      var th = DB.threshold;
      $('#agg-kpis').innerHTML = [
        { label: '高风险客户组', val: gs.filter(function (g) { return g.risk === '高'; }).length, warn: true, unit: '组' },
        { label: '中风险客户组', val: gs.filter(function (g) { return g.risk === '中'; }).length, unit: '组' },
        { label: '客户组总敞口', val: (gs.reduce(function (s, g) { return s + g.exposure; }, 0) / 10000).toFixed(2), unit: '亿元' },
        { label: '平均占用率', val: (gs.length ? gs.reduce(function (s, g) { return s + g.usage; }, 0) / gs.length : 0).toFixed(1), warn: true, unit: '%' }
      ].map(function (p) { return '<div class="kpi' + (p.warn ? ' warn' : '') + '"><div class="k-label">' + p.label + '</div><div class="k-val">' + fmt(p.val, p.val % 1 ? (p.val % 1 ? 2 : 0) : 0) + ' <small>' + p.unit + '</small></div></div>'; }).join('');

      $('#tbl-agg tbody').innerHTML = gs.map(function (g) {
        var riskTag = g.risk === '高' ? UI.tag('hi', '高') : (g.risk === '中' ? UI.tag('md', '中') : UI.tag('lo', '低'));
        var maxVarName = g.maxVar ? DB.VARIETIES[g.maxVar].name : '—';
        return '<tr data-gid="' + esc(g.groupId) + '">'
          + '<td><b>' + esc(g.groupId) + '</b> ' + esc(g.label) + '</td>'
          + '<td style="color:var(--muted)">' + esc(g.nameList.join('、').slice(0, 38)) + (g.nameList.join('').length > 38 ? '…' : '') + '</td>'
          + '<td class="num">' + fmt(g.equity) + '</td><td class="num">' + fmt(g.exposure) + '</td>'
          + '<td>' + UI.barCell(g.usage, th.usageWarn, th.usageHigh) + '</td>'
          + '<td>' + UI.barCell(g.maxConc, th.concWarn, th.concHigh) + '<div style="font-size:11px;color:var(--muted);margin-top:3px">' + maxVarName + '</div></td>'
          + '<td class="ctr">' + riskTag + '</td>'
          + '<td class="ctr"><button class="btn sm link" data-act="detail">分解</button></td></tr>';
      }).join('') || '<tr class="dis"><td class="empty-row" colspan="8">无符合条件客户组</td></tr>';

      $('#tbl-agg').querySelectorAll('button[data-act]').forEach(function (b) {
        b.onclick = function () { aggDetail(this.closest('tr').dataset.gid); };
      });
    }
  };
  function aggDetail(gid) {
    var g = DB.groupAgg().filter(function (x) { return x.groupId === gid; })[0];
    if (!g) return;
    var rows = [];
    g.members.forEach(function (id) {
      var c = DB.clients.filter(function (x) { return x.id === id; })[0];
      (DB.exposures[id] || []).forEach(function (e) {
        rows.push({ client: c.name, variety: DB.VARIETIES[e.variety].name, biz: e.biz, net: e.net, margin: Math.abs(e.net) * DB.VARIETIES[e.variety].marginRate });
      });
    });
    var html = '<div class="dl">'
      + '<dt>客户组</dt><dd class="mono" style="color:var(--accent);font-weight:700">' + esc(g.groupId) + '</dd>'
      + '<dt>组名</dt><dd>' + esc(g.label) + '</dd>'
      + '<dt>组内客户</dt><dd>' + esc(g.nameList.join('、')) + '</dd>'
      + '<dt>总权益 / 敞口</dt><dd class="mono">' + fmt(g.equity) + ' / ' + fmt(g.exposure) + ' 万元</dd>'
      + '<dt>保证金占用率</dt><dd>' + UI.barCell(g.usage, DB.threshold.usageWarn, DB.threshold.usageHigh) + '</dd>'
      + '<dt>风险等级</dt><dd>' + UI.tag(g.risk === '高' ? 'hi' : (g.risk === '中' ? 'md' : 'lo'), g.risk) + '</dd>'
      + '</div>'
      + '<div class="sec-label">业务线敞口分解</div>'
      + '<div class="table-wrap" style="max-height:260px"><table class="tbl"><thead><tr><th>客户</th><th>品种</th><th>业务</th><th>方向</th><th class="num">敞口（万元）</th><th class="num">保证金（万元）</th></tr></thead><tbody>'
      + rows.map(function (r) {
        return '<tr class="dis"><td>' + esc(r.client) + '</td><td>' + UI.tag('blue', r.variety) + '</td><td style="color:var(--muted)">' + esc(r.biz) + '</td>'
          + '<td>' + (r.net > 0 ? UI.tag('hi', '多') : UI.tag('lo', '空')) + '</td><td class="num">' + fmt(Math.abs(r.net)) + '</td><td class="num">' + fmt(r.margin) + '</td></tr>';
      }).join('')
      + '</tbody></table></div>';
    UI.openDrawer('风险聚合分解 · ' + esc(g.label), esc(g.groupId) + ' · 组内 ' + g.members.length + ' 客户', html);
  }
  function aggThreshold() {
    var th = DB.threshold;
    UI.openModal('阈值设置', ''
      + '<div class="form-grid2">'
      + '<div class="form-row"><label>保证金占用率 · 中级预警 (%)</label><input class="inp" type="number" name="usageWarn" value="' + th.usageWarn + '"></div>'
      + '<div class="form-row"><label>保证金占用率 · 高级预警 (%)</label><input class="inp" type="number" name="usageHigh" value="' + th.usageHigh + '"></div>'
      + '</div>'
      + '<div class="form-grid2">'
      + '<div class="form-row"><label>品种集中度 · 中级预警 (%)</label><input class="inp" type="number" name="concWarn" value="' + th.concWarn + '"></div>'
      + '<div class="form-row"><label>品种集中度 · 高级预警 (%)</label><input class="inp" type="number" name="concHigh" value="' + th.concHigh + '"></div>'
      + '</div>'
      + '<div class="form-tip">保存后将即时重新评估所有客户组风险等级与预警。</div>',
      null,
      function () {
        var v = UI.modalVal();
        DB.setThreshold({ usageWarn: +v.usageWarn, usageHigh: +v.usageHigh, concWarn: +v.concWarn, concHigh: +v.concHigh });
        V2.agg.refresh();
        UI.toast('success', '阈值已更新', '已即时重新评估所有客户组');
      });
  }

  /* ============ 9. 预警中心 ============ */
  V2.alert = {
    render: function () { V2.alert.refresh(); },
    refresh: function () {
      var th = DB.threshold;
      $('#al-rule-u').textContent = th.usageWarn + '/' + th.usageHigh;
      $('#al-rule-c').textContent = th.concWarn + '/' + th.concHigh;
      var fL = $('#al-f-lvl').value, fS = $('#al-f-st').value, fT = $('#al-f-type').value;
      var rows = DB.alerts.filter(function (a) {
        return (!fL || a.lvl === fL) && (!fS || a.status === fS) && (!fT || a.type === fT);
      });
      var hi = rows.filter(function (a) { return a.lvl === '高' && a.status !== '已处置'; }).length;
      var md = rows.filter(function (a) { return a.lvl === '中' && a.status !== '已处置'; }).length;
      var pend = rows.filter(function (a) { return a.status === '未处理'; }).length;
      $('#alert-kpis').innerHTML = [
        { label: '高级预警（未处置）', val: rows.filter(function (a) { return a.lvl === '高' && a.status === '未处理'; }).length, warn: true, unit: '条' },
        { label: '中级预警（未处置）', val: rows.filter(function (a) { return a.lvl === '中' && a.status === '未处理'; }).length, unit: '条' },
        { label: '待处理总数', val: pend, unit: '条' },
        { label: '今日新增', val: rows.filter(function (a) { return Date.now() - a.ts < 864e5; }).length, unit: '条' }
      ].map(function (p) { return '<div class="kpi' + (p.warn ? ' warn' : '') + '"><div class="k-label">' + p.label + '</div><div class="k-val">' + fmt(p.val) + ' <small>' + p.unit + '</small></div></div>'; }).join('');

      $('#al-count').textContent = rows.length + ' 条预警';
      $('#tbl-alert tbody').innerHTML = rows.map(function (a) {
        var lc = a.lvl === '高' ? 'solid-hi' : (a.lvl === '中' ? 'solid-md' : 'blue');
        var sc = a.status === '未处理' ? 'hi' : (a.status === '处理中' ? 'md' : 'lo');
        return '<tr data-id="' + a.id + '"><td class="mono" style="font-size:11.6px">' + esc(a.time) + '</td>'
          + '<td class="ctr">' + UI.tag(lc, a.lvl) + '</td><td>' + UI.tag('gray', a.type) + '</td>'
          + '<td>' + esc(a.obj) + '</td><td style="color:var(--muted)">' + esc(a.metric) + '</td>'
          + '<td class="num" style="color:var(--hi);font-weight:700">' + a.val + '</td><td class="num" style="color:var(--muted)">' + a.th + '</td>'
          + '<td class="ctr">' + UI.tag(sc, a.status) + '</td>'
          + '<td class="ctr">' + (a.status === '已处置' ? '<span style="color:var(--muted)">已闭环</span>' : '<button class="btn sm" data-act="dispose">处置</button>') + '</td></tr>';
      }).join('') || '<tr class="dis"><td class="empty-row" colspan="9">无预警记录</td></tr>';
      $$('#tbl-alert button[data-act]').forEach(function (b) { b.onclick = function () { alertDispose(this.closest('tr').dataset.id); }; });
      var badge = $('#nav-alert-badge');
      var cnt = DB.alerts.filter(function (a) { return a.status === '未处理'; }).length;
      if (cnt > 0) { badge.textContent = cnt; badge.style.display = ''; } else badge.style.display = 'none';
    }
  };
  function alertDispose(id) {
    var a = DB.alerts.filter(function (x) { return x.id === id; })[0];
    if (!a) return;
    UI.openModal('预警处置 · ' + a.id, ''
      + '<div style="background:var(--bg);border:1px solid var(--rule);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12.3px">'
      + '<div style="margin-bottom:6px">' + UI.tag(a.lvl === '高' ? 'solid-hi' : 'solid-md', a.lvl) + ' ' + UI.tag('gray', a.type) + '</div>'
      + '<div style="font-weight:600;margin-bottom:4px">' + esc(a.obj) + '</div>'
      + '<div style="color:var(--muted)">' + esc(a.metric) + '：当前 <b style="color:var(--hi)">' + a.val + '</b> / 阈值 ' + a.th + '</div>'
      + '</div>'
      + '<div class="form-row"><label>处置措施 <span class="req">*</span></label><select class="sel" name="action">'
      + '<option>追加保证金</option><option>限制开仓</option><option>电话提示风险</option><option>强平部分头寸</option><option>调整保证金率</option><option>移出归组单独管控</option></select></div>'
      + '<div class="form-row"><label>处置备注</label><textarea name="note" placeholder="例：已追加保证金 2000 万元，占用率降至 71%"></textarea></div>',
      null,
      function () {
        var v = UI.modalVal();
        DB.disposeAlert(id, v.action, v.note);
        V2.alert.refresh();
        UI.toast('success', '预警已处置', a.obj + ' → ' + v.action);
      });
  }

  /* ============ 10. 数据接口 ============ */
  V2.feed = {
    render: function () { V2.feed.refresh(); $('#feed-refresh').onclick = V2.feed.refresh; },
    refresh: function () {
      $('#tbl-feed tbody').innerHTML = DB.feeds.map(function (f) {
        var st = f.status === 'online' ? UI.tag('lo', '● 在线') : (f.status === 'warn' ? UI.tag('md', '● 异常') : UI.tag('hi', '● 断开'));
        return '<tr class="dis"><td><b>' + esc(f.name) + '</b></td><td style="color:var(--muted)">' + esc(f.use) + '</td>'
          + '<td class="mono" style="font-size:11.5px">' + esc(f.proto) + '</td><td class="mono" style="font-size:11.5px">' + esc(f.freq) + '</td>'
          + '<td class="ctr">' + st + '</td>'
          + '<td class="num">' + (f.delay == null ? '—' : f.delay + ' <span style="color:var(--muted)">ms</span>') + '</td>'
          + '<td class="mono" style="font-size:11.5px">' + DB.fmtTime() + '</td><td class="num">' + fmt(f.msgs) + '</td>'
          + '<td class="ctr"><button class="btn sm" data-name="' + esc(f.name) + '" data-act="reconnect">重连</button></td></tr>';
      }).join('');
      $$('#tbl-feed button[data-act]').forEach(function (b) {
        b.onclick = function () {
          var name = this.dataset.name;
          var f = DB.feeds.filter(function (x) { return x.name === name; })[0];
          if (!f) return;
          if (f.status === 'offline') {
            f.status = 'online'; f.delay = 320;
            UI.toast('success', '重连成功', name + ' 已恢复在线');
            DB.pushLog('数据接口', '接口重连', name, '从断开恢复为在线');
          } else {
            UI.toast('info', '连接正常', name + ' 当前状态：' + (f.status === 'online' ? '在线' : '异常'));
          }
          V2.feed.refresh();
        };
      });
      var online = DB.feeds.filter(function (f) { return f.status === 'online'; }).length;
      var total = DB.feeds.length;
      $('#st-feeds').textContent = online + '/' + total;
      var dot = $('#st-dot'), txt = $('#st-txt');
      var offline = DB.feeds.filter(function (f) { return f.status === 'offline'; }).length;
      if (offline > 0) { dot.className = 'dot warn'; txt.textContent = offline + ' 个接口断开'; }
      else { dot.className = 'dot ok'; txt.textContent = '系统运行正常'; }
    }
  };

  /* ============ 11. 操作日志 ============ */
  var logMod = '';
  V2.log = {
    render: function () {
      var sel = $('#log-f-mod');
      var mods = {};
      DB.logs.forEach(function (l) { mods[l.module] = true; });
      var opts = '<option value="">全部模块</option>';
      Object.keys(mods).forEach(function (m) { opts += '<option value="' + esc(m) + '">' + esc(m) + '</option>'; });
      sel.innerHTML = opts;
      sel.onchange = function () { logMod = this.value; V2.log.refresh(); };
      $('#log-export').onclick = function () {
        var rows = DB.logs;
        UI.exportCSV('操作日志.csv', ['时间', '操作员', '模块', '动作', '对象', '详情'],
          rows.map(function (l) { return [l.time, l.user, l.module, l.action, l.obj, l.detail]; }));
        UI.toast('success', '导出成功', '已导出 ' + rows.length + ' 条日志');
      };
      V2.log.refresh();
    },
    refresh: function () {
      var rows = logMod ? DB.logs.filter(function (l) { return l.module === logMod; }) : DB.logs;
      $('#log-count').textContent = rows.length + ' 条日志';
      $('#tbl-log tbody').innerHTML = rows.map(function (l) {
        return '<tr class="dis feed-row"><td>' + esc(l.time) + '</td><td>' + esc(l.user) + '</td><td>' + UI.tag('blue', l.module) + '</td><td>' + esc(l.action) + '</td><td>' + esc(l.obj) + '</td><td style="color:var(--muted)">' + esc(l.detail) + '</td></tr>';
      }).join('');
      $('#st-ops').textContent = DB.logs.length;
    }
  };

  /* ============ 12. 帮助文档（Mermaid 懒渲染） ============ */
  V2.help = {
    render: function () {
      var pres = $$('#view-help pre.mermaid:not([data-rendered])');
      if (!pres.length || !window.mermaid) return;
      pres.forEach(function (p) { p.setAttribute('data-rendered', '1'); });
      try { window.mermaid.run({ nodes: pres }); } catch (e) { try { window.mermaid.init(undefined, pres); } catch (e2) {} }
    }
  };

  /* ============================================================
   * 路由 + 全局搜索 + 实时引擎
   * ============================================================ */
  window.Views2 = V2;
  window.Views2.refreshAll = function () { V2.agg.refresh && V2.agg.refresh(); V2.alert.refresh && V2.alert.refresh(); Views.V.dash.refresh && Views.V.dash.refresh(); };

  var CRUMB = {
    dash: '工作台', variety: '品种风险监控', master: '标的档案', mapping: '映射关系', pos: '持仓成交分析', chain: '风险链穿透',
    client: '客户识别与归一', relation: '关联图谱', agg: '风险聚合监控',
    alert: '预警中心', feed: '数据接口', log: '操作日志', help: '方法论文档'
  };
  var initialized = {};
  var viewRender = {
    dash: Views.V.dash.render, variety: function () {}, master: Views.V.master.render, mapping: Views.V.mapping.render,
    pos: Views.V.pos.render, chain: Views.V.chain.render, client: Views.V.client.render,
    relation: V2.relation.render, agg: V2.agg.render, alert: V2.alert.render,
    feed: V2.feed.render, log: V2.log.render, help: V2.help.render
  };

  function showView(id) {
    var view = document.getElementById('view-' + id);
    if (!view) return;
    $$('.view').forEach(function (v) { v.classList.remove('active'); });
    view.classList.add('active');
    $$('#nav a').forEach(function (a) { a.classList.toggle('active', a.dataset.view === id); });
    $('#crumb').innerHTML = '风险管理系统 / <b>' + CRUMB[id] + '</b>';
    if (!initialized[id]) { initialized[id] = true; if (viewRender[id]) viewRender[id](); }
    else { if (viewRender[id]) viewRender[id](); }
    setTimeout(function () { Views.resizeVisible(); }, 80);
  }
  window.App = { go: showView };

  $$('#nav a').forEach(function (a) {
    a.onclick = function (e) { e.preventDefault(); showView(a.dataset.view); };
  });
  $$('[data-goto]').forEach(function (b) { b.onclick = function () { showView(b.dataset.goto); }; });

  /* 全局搜索 */
  var gsInput = $('#global-search'), gsResults = $('#gs-results');
  gsInput.addEventListener('input', function () {
    var q = this.value.trim().toLowerCase();
    if (!q) { gsResults.classList.remove('open'); return; }
    var r = [];
    DB.instruments.forEach(function (i) {
      if (i.ukey.toLowerCase().indexOf(q) >= 0 || i.name.toLowerCase().indexOf(q) >= 0 || i.exCode.toLowerCase().indexOf(q) >= 0)
        r.push({ t: i.name, s: i.ukey + ' · ' + i.asset + ' · ' + i.exch, view: 'master', id: i.ukey });
    });
    DB.clients.forEach(function (c) {
      if (c.id.toLowerCase().indexOf(q) >= 0 || c.name.toLowerCase().indexOf(q) >= 0)
        r.push({ t: c.name, s: c.id + ' · ' + c.type, view: 'client', id: c.id });
    });
    Object.keys(DB.VARIETIES).forEach(function (k) {
      var v = DB.VARIETIES[k];
      if (v.name.toLowerCase().indexOf(q) >= 0 || v.prefix.toLowerCase().indexOf(q) >= 0 || k.indexOf(q) >= 0)
        r.push({ t: v.name, s: v.prefix + ' · ' + v.exch + ' · ' + fmt(v.price, 1), view: 'pos' });
    });
    r = r.slice(0, 10);
    gsResults.innerHTML = r.map(function (x) { return '<div class="gs-item" data-view="' + x.view + '"' + (x.id ? ' data-id="' + esc(x.id) + '"' : '') + '><span><div class="t">' + esc(x.t) + '</div><div class="s">' + esc(x.s) + '</div></span><span class="tag blue">' + ({ master: '标的', client: '客户', pos: '品种' }[x.view]) + '</span></div>'; }).join('') || '<div class="gs-item" style="color:var(--muted)">无匹配结果</div>';
    gsResults.classList.add('open');
    $$('.gs-item', gsResults).forEach(function (it) {
      it.onclick = function () {
        gsResults.classList.remove('open');
        gsInput.value = '';
        var v = it.dataset.view;
        showView(v);
        if (v === 'master' && it.dataset.id) setTimeout(function () { Views.V.master.render(); }, 100);
      };
    });
  });
  document.addEventListener('click', function (e) { if (!e.target.closest('.global-search')) gsResults.classList.remove('open'); });

  /* 实时引擎 */
  var liveBtn = $('#btn-live');
  liveBtn.onclick = function () {
    DB.live = !DB.live;
    liveBtn.classList.toggle('on', DB.live);
    $('#live-txt').textContent = '实时刷新 · ' + (DB.live ? '开' : '关');
    UI.toast(DB.live ? 'success' : 'warn', DB.live ? '实时刷新已开启' : '实时刷新已暂停', DB.live ? '行情与风险指标每 5 秒自动更新' : '数据已冻结');
  };

  DB.onTick(function (type, data) {
    var view = document.querySelector('.view.active');
    var vid = view ? view.id.replace('view-', '') : '';
    $('#data-time').textContent = DB.fmtTime();
    if (vid === 'dash' && Views.V.dash.refresh) Views.V.dash.refresh();
    if (vid === 'pos' && Views.V.pos.refresh) Views.V.pos.refresh();
    if (vid === 'feed' && V2.feed.refresh) V2.feed.refresh();
    if (vid === 'agg' && V2.agg.refresh) V2.agg.refresh();
    V2.alert.refresh && V2.alert.refresh();
    if (type === 'alert' && data) {
      UI.toast(data.lvl === '高' ? 'danger' : 'warn', '[' + data.lvl + '] ' + data.type + ' 预警', data.obj + ' · ' + data.metric + ' ' + data.val + ' ≥ 阈值 ' + data.th);
    }
  });
  setInterval(function () { DB.tick(); }, 5000);

  /* Mermaid 初始化 */
  if (window.mermaid) {
    window.mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'loose',
      themeVariables: { primaryColor: '#E7EEFA', primaryBorderColor: '#1656C8', primaryTextColor: '#1A2537', lineColor: '#6B7A90', fontSize: '12px' } });
  }

  /* 窗口自适应 */
  window.addEventListener('resize', function () { clearTimeout(window._rT); window._rT = setTimeout(function () { Views.resizeVisible(); }, 200); });

  /* 抽屉/模态关闭 */
  $('#drawer-close').onclick = UI.closeDrawer;
  $('#drawer-mask').onclick = UI.closeDrawer;
  $('#modal-x').onclick = UI.modalClose = UI.closeModal;
  $('#modal-mask').addEventListener('click', function (e) { if (e.target === this) UI.closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { UI.closeDrawer(); UI.closeModal(); } });

  /* 客户复选框注入：MutationObserver 监听 tbody 行变化自动注入 checkbox */
  (function () {
    var tb = $('#tbl-client tbody');
    if (tb && window.MutationObserver) {
      var obs = new MutationObserver(function () { Views.rebuildClientChecks(); });
      obs.observe(tb, { childList: true });
    }
  })();

  /* ---------- 启动 ---------- */
  $('#data-time').textContent = DB.fmtTime();
  showView('dash');
  DB.pushLog('系统', '系统启动', 'WindRisk Console', '同一标的·同一客户全面风险管理系统 v2.0 启动');
})(window.UI, window.Views);
