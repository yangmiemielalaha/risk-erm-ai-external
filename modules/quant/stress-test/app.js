import * as XLSX from "xlsx";

/* 情景参数调设与压力测试模块 —— 演示逻辑（重构版） */
(function () {
  "use strict";

  /* ---------- 模拟合约池（演示数据，可被 Excel 导入替换） ---------- */
  const BASE_UNDERLYING_CAT = {
    "中证500": "权益", "中证1000": "权益", "沪深300": "权益", "恒生科技": "权益",
    "沪金": "商品", "螺纹钢": "商品", "沪铜": "商品",
    "国债期货": "其他", "鸡蛋": "其他"
  };
  let UNDERLYING_CAT = { ...BASE_UNDERLYING_CAT };
  const STRUCTS = ["雪球", "凤凰", "DCN", "FCN", "香草", "单鲨", "双鲨", "单障碍敲入"];

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function ri(a, b) { return Math.round(rnd(a, b)); }

  let seedId = 1;
  function mkContract(name, struct, under, tenor, notional) {
    return {
      id: seedId++, name, struct, under, cat: UNDERLYING_CAT[under] || "其他",
      tenor, notional,
      spot: "", basis: "", vol: "", dtenor: "",
      checkedL: false, checkedR: false
    };
  }

  const DEMO_POOL = [
    mkContract("中证500雪球2303-01", "雪球", "中证500", 362, 5000),
    mkContract("中证500雪球2401-03", "雪球", "中证500", 180, 3000),
    mkContract("中证1000雪球2405-01", "雪球", "中证1000", 290, 4000),
    mkContract("沪深300雪球2311-02", "雪球", "沪深300", 88, 2500),
    mkContract("中证500凤凰2402-01", "凤凰", "中证500", 210, 2000),
    mkContract("恒生科技凤凰2403-05", "凤凰", "恒生科技", 150, 1800),
    mkContract("沪深300凤凰2312-01", "凤凰", "沪深300", 75, 1200),
    mkContract("中证1000DCN2401-02", "DCN", "中证1000", 340, 2200),
    mkContract("中证500DCN2310-01", "DCN", "中证500", 60, 1500),
    mkContract("恒生科技FCN2404-01", "FCN", "恒生科技", 270, 1600),
    mkContract("沪深300FCN2406-02", "FCN", "沪深300", 320, 2000),
    mkContract("中证500香草2403-01", "香草", "中证500", 120, 800),
    mkContract("沪深300香草2407-01", "香草", "沪深300", 300, 1000),
    mkContract("恒生科技单鲨2402-01", "单鲨", "恒生科技", 190, 900),
    mkContract("中证1000双鲨2405-03", "双鲨", "中证1000", 250, 1100),
    mkContract("中证500单障碍敲入2401-01", "单障碍敲入", "中证500", 200, 1300),
    mkContract("沪金雪球2402-02", "雪球", "沪金", 175, 2600),
    mkContract("沪金香草2404-01", "香草", "沪金", 95, 700),
    mkContract("螺纹钢单鲨2403-02", "单鲨", "螺纹钢", 140, 500),
    mkContract("螺纹钢DCN2406-01", "DCN", "螺纹钢", 330, 900),
    mkContract("沪铜雪球2405-01", "雪球", "沪铜", 260, 1400),
    mkContract("国债期货香草2408-01", "香草", "国债期货", 365, 600)
  ];
  /* 演示数据补充交易编号 / 方向 / 台账希腊字母 */
  DEMO_POOL.forEach((c, i) => {
    c.tid = "DEMO-" + String(i + 1).padStart(3, "0");
    c.dir = i % 3 === 2 ? "卖出" : "买入";
    c.delta = +(c.notional * rnd(-0.5, 0.8) * 0.01).toFixed(2);
    c.gamma = +(c.notional * rnd(-1.0, 1.0) * 0.0001).toFixed(2);
    c.vega = +(c.notional * rnd(0.05, 0.6) * 0.01).toFixed(2);
  });
  let POOL = DEMO_POOL.slice();

  let left = [];    // 筛选结果
  let right = [];   // 调设区
  let computed = false;   // 步骤3 完成标记
  let aiApplied = false;  // 步骤2 完成标记

  /* ---------- DOM ---------- */
  const $ = id => document.getElementById(id);
  const TAG = { "雪球": "snowball", "凤凰": "phoenix", "DCN": "dcn", "FCN": "fcn",
    "香草": "vanilla", "单鲨": "shark", "双鲨": "dshark", "单障碍敲入": "barrier" };

  /* ---------- 流程步骤条状态 ---------- */
  function updateSteps() {
    const n = right.length;
    const unders = new Set(right.map(c => c.under)).size;
    const s1 = $("step1"), s2 = $("step2"), s3 = $("step3");

    s1.classList.toggle("done", n > 0);
    $("step1No").textContent = n > 0 ? "✓" : "1";
    $("step1Sub").textContent = n > 0 ? `已选 ${n} 张合约 · ${unders} 个标的` : "从合约池筛选并移入调设区";

    s2.classList.toggle("done", aiApplied);
    $("step2No").textContent = aiApplied ? "✓" : "2";
    $("step2Sub").textContent = aiApplied ? "AI 情景已应用到调设区"
      : (n > 0 ? `将跟随已选的 ${unders} 个标的生成情景` : "未选合约 · 可直接输入标的自由分析");

    s3.classList.toggle("done", computed);
    $("step3No").textContent = computed ? "✓" : "3";
  }
  $("step2").addEventListener("click", () => $("btnAi").click());

  /* ---------- 挂钩标的联动（按标的类别过滤） ---------- */
  function refreshUnderList() {
    const cat = $("fCat").value;
    const dl = $("underList");
    dl.innerHTML = '<option value="全选"></option>' +
      Object.keys(UNDERLYING_CAT)
        .filter(u => !cat || UNDERLYING_CAT[u] === cat)
        .map(u => `<option value="${u}"></option>`).join("");
  }
  $("fCat").addEventListener("change", refreshUnderList);
  refreshUnderList();

  /* ---------- 筛选 ---------- */
  function doQuery() {
    const s = $("fStruct").value, cat = $("fCat").value;
    let under = $("fUnder").value.trim();
    const tenor = $("fTenor").value;
    const kw = $("fKeyword").value.trim();
    if (under === "全选") under = "";
    left = POOL.filter(c =>
      (!s || c.struct === s) &&
      (!cat || c.cat === cat) &&
      (!under || c.under.includes(under) || c.name.includes(under)) &&
      (!tenor || c.tenor <= +tenor) &&
      (!kw || c.name.includes(kw))
    ).filter(c => !right.some(r => r.id === c.id))
      .map(c => ({ ...c, checkedL: false }));
    renderLeft();
  }
  $("btnQuery").addEventListener("click", doQuery);

  $("btnReset").addEventListener("click", () => {
    ["fStruct", "fCat", "fTenor"].forEach(id => $(id).value = "");
    $("fUnder").value = ""; $("fKeyword").value = "";
    left = []; renderLeft(); refreshUnderList();
  });

  $("btnAddManual").addEventListener("click", () => {
    const kw = $("fKeyword").value.trim();
    if (!kw) return;
    if (!left.some(c => c.name === kw) && !right.some(c => c.name === kw)) {
      left.push(mkContract(kw, "香草", "中证500", 180, 1000));
      renderLeft();
    }
    $("fKeyword").value = "";
  });
  $("fKeyword").addEventListener("keydown", e => { if (e.key === "Enter") $("btnAddManual").click(); });

  /* ---------- 数据源：Excel 导入 / 演示数据 ---------- */
  function setSourceBadge(text, isExcel) {
    const b = $("srcBadge");
    b.textContent = text;
    b.classList.toggle("excel", !!isExcel);
  }

  /* 全量展示当前 POOL（导入后默认全显示，再由筛选带收窄） */
  function showAll() {
    left = POOL.filter(c => !right.some(r => r.id === c.id))
      .map(c => ({ ...c, checkedL: false }));
    renderLeft();
  }

  /* Excel 行 → 合约对象；列名兼容中文表头 */
  function loadRecords(rows, srcName) {
    const need = ["合约名称", "挂钩标的"];
    if (!rows.length || need.some(k => !(k in rows[0]))) {
      alert("未识别到有效交易记录：\nExcel 至少需要包含「合约名称」「挂钩标的」两列，\n可参考随附的《交易记录.xlsx》模板。");
      return;
    }
    const biz = new Date($("bizDate").value || Date.now());
    const newCat = {};
    /* 希腊字母列名兼容：带单位表头或裸名均可 */
    const greek = (r, ...keys) => {
      for (const k of keys) { const v = parseFloat(r[k]); if (!isNaN(v)) return v; }
      return null;
    };
    const recs = rows.map(r => {
      const under = String(r["挂钩标的"] || "").trim();
      if (!under) return null;
      const cat = String(r["标的类别"] || "").trim() || UNDERLYING_CAT[under] || "其他";
      newCat[under] = cat;
      let tenor = parseFloat(r["剩余期限(天)"]);
      if (!(tenor > 0) && r["到期日"]) {
        const m = new Date(r["到期日"]);
        if (!isNaN(m)) tenor = Math.max(1, Math.round((m - biz) / 86400000));
      }
      return {
        id: seedId++,
        name: String(r["合约名称"]).trim(),
        struct: String(r["产品结构"] || "香草").trim(),
        under, cat,
        tenor: tenor > 0 ? Math.round(tenor) : 180,
        notional: parseFloat(r["名义本金(万)"]) || 1000,
        tid: String(r["交易编号"] || "").trim(),
        dir: String(r["买卖方向"] || "").trim() || "买入",
        delta: greek(r, "Delta(万/1%)", "Delta", "delta"),
        gamma: greek(r, "Gamma(万/(1%)²)", "Gamma(万/(1%)2)", "Gamma", "gamma"),
        vega: greek(r, "Vega(万/vol%)", "Vega", "vega"),
        spot: "", basis: "", vol: "", dtenor: "",
        checkedL: false, checkedR: false
      };
    }).filter(Boolean);

    if (!recs.length) { alert("Excel 中没有解析出有效行（挂钩标的为空）。"); return; }

    UNDERLYING_CAT = { ...UNDERLYING_CAT, ...newCat };
    POOL = recs;
    right = []; computed = false; aiApplied = false;
    refreshUnderList();
    showAll();
    renderRight();
    setSourceBadge(`${srcName} · ${recs.length} 条交易记录 · ${new Date().toLocaleTimeString("zh-CN", { hour12: false })} 导入`, true);
  }

  $("btnImport").addEventListener("click", () => $("fileExcel").click());
  $("fileExcel").addEventListener("change", e => {
    const f = e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = ev => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "array" });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
        loadRecords(rows, f.name);
      } catch (err) {
        alert("Excel 解析失败：" + err.message);
      }
      e.target.value = "";
    };
    rd.readAsArrayBuffer(f);
  });

  $("btnDemo").addEventListener("click", () => {
    UNDERLYING_CAT = { ...BASE_UNDERLYING_CAT };
    POOL = DEMO_POOL.slice();
    right = []; computed = false; aiApplied = false;
    refreshUnderList();
    showAll();
    renderRight();
    setSourceBadge(`内置演示数据 · ${POOL.length} 条`, false);
  });

  /* ---------- 左表渲染 ---------- */
  function renderLeft() {
    const tb = $("leftBody");
    $("leftCount").textContent = left.length;
    $("leftEmpty").style.display = left.length ? "none" : "grid";
    $("ckAllLeft").checked = false;
    tb.innerHTML = left.map(c => `
      <tr data-id="${c.id}">
        <td><input type="checkbox" class="ck ckL" data-id="${c.id}" ${c.checkedL ? "checked" : ""}></td>
        <td title="${c.tid || ""}" style="font-family:var(--mono);font-size:10px;color:var(--ink-3);">${c.tid || "—"}</td>
        <td title="${c.name}">${c.name}</td>
        <td><span class="tag ${TAG[c.struct] || ""}">${c.struct}</span></td>
        <td>${c.under}</td>
        <td><span class="tag ${c.dir === "卖出" ? "dirsell" : "dirbuy"}">${c.dir || "买入"}</span></td>
        <td class="num">${c.tenor}</td>
        <td class="num">${c.notional.toLocaleString()}</td>
      </tr>`).join("");
    tb.querySelectorAll(".ckL").forEach(ck => ck.addEventListener("change", () => {
      const c = left.find(x => x.id == ck.dataset.id); c.checkedL = ck.checked;
      syncShuttle();
    }));
    syncShuttle();
  }
  $("ckAllLeft").addEventListener("change", () => {
    left.forEach(c => c.checkedL = $("ckAllLeft").checked); renderLeft();
  });

  /* ---------- 右表渲染 ---------- */
  function renderRight() {
    const tb = $("rightBody");
    $("rightCount").textContent = right.length;
    $("rightEmpty").style.display = right.length ? "none" : "grid";
    $("batchbar").style.display = right.length ? "flex" : "none";
    tb.innerHTML = right.map((c, i) => `
      <tr data-id="${c.id}" class="${i === 0 ? "row-head-edit" : ""}">
        <td><input type="checkbox" class="ck ckR" data-id="${c.id}" ${c.checkedR ? "checked" : ""}></td>
        <td title="${c.name}">${c.name}</td>
        <td><span class="tag ${TAG[c.struct] || ""}">${c.struct}</span></td>
        ${["spot", "basis", "vol", "dtenor"].map(k => `
          <td class="num"><input class="cell-in ${c[k] !== "" ? "changed" : ""}" data-id="${c.id}" data-k="${k}" value="${c[k]}" placeholder="0"></td>`).join("")}
      </tr>`).join("");

    tb.querySelectorAll(".ckR").forEach(ck => ck.addEventListener("change", () => {
      const c = right.find(x => x.id == ck.dataset.id); c.checkedR = ck.checked;
      syncShuttle();
    }));
    tb.querySelectorAll(".cell-in").forEach(inp => inp.addEventListener("change", () => {
      const c = right.find(x => x.id == inp.dataset.id);
      c[inp.dataset.k] = inp.value.trim();
      inp.classList.toggle("changed", c[inp.dataset.k] !== "");
      /* 首行批量同步 */
      if ($("batchSync").checked && right[0] && c.id === right[0].id) {
        right.slice(1).forEach(o => { o[inp.dataset.k] = c[inp.dataset.k]; });
        renderRight();
      }
    }));
    $("btnCompute").disabled = right.length === 0;
    $("btnQuick").disabled = right.length === 0;
    syncShuttle();
    updateSteps();
  }

  $("batchSync").addEventListener("change", () => {
    $("batchState").textContent = $("batchSync").checked ? "ON" : "OFF";
  });

  /* ---------- 穿梭 ---------- */
  function syncShuttle() {
    $("mvRight").disabled = !left.some(c => c.checkedL);
    $("mvRightAll").disabled = left.length === 0;
    $("mvLeft").disabled = !right.some(c => c.checkedR);
    $("mvLeftAll").disabled = right.length === 0;
  }
  function moveRight(all) {
    const moving = left.filter(c => all || c.checkedL);
    right = right.concat(moving.map(c => ({ ...c, checkedR: false })));
    left = left.filter(c => !(all || c.checkedL));
    computed = false;
    renderLeft(); renderRight();
  }
  function moveLeft(all) {
    right = right.filter(c => !(all || c.checkedR));
    computed = false;
    renderRight(); renderLeft();
  }
  $("mvRight").addEventListener("click", () => moveRight(false));
  $("mvRightAll").addEventListener("click", () => moveRight(true));
  $("mvLeft").addEventListener("click", () => moveLeft(false));
  $("mvLeftAll").addEventListener("click", () => moveLeft(true));

  /* ---------- 批量调整弹层 ---------- */
  $("btnBatch").addEventListener("click", e => {
    e.stopPropagation();
    const p = $("batchPop");
    p.style.display = p.style.display === "none" ? "block" : "none";
  });
  document.addEventListener("click", e => {
    if (!e.target.closest(".batch-anchor")) $("batchPop").style.display = "none";
  });
  function applyBatch(selOnly) {
    const vals = { spot: $("bpSpot").value.trim(), basis: $("bpBasis").value.trim(),
      vol: $("bpVol").value.trim(), dtenor: $("bpTenor").value.trim() };
    const targets = right.filter(c => !selOnly || c.checkedR);
    targets.forEach(c => Object.keys(vals).forEach(k => { if (vals[k] !== "") c[k] = vals[k]; }));
    $("batchPop").style.display = "none";
    renderRight();
  }
  $("bpApplySel").addEventListener("click", () => applyBatch(true));
  $("bpApplyAll").addEventListener("click", () => applyBatch(false));

  /* ---------- 上下分隔条拖拽 ---------- */
  const splitter = $("splitter"), dock = document.querySelector(".bottomdock");
  splitter.addEventListener("mousedown", e => {
    e.preventDefault();
    splitter.classList.add("dragging"); document.body.classList.add("resizing");
    const startY = e.clientY, startH = dock.offsetHeight;
    function mv(ev) {
      const h = Math.min(Math.max(startH + (startY - ev.clientY), 240), window.innerHeight * 0.72);
      dock.style.flexBasis = h + "px"; dock.style.height = h + "px";
    }
    function up() {
      splitter.classList.remove("dragging"); document.body.classList.remove("resizing");
      document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up);
    }
    document.addEventListener("mousemove", mv); document.addEventListener("mouseup", up);
  });

  /* ---------- 计算 ---------- */
  const fmt = (n, d = 2) => n.toLocaleString("zh-CN", { minimumFractionDigits: d, maximumFractionDigits: d });
  let timer = null;

  $("btnCompute").addEventListener("click", () => {
    if (!right.length) return;
    $("runStatus").classList.add("busy");
    $("runStatusText").textContent = "RUNNING";
    $("progress").classList.add("on");
    $("btnCompute").disabled = true; $("btnExport").disabled = true;
    $("greeksEmpty").style.display = "grid"; $("greeksBody").innerHTML = "";
    $("sumWrap").style.display = "none"; $("sumEmpty").style.display = "grid";

    const t0 = Date.now(); let pct = 0;
    clearInterval(timer);
    timer = setInterval(() => {
      pct = Math.min(100, pct + rnd(6, 16));
      $("pbar").style.width = pct + "%";
      const s = Math.floor((Date.now() - t0) / 1000);
      $("elapsed").textContent = `已用时 ${String(Math.floor(s / 60)).padStart(2, "0")}'${String(s % 60).padStart(2, "0")}"`;
      if (pct >= 100) { clearInterval(timer); finishCompute(t0); }
    }, 160);
  });

  function finishCompute(t0) {
    const algo = $("pVarAlgo").value, conf = $("pConf").value;
    $("runStatus").classList.remove("busy");
    $("runStatusText").textContent = "DONE";
    $("progress").classList.remove("on");
    $("btnCompute").disabled = false; $("btnExport").disabled = false;

    let totPnl = 0, totVar = 0, totNotional = 0;
    const data = right.map(c => {
      const spot = parseFloat(c.spot) || 0, vol = parseFloat(c.vol) || 0;
      const notional = c.notional;
      const delta = rnd(-0.6, 0.9), gamma = rnd(0, 0.02), vega = rnd(0.05, 0.6), theta = rnd(-0.35, 0.05);
      const pnl = notional * (delta * spot / 100 + vega * vol / 100) + rnd(-notional, notional) * 0.01;
      const va = Math.abs(rnd(1, 9));
      totPnl += pnl; totVar += va * notional; totNotional += notional;
      return { c, delta, gamma, vega, theta, pnl, va };
    });

    /* 损益分布条：以最大绝对损益归一 */
    const maxAbs = Math.max(1e-9, ...data.map(d => Math.abs(d.pnl)));
    $("greeksBody").innerHTML = data.map(({ c, delta, gamma, vega, theta, pnl, va }) => {
      const w = (Math.abs(pnl) / maxAbs * 50).toFixed(1);
      const bar = pnl >= 0
        ? `<i class="pos" style="width:${w}%"></i>`
        : `<i class="neg" style="width:${w}%"></i>`;
      return `<tr>
        <td title="${c.name}">${c.name}</td>
        <td class="num">${fmt(delta, 3)}</td>
        <td class="num">${fmt(gamma, 4)}</td>
        <td class="num">${fmt(vega, 3)}</td>
        <td class="num">${fmt(theta, 3)}</td>
        <td class="num">${fmt(va)}</td>
        <td class="num ${pnl >= 0 ? "pos" : "neg"}">${pnl >= 0 ? "+" : ""}${fmt(pnl)}</td>
        <td><div class="pnlbar">${bar}</div></td>
      </tr>`;
    }).join("");
    $("greeksEmpty").style.display = "none";
    $("greeksMeta").textContent = `${algo} · ${conf} · ${$("pSims").value} 次模拟 · 业务日期 ${$("bizDate").value}`;

    /* KPI 卡片 */
    const wVar = totNotional ? totVar / totNotional : 0;
    const pnlCls = totPnl >= 0 ? "pos" : "neg";
    const cards = [
      { lbl: "合约数量", val: right.length + " 张", sub: new Set(right.map(c => c.under)).size + " 个挂钩标的", cls: "" },
      { lbl: "名义本金合计", val: fmt(totNotional) + " 万", sub: "调设区全部合约", cls: "" },
      { lbl: "情景损益合计", val: (totPnl >= 0 ? "+" : "") + fmt(totPnl) + " 万", sub: "情景参数作用下重估值", cls: totPnl >= 0 ? "up" : "down", vcls: pnlCls },
      { lbl: "组合加权 VaR", val: fmt(wVar) + " %", sub: `${conf} 置信 · ${$("pHorizon").value} 天`, cls: "warn" }
    ];
    $("sumCards").innerHTML = cards.map(k => `
      <div class="kpi ${k.cls}">
        <div class="k-lbl">${k.lbl}</div>
        <div class="k-val ${k.vcls || ""}">${k.val}</div>
        <div class="k-sub">${k.sub}</div>
      </div>`).join("");
    $("sumFoot").innerHTML =
      `汇总口径：全部调设合约 · ${algo} · ${$("pSims").value} 次模拟 · 年化 ${$("pAnnual").value} 天<br>` +
      `计算耗时 ${((Date.now() - t0) / 1000).toFixed(1)} s · 业务日期 ${$("bizDate").value}`;
    $("sumWrap").style.display = "flex";
    $("sumEmpty").style.display = "none";
    $("sumMeta").textContent = "PORTFOLIO SUMMARY";

    computed = true;
    updateSteps();
  }

  /* ---------- ⚡ 快速计算：台账希腊字母 Taylor 二阶展开（不经估值模型） ---------- */
  $("btnQuick").addEventListener("click", () => {
    if (!right.length) return;
    const t0 = Date.now();
    const checked = right.filter(c => c.checkedR);
    const list = checked.length ? checked : right;
    const missing = list.filter(c => c.delta == null && c.gamma == null && c.vega == null).length;

    let totPnl = 0, totNotional = 0, totDeltaTerm = 0, totGammaTerm = 0, totVegaTerm = 0;
    const data = list.map(c => {
      const dS = parseFloat(c.spot) || 0;   // 标的变动 %
      const dV = parseFloat(c.vol) || 0;    // 波动率变动 vol点
      const D = +c.delta || 0, G = +c.gamma || 0, V = +c.vega || 0;
      const pDelta = D * dS;
      const pGamma = 0.5 * G * dS * dS;
      const pVega = V * dV;
      const pnl = pDelta + pGamma + pVega;
      totPnl += pnl; totNotional += c.notional;
      totDeltaTerm += pDelta; totGammaTerm += pGamma; totVegaTerm += pVega;
      return { c, D, G, V, pnl };
    });

    /* 结果表：希腊字母列直接展示台账值，Theta / VaR 置 "—" */
    const maxAbs = Math.max(1e-9, ...data.map(d => Math.abs(d.pnl)));
    $("greeksBody").innerHTML = data.map(({ c, D, G, V, pnl }) => {
      const w = (Math.abs(pnl) / maxAbs * 50).toFixed(1);
      const bar = pnl >= 0
        ? `<i class="pos" style="width:${w}%"></i>`
        : `<i class="neg" style="width:${w}%"></i>`;
      return `<tr>
        <td title="${c.name}">${c.name}</td>
        <td class="num">${fmt(D)}</td>
        <td class="num">${fmt(G)}</td>
        <td class="num">${fmt(V)}</td>
        <td class="num" style="color:var(--ink-3);">—</td>
        <td class="num" style="color:var(--ink-3);">—</td>
        <td class="num ${pnl >= 0 ? "pos" : "neg"}">${pnl >= 0 ? "+" : ""}${fmt(pnl)}</td>
        <td><div class="pnlbar">${bar}</div></td>
      </tr>`;
    }).join("");
    $("greeksEmpty").style.display = "none";
    $("greeksMeta").textContent =
      `⚡ 快速计算 · Taylor 二阶展开 · ${list.length} 张（${checked.length ? "勾选" : "全部"}）` +
      (missing ? ` · ${missing} 张缺希腊字母按 0 处理` : "");

    /* KPI 卡片：VaR 卡替换为二阶 Gamma 项 */
    const pnlCls = totPnl >= 0 ? "pos" : "neg";
    const cards = [
      { lbl: "计算合约数", val: list.length + " 张", sub: checked.length ? "按勾选口径" : "未勾选 · 按全部", cls: "" },
      { lbl: "名义本金合计", val: fmt(totNotional) + " 万", sub: "快速口径合约", cls: "" },
      { lbl: "情景损益合计", val: (totPnl >= 0 ? "+" : "") + fmt(totPnl) + " 万", sub: `Delta项 ${totDeltaTerm >= 0 ? "+" : ""}${fmt(totDeltaTerm)} · Vega项 ${totVegaTerm >= 0 ? "+" : ""}${fmt(totVegaTerm)}`, cls: totPnl >= 0 ? "up" : "down", vcls: pnlCls },
      { lbl: "二阶 Gamma 项合计", val: (totGammaTerm >= 0 ? "+" : "") + fmt(totGammaTerm) + " 万", sub: "快速模式不输出 VaR / Theta", cls: "warn" }
    ];
    $("sumCards").innerHTML = cards.map(k => `
      <div class="kpi ${k.cls}">
        <div class="k-lbl">${k.lbl}</div>
        <div class="k-val ${k.vcls || ""}">${k.val}</div>
        <div class="k-sub">${k.sub}</div>
      </div>`).join("");
    $("sumFoot").innerHTML =
      `ΔP ≈ Delta·ΔS + ½·Gamma·ΔS² + Vega·Δσ · 直取台账希腊字母，未经估值模型 · 基差 / 期限项未计入<br>` +
      `瞬时完成 ${((Date.now() - t0) / 1000).toFixed(2)} s · 业务日期 ${$("bizDate").value}`;
    $("sumWrap").style.display = "flex";
    $("sumEmpty").style.display = "none";
    $("sumMeta").textContent = "QUICK TAYLOR SUMMARY";

    $("runStatus").classList.remove("busy");
    $("runStatusText").textContent = "DONE · TAYLOR";
    $("btnExport").disabled = false;
    computed = true;
    updateSteps();
  });

  /* ---------- 导出 ---------- */
  $("btnExport").addEventListener("click", () => {
    const head = "合约名称,结构,标的,剩余期限(天),名义本金(万),标的变动(%),基差变动(bp),波动率变动(%),期限变动(天)\n";
    const body = right.map(c =>
      [c.name, c.struct, c.under, c.tenor, c.notional, c.spot, c.basis, c.vol, c.dtenor].join(",")).join("\n");
    const blob = new Blob(["﻿" + head + body], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `情景压测明细_${$("bizDate").value}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  });

  /* ---------- 初始状态：默认展示演示数据全量 ---------- */
  left = []; renderRight();
  setSourceBadge(`内置演示数据 · ${POOL.length} 条`, false);
  showAll();

  /* ---------- 对 AI 模块暴露接口 ---------- */
  window.__qm = {
    getRight: () => right,
    getUnders: () => Object.entries(UNDERLYING_CAT).map(([u, cat]) => ({ u, cat })),
    setParam(id, k, v) {
      const c = right.find(x => x.id === id);
      if (c) c[k] = String(v);
    },
    markAiApplied() { aiApplied = true; },
    refreshSteps: updateSteps,
    rerender: renderRight
  };
})();

/* ═══════════ AI 情景设计子界面 ═══════════ */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);

  const DEMOS = {
    eq: "【某券商 · 权益策略周报】中证500盈利预期继续下修，指数估值处于历史30%分位，风格切换压力下短期或延续震荡偏弱，建议关注贴水走阔机会；中证1000波动率中枢抬升，对冲成本上行。",
    gold: "【贵金属月度展望】实际利率见顶回落叠加央行购金延续，沪金维持震荡上行判断，隐含波动率有望温和抬升，建议逢回调增配多头结构。",
    cmd: "【大宗商品季度报告】终端需求走弱，螺纹钢去库速度放缓，价格中枢或进一步下移；沪铜受海外衰退交易扰动，波动加剧，基差结构或转为深度贴水。"
  };

  /* 宏观情景 → 方向系数（对各类资产的冲击方向与波动放大） */
  const MACRO_MAP = {
    "美联储加息超预期":   { 权益: -1.0, 商品: -0.6, 其他: -0.3, vol: 1.2, basis: 1.0 },
    "国内降息降准":       { 权益:  0.8, 商品:  0.4, 其他:  0.3, vol: 0.6, basis: -0.5 },
    "经济衰退担忧升温":   { 权益: -1.2, 商品: -1.0, 其他: -0.4, vol: 1.5, basis: 1.2 },
    "地缘政治风险发酵":   { 权益: -0.7, 商品:  0.6, 其他:  0.2, vol: 1.4, basis: 0.6 },
    "流动性环境收紧":     { 权益: -0.9, 商品: -0.5, 其他: -0.5, vol: 1.1, basis: 1.0 },
    "风险偏好快速修复":   { 权益:  1.1, 商品:  0.5, 其他:  0.3, vol: 0.8, basis: -0.8 }
  };
  const LEVEL = { mild: 0.6, mid: 1.0, severe: 1.6 };

  /* 用户自定义标的池（自由分析模式） */
  const customUnders = [];   // [{u, cat}]

  /* 研报关键词 → 方向判断 */
  function sentimentOf(text) {
    if (!text.trim()) return { dir: 0, vol: 0, basis: 0, hits: [] };
    const neg = ["下修", "偏弱", "走弱", "贴水走阔", "回落", "去库", "衰退", "下行", "谨慎"];
    const pos = ["看多", "上行", "修复", "增配", "震荡上行", "走强", "改善", "超配"];
    const volUp = ["波动率中枢抬升", "波动加剧", "波动率抬升", "波动放大"];
    let score = 0, v = 0, hits = [];
    neg.forEach(w => { if (text.includes(w)) { score -= 1; hits.push(w); } });
    pos.forEach(w => { if (text.includes(w)) { score += 1; hits.push(w); } });
    volUp.forEach(w => { if (text.includes(w)) { v += 1; hits.push(w); } });
    const basis = text.includes("贴水走阔") ? 1 : text.includes("贴水收敛") ? -1 : 0;
    return { dir: Math.max(-1.5, Math.min(1.5, score / 3)), vol: v * 0.5, basis, hits };
  }

  /* ---------- 面板开合 ---------- */
  function openAi() {
    renderModeBanner();
    renderUnderChips();
    $("aiMask").classList.add("on"); $("aiPanel").classList.add("on");
  }
  function closeAi() { $("aiMask").classList.remove("on"); $("aiPanel").classList.remove("on"); }
  $("btnAi").addEventListener("click", openAi);
  $("aiClose").addEventListener("click", closeAi);
  $("aiMask").addEventListener("click", closeAi);

  /* 模式提示条：跟随合约 / 自由分析 */
  function renderModeBanner() {
    const right = window.__qm.getRight();
    const b = $("aiModeBanner");
    if (right.length) {
      const unders = [...new Set(right.map(c => c.under))];
      b.className = "ai-mode";
      b.innerHTML = `<span class="m-ic">⛓</span>
        <span><b>跟随模式</b> · 已带入调设区 ${right.length} 张合约的 ${unders.length} 个标的（${unders.join("、")}），生成后可一键回填；也可增删标的或补充自定义标的。</span>`;
    } else {
      b.className = "ai-mode free";
      b.innerHTML = `<span class="m-ic">✎</span>
        <span><b>自由分析模式</b> · 调设区暂无合约。在下方输入任意想分析的标的（如 沪银 / 原油 / 纳斯达克100），即可生成情景参数供参考；之后移入合约可再次回填。</span>`;
    }
  }

  /* 标的 chips：已知标的 + 自定义标的，跟随调设区预选 */
  function renderUnderChips() {
    const rightUnders = new Set(window.__qm.getRight().map(c => c.under));
    const known = window.__qm.getUnders();
    const all = known.concat(customUnders.filter(cu => !known.some(k => k.u === cu.u)));
    $("aiUnders").innerHTML = all.map(({ u, cat }) => {
      const isCustom = customUnders.some(cu => cu.u === u);
      return `<button class="chip ${rightUnders.has(u) ? "on" : ""} ${isCustom ? "custom" : ""}" data-under="${u}" data-cat="${cat}">${u}${isCustom ? `<span class="cx" data-del="${u}" title="移除">✕</span>` : ""}</button>`;
    }).join("");
  }

  $("aiUnders").addEventListener("click", e => {
    const del = e.target.closest("[data-del]");
    if (del) {
      e.stopPropagation();
      const i = customUnders.findIndex(cu => cu.u === del.dataset.del);
      if (i >= 0) customUnders.splice(i, 1);
      renderUnderChips();
      return;
    }
    const b = e.target.closest(".chip"); if (b) b.classList.toggle("on");
  });

  /* 手动添加自定义标的 */
  function addCustomUnder() {
    const name = $("aiCustomUnder").value.trim();
    if (!name) return;
    const cat = $("aiCustomCat").value;
    const exists = window.__qm.getUnders().some(k => k.u === name) || customUnders.some(cu => cu.u === name);
    if (!exists) customUnders.push({ u: name, cat });
    $("aiCustomUnder").value = "";
    renderUnderChips();
    /* 新加的标的默认勾选 */
    const chip = [...document.querySelectorAll("#aiUnders .chip")].find(b => b.dataset.under === name);
    if (chip) chip.classList.add("on");
  }
  $("btnAddUnder").addEventListener("click", addCustomUnder);
  $("aiCustomUnder").addEventListener("keydown", e => { if (e.key === "Enter") addCustomUnder(); });

  /* 快捷示例 & 宏观多选 */
  document.querySelectorAll("[data-demo]").forEach(b =>
    b.addEventListener("click", () => { $("aiReport").value = DEMOS[b.dataset.demo]; }));
  $("aiMacro").addEventListener("click", e => {
    const b = e.target.closest(".chip"); if (b) b.classList.toggle("on");
  });

  let generated = null;

  /* ---------- 生成 ---------- */
  $("aiGen").addEventListener("click", () => {
    const qm = window.__qm;
    const right = qm.getRight();
    const targets = [...document.querySelectorAll("#aiUnders .chip.on")]
      .map(b => ({ under: b.dataset.under, cat: b.dataset.cat }));
    if (!targets.length) { alert("请至少勾选一个目标标的（或手动输入添加），再生成情景参数。"); return; }

    const macros = [...document.querySelectorAll("#aiMacro .chip.on")].map(b => b.dataset.macro);
    const level = $("aiLevel").value, horizon = +$("aiHorizon").value;
    const text = $("aiReport").value;

    /* 分析步骤动画 */
    $("aiStepSec").style.display = "block";
    $("aiResultSec").classList.remove("on");
    $("aiApply").style.display = "none";
    const steps = [...document.querySelectorAll(".ai-step")];
    steps.forEach(s => { s.className = "ai-step"; s.querySelector(".st-ic").textContent = "◌"; });
    $("aiSteps").classList.add("on");
    $("aiGen").disabled = true;

    steps.forEach((s, i) => {
      setTimeout(() => {
        s.classList.add("doing");
        $("aiStepMeta").textContent = `STEP ${i + 1} / ${steps.length}`;
        if (i > 0) { steps[i - 1].classList.replace("doing", "done"); steps[i - 1].querySelector(".st-ic").textContent = "✓"; }
        if (i === steps.length - 1) setTimeout(() => {
          s.classList.replace("doing", "done"); s.querySelector(".st-ic").textContent = "✓";
          $("aiStepMeta").textContent = "DONE";
          renderResult();
        }, 900);
      }, 200 + i * 900);
    });

    function renderResult() {
      const f = LEVEL[level];
      const sent = sentimentOf(text);

      generated = targets.map(t => {
        let spot = sent.dir * rnd(2.5, 5), vol = 2 + sent.vol * 4, basis = sent.basis * rnd(15, 35);
        macros.forEach(m => {
          const mm = MACRO_MAP[m];
          spot += mm[t.cat] * rnd(2, 4.5);
          vol += mm.vol * rnd(1.5, 3.5);
          basis += mm.basis * rnd(8, 20);
        });
        return {
          under: t.under, cat: t.cat,
          n: right.filter(c => c.under === t.under).length,
          spot: +(spot * f).toFixed(1),
          basis: Math.round(basis * f),
          vol: +(vol * f).toFixed(1),
          dtenor: Math.round(horizon * (level === "severe" ? 0.5 : 0.3))
        };
      });

      $("aiResultBody").innerHTML = generated.map(g => `
        <tr>
          <td><b>${g.under}</b> <span style="font-size:10px;color:var(--ink-3);">${g.cat}</span></td>
          <td class="num" style="color:${g.spot >= 0 ? "#dc2626" : "#16a34a"};font-weight:700;">${g.spot > 0 ? "+" : ""}${g.spot}</td>
          <td class="num">${g.basis > 0 ? "+" : ""}${g.basis}</td>
          <td class="num">+${g.vol}</td>
          <td class="num">${g.dtenor}</td>
          <td>${g.n > 0 ? g.n + " 张" : '<span style="color:var(--ink-3);">参考</span>'}</td>
        </tr>`).join("");

      const lvlTxt = { mild: "温和", mid: "中性", severe: "极端" }[level];
      const matched = generated.filter(g => g.n > 0).length;
      $("aiReason").innerHTML =
        `<b>生成依据：</b>` +
        (text.trim() ? `研报观点提取（${sent.hits.length ? "命中关键词：" + [...new Set(sent.hits)].join("、") : "未命中显著方向性词汇，采用中性假设"}）；` : "未输入研报，标的维度采用中性假设；") +
        (macros.length ? `叠加宏观情景【${macros.join("、")}】；` : "未选择宏观情景；") +
        `冲击强度取<b>${lvlTxt}</b>档历史分位，作用期限 ${horizon} 天。` +
        `<br><b>口径说明：</b>目标标的 ${generated.length} 个（其中 ${matched} 个与调设区合约匹配），同一标的使用一组情景参数；` +
        (right.length ? "回填时按挂钩标的匹配调设区内合约。" : "当前为自由分析模式，结果供参考，移入合约后可回填。");

      $("aiResultSec").classList.add("on");
      const ap = $("aiApply");
      if (right.length && matched > 0) {
        ap.style.display = "inline-block"; ap.disabled = false;
        ap.textContent = `应用到调设区（${matched} 个标的匹配）`;
        $("aiResultMeta").textContent = "与调设区合约匹配后可一键回填";
      } else {
        ap.style.display = "none";
        $("aiResultMeta").textContent = "自由分析结果 · 移入合约后可再次生成并回填";
      }
      $("aiGen").disabled = false;
      $("aiResultSec").scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });

  /* 应用到调设区 */
  $("aiApply").addEventListener("click", () => {
    const qm = window.__qm;
    if (!generated) return;
    let hit = 0;
    qm.getRight().forEach(c => {
      const g = generated.find(x => x.under === c.under);
      if (g) {
        qm.setParam(c.id, "spot", g.spot); qm.setParam(c.id, "basis", g.basis);
        qm.setParam(c.id, "vol", g.vol); qm.setParam(c.id, "dtenor", g.dtenor);
        hit++;
      }
    });
    qm.markAiApplied();
    qm.rerender();
    qm.refreshSteps();
    closeAi();
    if (!hit) alert("调设区暂无与生成标的匹配的合约，本次参数仅供查看参考；移入合约后可再次生成并回填。");
  });

  function rnd(a, b) { return a + Math.random() * (b - a); }
})();
