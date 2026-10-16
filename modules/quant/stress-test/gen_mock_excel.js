/* 生成虚拟场外期权交易记录 Excel（交易记录.xlsx） */
const XLSX = require("./xlsx.full.min.js");

const UNDERLYINGS = {
  "中证500": "权益", "中证1000": "权益", "沪深300": "权益",
  "恒生科技": "权益", "上证50": "权益", "创业板指": "权益",
  "沪金": "商品", "沪银": "商品", "螺纹钢": "商品", "沪铜": "商品", "原油": "商品",
  "国债期货": "其他", "鸡蛋": "其他"
};
const STRUCTS = ["雪球", "雪球", "雪球", "凤凰", "DCN", "FCN", "香草", "单鲨", "双鲨", "单障碍敲入"];
const COUNTERPARTIES = ["中金公司", "中信证券", "华泰证券", "国泰君安", "招商证券", "银河期货", "永安期货"];
const TRADERS = ["王磊", "李婷", "张俊", "陈思", "刘洋", "赵敏"];

const BIZ_DATE = new Date("2026-09-09");   // 与界面业务日期对齐
const fmtDate = d => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

const BARRIER_STRUCTS = ["雪球", "凤凰", "单鲨", "双鲨", "单障碍敲入"];

const unders = Object.keys(UNDERLYINGS);
const rows = [];
const usedNames = new Set();

for (let i = 0; i < 46; i++) {
  const under = pick(unders);
  const struct = pick(STRUCTS);
  const yy = pick(["25", "26"]);
  const mm = String(ri(1, 12)).padStart(2, "0");
  const seq = String(ri(1, 9)).padStart(2, "0");
  let name = `${under}${struct}${yy}${mm}-${seq}`;
  while (usedNames.has(name)) name = `${under}${struct}${yy}${mm}-${String(ri(10, 99))}`;
  usedNames.add(name);

  const tenorRemain = ri(20, 720);                    // 剩余期限
  const maturity = addDays(BIZ_DATE, tenorRemain);    // 到期日
  const elapsed = ri(30, 300);
  const start = addDays(maturity, -(tenorRemain + elapsed)); // 起息日

  const isBarrier = BARRIER_STRUCTS.includes(struct);
  const notional = ri(3, 60) * 100;
  /* 台账希腊字母（敏感度口径：万人民币）
     Delta(万/1%)：标的变动 1% 的损益；Gamma(万/(1%)²)：二阶项；Vega(万/vol%)：波动率每 1 个 vol 点的损益 */
  const delta = +(notional * (Math.random() * 1.3 - 0.5) * 0.01).toFixed(2);
  let gr = Math.random() * 2 - 1;
  if (isBarrier) gr -= 0.6;                 // 障碍类结构偏负 Gamma
  const gamma = +(notional * gr * 0.0001).toFixed(2);
  const vega = +(notional * (Math.random() * 0.55 + 0.05) * 0.01).toFixed(2);
  rows.push({
    "交易编号": `OTC${fmtDate(start).replace(/-/g, "")}${String(1000 + i)}`,
    "合约名称": name,
    "产品结构": struct,
    "挂钩标的": under,
    "标的类别": UNDERLYINGS[under],
    "买卖方向": Math.random() < 0.62 ? "买入" : "卖出",
    "名义本金(万)": notional,
    "Delta(万/1%)": delta,
    "Gamma(万/(1%)²)": gamma,
    "Vega(万/vol%)": vega,
    "票息(%)": struct === "香草" ? "" : +(Math.random() * 12 + 4).toFixed(2),
    "敲入价(%)": isBarrier ? ri(65, 80) : "",
    "敲出价(%)": isBarrier ? ri(100, 106) : "",
    "起息日": fmtDate(start),
    "到期日": fmtDate(maturity),
    "剩余期限(天)": tenorRemain,
    "交易对手": pick(COUNTERPARTIES),
    "交易员": pick(TRADERS)
  });
}

/* 按剩余期限排序，更像真实台账 */
rows.sort((a, b) => a["剩余期限(天)"] - b["剩余期限(天)"]);

const ws = XLSX.utils.json_to_sheet(rows);
ws["!cols"] = [
  { wch: 18 }, { wch: 22 }, { wch: 10 }, { wch: 10 }, { wch: 8 },
  { wch: 8 }, { wch: 12 }, { wch: 13 }, { wch: 15 }, { wch: 13 },
  { wch: 8 }, { wch: 9 }, { wch: 9 },
  { wch: 11 }, { wch: 11 }, { wch: 12 }, { wch: 10 }, { wch: 8 }
];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "交易记录");
XLSX.writeFile(wb, "交易记录.xlsx");
console.log(`OK · 交易记录.xlsx · ${rows.length} 条`);
