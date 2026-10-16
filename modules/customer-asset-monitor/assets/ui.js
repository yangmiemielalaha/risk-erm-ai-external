/* ============================================================
 * UI 组件层：toast · 抽屉 · 模态 · 通用表格 · CSV 导出
 * ============================================================ */
window.UI = (function () {
  'use strict';
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function fmt(n, d) { return (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('zh-CN', { minimumFractionDigits: d == null ? 0 : d, maximumFractionDigits: d == null ? 0 : d }); }

  /* ---------------- Toast ---------------- */
  function toast(type, title, content, ms) {
    var icons = { success: '✔', danger: '⚠', warn: '▲', info: 'ℹ' };
    var stack = $('#toast-stack');
    var el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = '<span class="ti">' + (icons[type] || 'ℹ') + '</span><div><b>' + esc(title) + '</b>' + (content ? '<div class="tc">' + esc(content) + '</div>' : '') + '</div>';
    stack.appendChild(el);
    var t = setTimeout(function () { el.classList.add('out'); setTimeout(function () { el.remove(); }, 250); }, ms || 3200);
    el.addEventListener('click', function () { clearTimeout(t); el.remove(); });
    return el;
  }

  /* ---------------- Drawer ---------------- */
  function openDrawer(title, sub, html, footHtml) {
    $('#drawer-title').innerHTML = title;
    $('#drawer-sub').innerHTML = sub || '';
    $('#drawer-body').innerHTML = html;
    $('#drawer-foot').innerHTML = footHtml || '';
    $('#drawer').classList.add('open');
    $('#drawer-mask').classList.add('open');
  }
  function closeDrawer() { $('#drawer').classList.remove('open'); $('#drawer-mask').classList.remove('open'); }

  /* ---------------- Modal ---------------- */
  var modalSubmit = null;
  function openModal(title, bodyHtml, footHtml, onSubmit) {
    $('#modal-title').innerHTML = title;
    $('#modal-body').innerHTML = bodyHtml;
    $('#modal-foot').innerHTML = footHtml || '<button class="btn" id="md-cancel">取消</button><button class="btn primary" id="md-ok">确定</button>';
    modalSubmit = onSubmit || null;
    $('#modal-mask').classList.add('open');
    var cancel = $('#md-cancel');
    if (cancel) cancel.onclick = closeModal;
    var ok = $('#md-ok');
    if (ok) ok.onclick = function () {
      if (!modalSubmit || modalSubmit() !== false) closeModal();
    };
    var first = $('#modal-body').querySelector('input,select,textarea');
    if (first) setTimeout(function () { first.focus(); }, 60);
  }
  function closeModal() { $('#modal-mask').classList.remove('open'); modalSubmit = null; }
  function modalVal(root) {
    var o = {};
    $$('#modal-body [name]', root).forEach(function (el) { o[el.name] = el.type === 'checkbox' ? el.checked : el.value.trim(); });
    return o;
  }

  /* ---------------- 通用表格（搜索 / 排序 / 分页） ---------------- */
  function Table(opt) {
    /* opt: { rows:fn|array, columns:[{k,label,cls,html}], tbody, pager, pageSize, onRow, empty } */
    var state = { page: 1, sort: opt.sort || null, dir: opt.dir || 1, search: opt.search || '', filters: {} };
    var all = opt.rows || [];

    function getData() { return typeof all === 'function' ? all() : all; }
    function filtered() {
      var rows = getData();
      var q = state.search.toLowerCase();
      if (q) rows = rows.filter(function (r) { return JSON.stringify(r).toLowerCase().indexOf(q) >= 0; });
      Object.keys(state.filters).forEach(function (k) {
        var v = state.filters[k];
        if (v !== '' && v != null) rows = rows.filter(function (r) { return String(r[k]) === v || (typeof state.filterFns === 'function'); });
      });
      if (opt.filter) rows = opt.filter(rows, state);
      if (state.sort) {
        var k = state.sort;
        rows = rows.slice().sort(function (a, b) {
          var x = a[k], y = b[k];
          if (typeof x === 'number' && typeof y === 'number') return (x - y) * state.dir;
          return String(x == null ? '' : x).localeCompare(String(y == null ? '' : y), 'zh-CN') * state.dir;
        });
      }
      return rows;
    }
    function render() {
      var rows = filtered();
      var ps = opt.pageSize || 10;
      var pages = Math.max(1, Math.ceil(rows.length / ps));
      if (state.page > pages) state.page = pages;
      var pg = opt.pager ? rows.slice((state.page - 1) * ps, state.page * ps) : rows;

      var tbody = $(opt.tbody);
      var cols = opt.columns;
      var html = '';
      if (!rows.length) html = '<tr class="dis"><td class="empty-row" colspan="' + (cols.length + (opt.check ? 1 : 0)) + '">暂无数据</td></tr>';
      pg.forEach(function (r, idx) {
        html += '<tr data-idx="' + idx + '" data-id="' + esc(opt.rowId ? opt.rowId(r) : (r.ukey || r.id || '')) + '"' + (opt.onRow ? ' style="cursor:pointer"' : '') + '>';
        cols.forEach(function (c) {
          var v = c.html ? c.html(r) : esc(r[c.k]);
          html += '<td class="' + (c.cls || '') + '">' + v + '</td>';
        });
        html += '</tr>';
      });
      tbody.innerHTML = html;

      if (opt.onRow) {
        $$('tbody tr', tbody.parentNode).forEach(function (tr) {
          if (tr.classList.contains('dis')) return;
          tr.addEventListener('click', function () { opt.onRow(tr.dataset.id, r0(tr)); });
        });
      }
      function r0(tr) {
        var arr = pg;
        return arr[+tr.dataset.idx];
      }

      if (opt.pager) {
        var p = $(opt.pager);
        var btns = '';
        btns += '<button class="pg" data-p="prev" ' + (state.page <= 1 ? 'disabled' : '') + '>‹</button>';
        var from = Math.max(1, state.page - 2), to = Math.min(pages, from + 4);
        for (var i = from; i <= to; i++) btns += '<button class="pg' + (i === state.page ? ' on' : '') + '" data-p="' + i + '">' + i + '</button>';
        btns += '<button class="pg" data-p="next" ' + (state.page >= pages ? 'disabled' : '') + '>›</button>';
        p.innerHTML = '<span>共 ' + rows.length + ' 条 · 第 ' + state.page + '/' + pages + ' 页</span><span class="spacer" style="flex:1"></span><span class="pages">' + btns + '</span>';
        $$('.pg', p).forEach(function (b) {
          b.onclick = function () {
            var v = b.dataset.p;
            if (v === 'prev') state.page--; else if (v === 'next') state.page++; else state.page = +v;
            render();
          };
        });
      }
      if (opt.onRender) opt.onRender(rows);
      return rows;
    }
    function sortBind() {
      if (!opt.tbody) return;
      var thead = $(opt.tbody).parentNode.querySelector('thead');
      if (!thead) return;
      $$('th.sortable', thead).forEach(function (th) {
        th.addEventListener('click', function () {
          var k = th.dataset.k;
          if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = 1; }
          $$('th.sortable', thead).forEach(function (x) { x.querySelector('.arr') && (x.querySelector('.arr').textContent = ''); });
          var arr = th.querySelector('.arr');
          if (!arr) { arr = document.createElement('span'); arr.className = 'arr'; th.appendChild(arr); }
          arr.textContent = state.dir === 1 ? '▲' : '▼';
          render();
        });
      });
    }
    sortBind();
    return { render: render, state: state, filtered: filtered };
  }

  /* ---------------- CSV 导出 ---------------- */
  function exportCSV(filename, header, rows) {
    var csv = '\uFEFF' + header.map(function (h) { return '"' + String(h).replace(/"/g, '""') + '"'; }).join(',') + '\n';
    rows.forEach(function (r) {
      csv += r.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(',') + '\n';
    });
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }

  /* ---------------- 标签辅助 ---------------- */
  function tag(cls, txt) { return '<span class="tag ' + cls + '">' + esc(txt) + '</span>'; }
  function barCell(val, warnTh, highTh, unit) {
    unit = unit == null ? '%' : unit;
    var cls = val >= highTh ? 'hi' : (val >= warnTh ? 'md' : 'lo');
    return '<div class="bar-cell"><div class="bar"><i class="' + cls + '" style="width:' + Math.min(100, val) + '%"></i></div><span class="v">' + (val == null ? '—' : val.toFixed(1)) + unit + '</span></div>';
  }

  /* ---------------- 主题色读取（图表用） ---------------- */
  function themeColors() {
    var s = getComputedStyle(document.documentElement);
    var g = function (n) { return s.getPropertyValue(n).trim(); };
    return { accent: g('--accent'), accent2: g('--accent2'), ink: g('--ink'), muted: g('--muted'), rule: g('--rule'), bg2: g('--bg2'), hi: g('--hi'), md: g('--md'), lo: g('--lo') };
  }

  return { $: $, $$: $$, esc: esc, fmt: fmt, toast: toast, tag: tag, barCell: barCell,
    openDrawer: openDrawer, closeDrawer: closeDrawer,
    openModal: openModal, closeModal: closeModal, modalVal: modalVal,
    Table: Table, exportCSV: exportCSV, themeColors: themeColors };
})();
