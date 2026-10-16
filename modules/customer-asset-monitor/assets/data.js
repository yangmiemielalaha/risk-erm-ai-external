/* ============================================================
 * 数据层：内存数据库 + 实时模拟引擎
 * 同一标的·同一客户 风险管理系统（演示样本，脱敏）
 * ============================================================ */
window.DB = (function () {
  'use strict';

  /* ---------- 工具 ---------- */
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function rndi(a, b) { return Math.floor(rnd(a, b + 1)); }
  function pick(arr) { return arr[rndi(0, arr.length - 1)]; }
  function now() { return new Date(); }
  function fmtTime(d) {
    d = d || now();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  function fmtDT(d) {
    d = d || now();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return (d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* ============================================================
   * 1. 品种定义与期限结构
   * ============================================================ */
  var CONTRACTS = ['2610', '2611', '2612', '2701', '2702', '2703', '2704', '2705', '2706', '2707', '2708', '2709'];

  var VARIETIES = {
    cu: { code: 'cu', name: '阴极铜', prefix: 'CU', ukey: 'U-MET-CU', exch: 'SHFE', unit: '吨', price: 74850, marginRate: 0.13, lot: 5,
      main: 3, second: 4, third: 8, near: 0,
      oi:    [3.2, 1.4, 6.8, 16.5, 12.8, 2.4, 1.8, 6.2, 1.2, 0.6, 0.4, 0.3],
      vol:   [4.2, 2.1, 9.6, 24.5, 18.6, 3.5, 2.6, 8.8, 1.6, 0.8, 0.5, 0.4],
      delta: [-8.2, -3.5, 2.4, 3.1, 5.8, -1.2, 0.4, 2.2, -0.6, -0.3, -0.2, 0.1] },
    rb: { code: 'rb', name: '螺纹钢', prefix: 'RB', ukey: 'U-FER-RB', exch: 'SHFE', unit: '吨', price: 3420, marginRate: 0.11, lot: 10,
      main: 3, second: 4, third: 10, near: 0,
      oi:    [8.5, 3.2, 12.4, 42.6, 28.4, 6.8, 3.2, 2.6, 1.8, 1.2, 0.8, 0.6],
      vol:   [9.8, 4.5, 15.2, 58.4, 36.2, 8.4, 4.1, 3.5, 2.4, 1.6, 1.1, 0.9],
      delta: [-12.5, -4.2, 5.1, 8.2, -6.4, -2.1, 1.2, 0.8, -0.5, -0.4, 0.2, 0.1] },
    i:  { code: 'i', name: '铁矿石', prefix: 'I', ukey: 'U-FER-I', exch: 'DCE', unit: '吨', price: 812, marginRate: 0.13, lot: 100,
      main: 2, second: 3, third: 8, near: 0,
      oi:    [6.4, 4.2, 18.6, 12.4, 8.2, 2.6, 1.4, 1.2, 0.8, 0.5, 0.3, 0.2],
      vol:   [8.2, 6.4, 26.8, 18.2, 11.4, 3.6, 2.2, 1.8, 1.1, 0.7, 0.4, 0.3],
      delta: [-5.4, 2.1, 9.2, -4.6, 3.1, -1.2, 0.6, -0.3, 0.2, -0.1, 0.1, 0.0] },
    m:  { code: 'm', name: '豆粕', prefix: 'M', ukey: 'U-AG-M', exch: 'DCE', unit: '吨', price: 3125, marginRate: 0.10, lot: 10,
      main: 3, second: 5, third: 9, near: 0,
      oi:    [5.2, 2.8, 8.4, 22.6, 9.8, 12.4, 3.2, 2.1, 1.6, 4.2, 0.8, 0.6],
      vol:   [6.8, 3.6, 10.2, 28.4, 12.6, 15.8, 4.1, 2.8, 2.1, 5.4, 1.1, 0.8],
      delta: [-3.2, -1.4, 4.6, 6.2, -2.8, 3.4, -1.1, 0.5, -0.3, 1.8, -0.2, 0.1] },
    sc: { code: 'sc', name: '原油', prefix: 'SC', ukey: 'U-EN-SC', exch: 'INE', unit: '桶', price: 528.4, marginRate: 0.15, lot: 1000,
      main: 3, second: 4, third: 8, near: 1,
      oi:    [2.1, 1.8, 3.2, 8.6, 5.4, 1.8, 1.2, 2.4, 0.8, 0.4, 0.3, 0.2],
      vol:   [3.2, 2.6, 4.8, 12.4, 7.8, 2.4, 1.8, 3.2, 1.1, 0.6, 0.4, 0.3],
      delta: [-2.4, 1.1, 2.6, 4.2, -3.1, 1.2, 0.5, 1.4, -0.3, -0.1, 0.0, 0.1] }
  };

  /* ============================================================
   * 2. 标的主数据（统一编码档案）
   * ============================================================ */
  var instruments = [];
  function addInst(o) { o.upd = fmtDT(new Date(now().getTime() - rndi(1, 96) * 3600e3)); instruments.push(o); }

  Object.keys(VARIETIES).forEach(function (k) {
    var v = VARIETIES[k];
    /* 现货品种 */
    addInst({ ukey: v.ukey, name: v.name + '（现货）', asset: '现货', exch: '场外', exCode: 'SPOT-' + v.prefix, inCode: 'INT-' + v.prefix + '-00', rel: v.prefix + ' 全系列', status: 'active' });
    /* 期货合约 */
    CONTRACTS.forEach(function (c, i) {
      var st = 'active';
      if (i === 0) st = 'delisting';
      if (i === 1 && v.code === 'sc') st = 'delisting';
      addInst({ ukey: v.ukey + '-' + c, name: v.name + c, asset: '期货', exch: v.exch, exCode: v.prefix + c, inCode: 'INT-' + v.prefix + '-' + c, rel: v.ukey, status: st });
    });
    /* 期权合约（主力月 + 次主力月） */
    [CONTRACTS[3], CONTRACTS[4]].forEach(function (c) {
      var strike = v.code === 'cu' ? '75000' : (v.code === 'rb' ? '3400' : (v.code === 'i' ? '800' : (v.code === 'm' ? '3100' : '530')));
      addInst({ ukey: v.ukey + '-OP' + c + 'C' + strike, name: v.name + c + 'C' + strike + ' 认购', asset: '期权', exch: v.exch, exCode: v.prefix + c + 'C' + strike, inCode: 'OPT-' + v.prefix + c + 'C' + strike, rel: v.ukey + '-' + c, status: 'active' });
    });
  });

  /* ============================================================
   * 3. 映射关系
   * ============================================================ */
  var mappings = [];
  function addMap(type, src, dst, note) { mappings.push({ id: 'MP' + (1000 + mappings.length), type: type, src: src, dst: dst, note: note, ctime: fmtDT(new Date(now().getTime() - rndi(10, 200) * 24 * 3600e3)) }); }

  /* 跨市场：现货/期货/期权 指向同一标的 */
  Object.keys(VARIETIES).forEach(function (k) {
    var v = VARIETIES[k];
    addMap('cross-market', v.ukey + '（现货）', v.ukey + '-' + CONTRACTS[v.main], v.name + ' 现货与期货主力月同标的');
    addMap('cross-market', v.ukey + '-OP' + CONTRACTS[3] + 'C' + (v.code === 'cu' ? '75000' : '000'), v.ukey + '-' + CONTRACTS[3], '期权挂接期货合约');
    if (v.exch === 'SHFE') addMap('cross-market', v.ukey, 'U-OTC-' + v.prefix + '-SWAP', '场外掉期挂接同一现货标的');
  });
  /* 跨期限 */
  Object.keys(VARIETIES).forEach(function (k) {
    var v = VARIETIES[k];
    for (var i = 0; i < CONTRACTS.length - 1; i++) {
      addMap('cross-term', v.ukey + '-' + CONTRACTS[i], v.ukey + '-' + CONTRACTS[i + 1], '同品种相邻月份');
    }
  });
  /* 基础资产 */
  addMap('underlying', 'U-MET-CU-OP2701C75000', 'U-MET-CU', '期权基础资产'); 
  addMap('underlying', 'U-OTC-CU-SWAP', 'U-MET-CU', '场外掉期基础资产');
  Object.keys(VARIETIES).forEach(function (k) {
    var v = VARIETIES[k];
    addMap('underlying', v.ukey + '-OP' + CONTRACTS[4] + 'C' + (v.code === 'cu' ? '75000' : '000'), v.ukey, '期权 → 基础资产（现货）');
  });

  /* ============================================================
   * 4. 客户与同一客户组
   * ============================================================ */
  var clients = [
    { id: 'C10001', name: '华东铜业集团有限公司', type: '法人', groupId: 'G01', role: '母公司', accounts: 4, equity: 28600, basis: '股权控制（母公司）' },
    { id: 'C10002', name: '华东铜业贸易有限公司', type: '法人', groupId: 'G01', role: '子公司', accounts: 3, equity: 12400, basis: '股权控制（100%控股）' },
    { id: 'C10003', name: '铜泰一号私募证券投资基金', type: '资管产品', groupId: 'G01', role: '产品户', accounts: 2, equity: 8200, basis: '管理人为华东铜业全资子公司' },
    { id: 'C10004', name: '远东控股股份有限公司', type: '法人', groupId: 'G02', role: '母公司', accounts: 5, equity: 35200, basis: '股权控制（母公司）' },
    { id: 'C10005', name: '远东南方贸易有限公司', type: '法人', groupId: 'G02', role: '子公司', accounts: 3, equity: 9800, basis: '股权控制（80%控股）' },
    { id: 'C10006', name: '矿发国际贸易有限公司', type: '法人', groupId: 'G03', role: '母公司', accounts: 4, equity: 21800, basis: '实际控制人同一' },
    { id: 'C10007', name: '矿发（新加坡）私人有限公司', type: '法人', groupId: 'G03', role: '境外子公司', accounts: 2, equity: 6400, basis: '实际控制人同一' },
    { id: 'C10008', name: '钢联产业集团有限公司', type: '法人', groupId: 'G04', role: '母公司', accounts: 6, equity: 42800, basis: '股权控制（母公司）' },
    { id: 'C10009', name: '钢联物流发展有限公司', type: '法人', groupId: 'G04', role: '子公司', accounts: 2, equity: 5600, basis: '股权控制（65%控股）' },
    { id: 'C10010', name: '钢联套保进取1号资管计划', type: '资管产品', groupId: 'G04', role: '产品户', accounts: 2, equity: 15800, basis: '管理人受钢联集团控制' },
    { id: 'C10011', name: '粮油产业基金（有限合伙）', type: '资管产品', groupId: 'G05', role: '产品户', accounts: 2, equity: 12600, basis: 'GP 为同一实际控制人' },
    { id: 'C10012', name: '东海粮油集团有限公司', type: '法人', groupId: 'G05', role: '母公司', accounts: 3, equity: 19400, basis: 'GP 为东海粮油全资子公司' },
    { id: 'C10013', name: '金陵实业发展有限公司', type: '法人', groupId: null, role: '—', accounts: 3, equity: 16800, basis: '—' },
    { id: 'C10014', name: '金陵投资管理有限公司', type: '法人', groupId: null, role: '—', accounts: 2, equity: 7400, basis: '—' },
    { id: 'C10015', name: '张伟', type: '自然人', groupId: null, role: '—', accounts: 2, equity: 2100, basis: '—' },
    { id: 'C10016', name: '张伟明', type: '自然人', groupId: null, role: '—', accounts: 1, equity: 480, basis: '—' },
    { id: 'C10017', name: '中能化国际贸易有限公司', type: '法人', groupId: null, role: '—', accounts: 4, equity: 24600, basis: '—' },
    { id: 'C10018', name: '海通金属（香港）有限公司', type: '法人', groupId: null, role: '—', accounts: 2, equity: 11200, basis: '—' },
    { id: 'C10019', name: '晨曦化工集团有限公司', type: '法人', groupId: null, role: '—', accounts: 5, equity: 20400, basis: '—' },
    { id: 'C10020', name: '晨曦化工进出口公司', type: '法人', groupId: null, role: '—', accounts: 2, equity: 6800, basis: '—' },
    { id: 'C10021', name: '稳盈套利2号私募基金', type: '资管产品', groupId: null, role: '—', accounts: 2, equity: 9200, basis: '—' },
    { id: 'C10022', name: '李建国', type: '自然人', groupId: null, role: '—', accounts: 1, equity: 860, basis: '—' }
  ];
  var groups = { G01: '华东铜业集团', G02: '远东控股', G03: '矿发国际', G04: '钢联产业集团', G05: '东海粮油' };
  var nextGroupId = 6;

  /* 客户业务线敞口（简化：某品种的净头寸方向与规模，万元） */
  var exposures = {};
  clients.forEach(function (c) {
    var rows = [];
    var seeds = [];
    if (c.id === 'C10001') seeds = [['cu', 18500, 1], ['rb', -3200, 2], ['i', 6800, 1]];
    else if (c.id === 'C10002') seeds = [['cu', 12400, 1], ['sc', -2400, 2]];
    else if (c.id === 'C10003') seeds = [['cu', -7800, 2], ['i', -4200, 2]];
    else if (c.id === 'C10004') seeds = [['cu', -22400, 2], ['rb', 15800, 1], ['i', -9600, 2]];
    else if (c.id === 'C10005') seeds = [['rb', 9200, 1], ['i', 4200, 1]];
    else if (c.id === 'C10006') seeds = [['i', 15600, 1], ['cu', 8200, 1]];
    else if (c.id === 'C10007') seeds = [['sc', 5600, 2], ['cu', 3400, 1]];
    else if (c.id === 'C10008') seeds = [['rb', 28600, 1], ['i', -12400, 2]];
    else if (c.id === 'C10009') seeds = [['rb', 4800, 1]];
    else if (c.id === 'C10010') seeds = [['rb', -12800, 2], ['i', -5600, 2]];
    else if (c.id === 'C10011') seeds = [['m', 10800, 1]];
    else if (c.id === 'C10012') seeds = [['m', -9400, 2], ['i', 2400, 1]];
    else if (c.id === 'C10013') seeds = [['cu', 13600, 1], ['rb', -5200, 2]];
    else if (c.id === 'C10014') seeds = [['cu', -6200, 2]];
    else if (c.id === 'C10015') seeds = [['cu', 1800, 1]];
    else if (c.id === 'C10016') seeds = [['m', -420, 2]];
    else if (c.id === 'C10017') seeds = [['sc', 18200, 1], ['cu', 6400, 1]];
    else if (c.id === 'C10018') seeds = [['cu', -9800, 2]];
    else if (c.id === 'C10019') seeds = [['sc', -16400, 2], ['rb', 7200, 1]];
    else if (c.id === 'C10020') seeds = [['sc', 4800, 1]];
    else if (c.id === 'C10021') seeds = [['m', 5200, 2], ['i', 3800, 2]];
    else seeds = [['cu', 640, 1]];
    seeds.forEach(function (s) {
      rows.push({ variety: s[0], net: s[1] * (0.92 + Math.random() * 0.16), biz: s[2] === 1 ? '期货经纪（套保）' : '期货经纪（投机）' });
    });
    /* 场外与仓单业务 */
    if (['C10001', 'C10004', 'C10008', 'C10017', 'C10019'].indexOf(c.id) >= 0) rows.push({ variety: c.id === 'C10017' || c.id === 'C10019' ? 'sc' : 'cu', net: rnd(2000, 8000), biz: '场外衍生品' });
    if (['C10001', 'C10013', 'C10012'].indexOf(c.id) >= 0) rows.push({ variety: c.id === 'C10012' ? 'm' : 'cu', net: rnd(1000, 5000), biz: '仓单串换' });
    exposures[c.id] = rows;
  });

  /* ============================================================
   * 5. 库存（仓单）与基差合同
   * ============================================================ */
  var inventory = [
    { variety: 'cu', wh: '上海中储吴淞库', tons: 48600, owner: 'C10001', type: '标准仓单', status: '有效' },
    { variety: 'cu', wh: '上海期货交割库', tons: 32400, owner: 'C10013', type: '标准仓单', status: '有效' },
    { variety: 'cu', wh: '江苏无锡库', tons: 12800, owner: 'C10002', type: '厂库仓单', status: '有效' },
    { variety: 'rb', wh: '上海宝钢仓储', tons: 68000, owner: 'C10008', type: '厂库仓单', status: '有效' },
    { variety: 'rb', wh: '杭州湾仓储', tons: 24000, owner: 'C10004', type: '标准仓单', status: '有效' },
    { variety: 'i', wh: '青岛港仓储', tons: 96200, owner: 'C10006', type: '港口仓单', status: '有效' },
    { variety: 'm', wh: '大连北良仓储', tons: 54600, owner: 'C10012', type: '标准仓单', status: '有效' },
    { variety: 'sc', wh: '洋山港保税库', tons: 3200000, owner: 'C10017', type: '保税仓单', status: '有效' }
  ];
  var contracts = [
    { no: 'BAS-2026-0118', variety: 'cu', a: 'C10001', b: 'C10003', tons: 8000, basis: '-180', settle: '2027-01', status: '履约中' },
    { no: 'BAS-2026-0096', variety: 'cu', a: 'C10013', b: 'C10005', tons: 5000, basis: '-120', settle: '2026-12', status: '履约中' },
    { no: 'BAS-2026-0041', variety: 'rb', a: 'C10008', b: 'C10009', tons: 30000, basis: '60', settle: '2027-01', status: '履约中' },
    { no: 'BAS-2026-0073', variety: 'i', a: 'C10006', b: 'C10021', tons: 150000, basis: '25', settle: '2026-12', status: '部分履约' },
    { no: 'BAS-2026-0132', variety: 'm', a: 'C10012', b: 'C10011', tons: 20000, basis: '-40', settle: '2027-05', status: '履约中' },
    { no: 'BAS-2026-0150', variety: 'sc', a: 'C10017', b: 'C10020', tons: 1000000, basis: '-8', settle: '2027-01', status: '履约中' }
  ];

  /* ============================================================
   * 6. 关联关系（图谱边）
   * ============================================================ */
  var relations = [
    { src: 'C10001', dst: 'C10002', type: '股权', note: '100% 控股', pct: 100 },
    { src: 'C10001', dst: 'C10003', type: '控制', note: '管理人为全资子公司管理', pct: null },
    { src: 'C10004', dst: 'C10005', type: '股权', note: '80% 控股', pct: 80 },
    { src: 'C10006', dst: 'C10007', type: '控制', note: '同一实际控制人', pct: null },
    { src: 'C10008', dst: 'C10009', type: '股权', note: '65% 控股', pct: 65 },
    { src: 'C10008', dst: 'C10010', type: '控制', note: '管理人受集团控制', pct: null },
    { src: 'C10012', dst: 'C10011', type: '控制', note: 'GP 为全资子公司', pct: null },
    { src: 'C10013', dst: 'C10014', type: '控制', note: '同一法定代表人（待核实）', pct: null },
    { src: 'C10015', dst: 'C10016', type: '一致行动人', note: '身份证号高度相似（待人工核实）', pct: null },
    { src: 'C10019', dst: 'C10020', type: '股权', note: '90% 控股（待归组）', pct: 90 }
  ];

  /* ============================================================
   * 7. 阈值与预警
   * ============================================================ */
  var threshold = { usageHigh: 80, usageWarn: 70, concHigh: 25, concWarn: 15 };
  var alerts = [];
  var alertSeq = 1;
  function pushAlert(lvl, type, obj, metric, val, th, groupId) {
    alerts.unshift({ id: 'AL' + String(10000 + alertSeq++), time: fmtTime(), ts: Date.now(), lvl: lvl, type: type, obj: obj, metric: metric, val: val, th: th, status: '未处理', groupId: groupId || null, detail: '' });
    if (alerts.length > 60) alerts.pop();
    return alerts[0];
  }
  /* 种子预警 */
  pushAlert('高', '保证金占用', 'G01 华东铜业集团', '组保证金占用率', 86.4, 80, 'G01');
  pushAlert('中', '品种集中度', 'G04 钢联产业集团', 'RB 品种集中度', 19.2, 15, 'G04');
  pushAlert('中', '合约集中度', 'C10017 中能化国际贸易', 'SC2701 单合约集中度', 18.6, 15, null);
  pushAlert('低', '关联异常', 'C10015 / C10016', '证件号相似度', 92, 85, null);

  /* ============================================================
   * 8. 数据接口
   * ============================================================ */
  var feeds = [
    { name: 'CTP 交易网关', use: '成交 / 持仓 / 保证金', proto: 'TCP 行情+交易', freq: '实时（500ms）', status: 'online', delay: 8, msgs: 1284620 },
    { name: '上期所行情（SHFE）', use: 'CU / RB 行情与合约参数', proto: '二进制行情协议', freq: '实时（250ms）', status: 'online', delay: 5, msgs: 3842610 },
    { name: '大商所行情（DCE）', use: 'I / M 行情与合约参数', proto: '二进制行情协议', freq: '实时（250ms）', status: 'online', delay: 6, msgs: 3518420 },
    { name: '能源中心行情（INE）', use: 'SC 行情与合约参数', proto: '二进制行情协议', freq: '实时（250ms）', status: 'warn', delay: 240, msgs: 842160 },
    { name: '仓单系统对接', use: '标准仓单 / 库存数据', proto: 'REST API', freq: '每 5 分钟', status: 'online', delay: 180, msgs: 4218 },
    { name: '客户主数据（CRM）', use: '客户身份 / 受益所有人 / 关联关系', proto: 'REST API', freq: '每日 2 次', status: 'online', delay: 320, msgs: 186 },
    { name: '场外衍生品台账', use: 'OTC 名义本金 / Greeks', proto: '文件同步 SFTP', freq: '每小时', status: 'offline', delay: null, msgs: 0 }
  ];

  /* ============================================================
   * 9. 操作日志
   * ============================================================ */
  var logs = [];
  var logSeq = 1;
  function pushLog(module, action, obj, detail, user) {
    logs.unshift({ id: 'LG' + String(10000 + logSeq++), time: fmtDT(), module: module, action: action, obj: obj, detail: detail || '', user: user || '风控管理员' });
    if (logs.length > 200) logs.pop();
  }
  pushLog('客户识别', '归组调整', 'G04 钢联产业集团', '新增产品户 C10010 纳入同一客户组', '王风控');
  pushLog('预警中心', '预警处置', 'AL10002', '追加保证金 2000 万元，占用率降至 71%', '李风控');
  pushLog('标的档案', '映射维护', 'U-MET-CU', '新增场外掉期 U-OTC-CU-SWAP 挂接', '风控管理员');
  pushLog('风险聚合', '阈值设置', '全系统', '品种集中度预警阈值 18% → 15%', '风控管理员');
  pushLog('数据接口', '接口重连', '场外衍生品台账', '连接失败（SFTP 530），已通知科技运维', '风控管理员');

  /* ============================================================
   * 10. 聚合计算
   * ============================================================ */
  function groupOf(clientId) { var c = clients.filter(function (x) { return x.id === clientId; })[0]; return c ? c.groupId : null; }
  function clientMargin(c) {
    var m = 0;
    (exposures[c.id] || []).forEach(function (e) { m += Math.abs(e.net) * VARIETIES[e.variety].marginRate; });
    return m;
  }
  function groupAgg() {
    var map = {};
    clients.forEach(function (c) {
      var g = c.groupId || ('SOLO-' + c.id);
      if (!map[g]) map[g] = { groupId: c.groupId, label: c.groupId ? groups[c.groupId] : c.name, members: [], equity: 0, margin: 0, exposure: 0, byVar: {} };
      var M = clientMargin(c);
      c.margin = M;
      map[g].members.push(c.id);
      map[g].equity += c.equity;
      map[g].margin += M;
      (exposures[c.id] || []).forEach(function (e) {
        map[g].exposure += Math.abs(e.net);
        map[g].byVar[e.variety] = (map[g].byVar[e.variety] || 0) + Math.abs(e.net);
      });
    });
    var arr = Object.keys(map).map(function (k) {
      var g = map[k];
      g.usage = g.equity > 0 ? g.margin / g.equity * 100 : 0;
      var maxVar = null, maxConc = 0;
      Object.keys(g.byVar).forEach(function (v) {
        var conc = g.exposure > 0 ? g.byVar[v] / g.exposure * 100 : 0;
        if (conc > maxConc) { maxConc = conc; maxVar = v; }
      });
      g.maxVar = maxVar; g.maxConc = maxConc;
      g.risk = g.usage >= threshold.usageHigh || g.maxConc >= threshold.concHigh ? '高' : (g.usage >= threshold.usageWarn || g.maxConc >= threshold.concWarn ? '中' : '低');
      g.nameList = g.members.map(function (id) { return clients.filter(function (x) { return x.id === id; })[0].name; });
      return g;
    });
    return arr;
  }

  /* ============================================================
   * 11. 实时模拟引擎（随机游走）
   * ============================================================ */
  var live = true;
  var tickCount = 0;
  var listeners = [];
  function onTick(fn) { listeners.push(fn); }

  function tick() {
    if (!live) return;
    tickCount++;
    /* 价格随机游走 */
    Object.keys(VARIETIES).forEach(function (k) {
      var v = VARIETIES[k];
      v.price = +(v.price * (1 + rnd(-0.006, 0.006))).toFixed(v.price > 1000 ? 1 : 2);
      /* 持仓/成交微调 */
      for (var i = 0; i < CONTRACTS.length; i++) {
        var d = rnd(-0.3, 0.3);
        v.oi[i] = Math.max(0.1, +(v.oi[i] + d).toFixed(1));
        v.vol[i] = Math.max(0.1, +(v.vol[i] * rnd(0.9, 1.12)).toFixed(1));
      }
      /* 客户敞口随价格波动 */
      clients.forEach(function (c) {
        (exposures[c.id] || []).forEach(function (e) {
          if (e.variety === k) e.net = e.net * (1 + rnd(-0.008, 0.008));
        });
      });
    });
    /* 接口延迟跳动 */
    feeds.forEach(function (f) { if (f.status === 'online' || f.status === 'warn') f.delay = Math.max(2, Math.round(f.delay * rnd(0.7, 1.4))); f.msgs += f.status === 'online' ? rndi(50, 400) : 0; });

    /* 偶发预警（约每 3 tick 一次） */
    if (Math.random() < 0.34) {
      var gs = groupAgg().filter(function (g) { return g.groupId; });
      var g = pick(gs);
      if (g.usage >= threshold.usageWarn && Math.random() < 0.6) {
        var a = pushAlert(g.usage >= threshold.usageHigh ? '高' : '中', '保证金占用', g.label, '组保证金占用率', +g.usage.toFixed(1), g.usage >= threshold.usageHigh ? threshold.usageHigh : threshold.usageWarn, g.groupId);
        fire('alert', a);
      } else if (Math.random() < 0.5) {
        var g2 = pick(gs);
        var a2 = pushAlert('中', '品种集中度', g2.label, (VARIETIES[g2.maxVar] ? VARIETIES[g2.maxVar].name : '') + ' 品种集中度', +g2.maxConc.toFixed(1), g2.maxConc >= threshold.concHigh ? threshold.concHigh : threshold.concWarn, g2.groupId);
        fire('alert', a2);
      }
    }
    fire('tick', null);
  }
  function fire(type, data) { listeners.forEach(function (fn) { try { fn(type, data); } catch (e) {} }); }

  /* ============================================================
   * 12. 写操作（真实变更数据库）
   * ============================================================ */
  function addInstrument(o) { o.upd = fmtDT(); instruments.unshift(o); return o; }
  function updateInstrument(ukey, patch) { var t = instruments.filter(function (x) { return x.ukey === ukey; })[0]; if (t) Object.assign(t, patch, { upd: fmtDT() }); return t; }
  function addMapping(type, src, dst, note) { var m = { id: 'MP' + (1000 + mappings.length), type: type, src: src, dst: dst, note: note, ctime: fmtDT() }; mappings.unshift(m); return m; }
  function mergeClients(ids, basis) {
    var gid = 'G' + String(nextGroupId++).padStart(2, '0');
    var first = clients.filter(function (c) { return ids[0] === c.id; })[0];
    groups[gid] = first.name.replace(/(有限公司|股份有限公司|集团|发展|管理|国际|贸易)$/g, '') + '（同一客户）';
    clients.forEach(function (c) {
      if (ids.indexOf(c.id) >= 0) { c.groupId = gid; c.role = c.id === ids[0] ? '主客户' : '关联成员'; c.basis = basis; }
    });
    pushLog('客户识别', '客户归一', groups[gid], '合并 ' + ids.join('、') + ' 为同一客户（依据：' + basis + '）');
    return gid;
  }
  function ungroup(clientId) {
    var c = clients.filter(function (x) { return x.id === clientId; })[0];
    if (!c || !c.groupId) return;
    var gid = c.groupId, gname = groups[gid] || gid;
    c.groupId = null; c.role = '—'; c.basis = '—';
    pushLog('客户识别', '移出归组', c.name, '从 ' + gname + ' 移出');
  }
  function addRelation(src, dst, type, note) {
    relations.push({ src: src, dst: dst, type: type, note: note, pct: null });
    pushLog('关联图谱', '添加关系', clients.filter(function(c){return c.id===src;})[0].name + ' → ' + clients.filter(function(c){return c.id===dst;})[0].name, '类型：' + type + '（' + note + '）');
  }
  function disposeAlert(id, action, note) {
    var a = alerts.filter(function (x) { return x.id === id; })[0];
    if (a) { a.status = '已处置'; a.detail = action + (note ? '：' + note : ''); pushLog('预警中心', '预警处置', id, a.type + ' / ' + a.obj + ' → ' + action + (note ? '：' + note : '')); }
  }
  function setThreshold(patch) { Object.assign(threshold, patch); pushLog('风险聚合', '阈值设置', '全系统', JSON.stringify(patch)); }

  /* ---------- 导出 ---------- */
  return {
    CONTRACTS: CONTRACTS, VARIETIES: VARIETIES, varietyOrder: ['cu', 'rb', 'i', 'm', 'sc'],
    instruments: instruments, mappings: mappings,
    clients: clients, groups: groups, exposures: exposures,
    inventory: inventory, contracts: contracts, relations: relations,
    threshold: threshold, alerts: alerts, feeds: feeds, logs: logs,
    groupAgg: groupAgg, clientMargin: clientMargin,
    addInstrument: addInstrument, updateInstrument: updateInstrument, addMapping: addMapping,
    mergeClients: mergeClients, ungroup: ungroup, addRelation: addRelation,
    disposeAlert: disposeAlert, setThreshold: setThreshold, pushLog: pushLog, pushAlert: pushAlert,
    tick: tick, onTick: onTick, get live() { return live; }, set live(v) { live = v; },
    get tickCount() { return tickCount; },
    fmtTime: fmtTime, fmtDT: fmtDT
  };
})();
