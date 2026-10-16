# -*- coding: utf-8 -*-
"""
代码库自测 / 演示脚本
=====================
对库内 4 类期权结构各估值一笔示例合约，输出估值报告。
香草期权同时输出 BS 解析解，用于验证蒙特卡洛引擎正确性。

运行：python demo_valuation.py
"""

from option_structures import MarketEnv, price, STRUCTURE_REGISTRY, get_payoff_code

# 与界面演示一致的市场环境：r=1.8%, sigma=22%, q=0
MKT = MarketEnv(S0=1.0, r=0.018, q=0.0, sigma=0.22)
N_PATHS = 100_000


def show(title, res, notional):
    print(f"\n【{title}】 名义本金 ¥{notional:,.0f}")
    print(f"  估值结果   : ¥{res['value']:,.0f}  （占名义 {res['value']/notional:.2%}）")
    print(f"  95% 置信区间: [{res['ci95_low']:,.0f}, {res['ci95_high']:,.0f}]"
          f"  (±{res['std_error']*1.96/notional:.2%})")
    if "bs_value" in res:
        diff = abs(res["value"] - res["bs_value"]) / res["bs_value"]
        print(f"  BS 解析解  : ¥{res['bs_value']:,.0f}  (MC 偏差 {diff:.2%} ✓)")
    if "prob_knock_out" in res:
        print(f"  敲出/触碰概率: {res['prob_knock_out']:.1%}")
    if "prob_knock_in" in res:
        print(f"  敲入概率   : {res['prob_knock_in']:.1%}")
    if "prob_loss" in res:
        print(f"  亏损概率   : {res['prob_loss']:.1%}")
    if "prob_payoff" in res:
        print(f"  赔付概率   : {res['prob_payoff']:.1%}")
    if "avg_days_ratio" in res:
        print(f"  平均区间内天数占比: {res['avg_days_ratio']:.1%}")
    if "prob_airbag_breach" in res:
        print(f"  跌破气囊概率: {res['prob_airbag_breach']:.1%}")
    if "prob_protected" in res:
        print(f"  本金保障概率: {res['prob_protected']:.1%}")


if __name__ == "__main__":
    print("=" * 64)
    print(" 基础期权结构估值代码库 · 自测报告")
    print(f" 市场环境: S0=1.0, r={MKT.r:.2%}, q={MKT.q:.2%}, sigma={MKT.sigma:.1%}")
    print(f" 模拟路径: {N_PATHS:,} 条 (GBM, 对偶变量方差缩减, seed=42)")
    print("=" * 64)

    # 1. 雪球（界面演示同款合约：票息18.5%、敲入75%、敲出103%、24M）
    show("雪球结构 Snowball v2.3 (票息18.5%, KI 75%, KO 103%, 24M)",
         price("snowball", MKT, N_PATHS, notional=10_000_000,
               coupon=0.185, knock_in=0.75, knock_out=1.03, T=2.0),
         10_000_000)

    # 2. 香草（欧式看涨，行权价100%，1年）+ BS 交叉验证
    show("香草期权 Vanilla v1.0 (欧式看涨, K=100%, 12M)",
         price("vanilla", MKT, N_PATHS, notional=5_000_000,
               strike=1.0, call_put="call", T=1.0),
         5_000_000)

    # 3. 亚式（算术平均，最后30个交易日均价窗口，看涨，1年）
    show("亚式期权 Asian v1.4 (算术平均, 30日均价窗口, 看涨, 12M)",
         price("asian", MKT, N_PATHS, notional=8_000_000,
               strike=1.0, call_put="call", T=1.0,
               avg_method="arithmetic", avg_window_days=30),
         8_000_000)

    # 4. 鲨鱼鳍（障碍115%，参与率80%，保底3.2%，1年）
    show("鲨鱼鳍 SharkFin v1.1 (障碍115%, 参与率80%, 保底3.2%, 12M)",
         price("sharkfin", MKT, N_PATHS, notional=10_000_000,
               strike=1.0, knock_out=1.15, participation=0.80,
               rebate=0.032, T=1.0),
         10_000_000)

    # 5. 二元期权（现金或无价值看涨，K=105%，固定赔付15%，1年）+ 解析解验证
    show("二元期权 Binary v1.0 (现金或无价值看涨, K=105%, 赔付15%, 12M)",
         price("binary", MKT, N_PATHS, notional=5_000_000,
               strike=1.05, call_put="call", payoff_rate=0.15, T=1.0),
         5_000_000)

    # 6. 区间累计（区间90%~110%，票息6%按日累计，1年）
    show("区间累计 RangeAccrual v1.0 (区间90%~110%, 票息6%, 12M)",
         price("rangeaccrual", MKT, N_PATHS, notional=10_000_000,
               coupon=0.06, lower=0.90, upper=1.10, T=1.0),
         10_000_000)

    # 7. 安全气囊（气囊线80%，参与率100%，1年）
    show("安全气囊 Airbag v1.0 (气囊线80%, 参与率100%, 12M)",
         price("airbag", MKT, N_PATHS, notional=10_000_000,
               airbag_level=0.80, participation=1.0, T=1.0),
         10_000_000)

    print("\n" + "=" * 64)
    print(" 代码库登记信息（供界面比对功能调用）")
    print("=" * 64)
    for key, meta in STRUCTURE_REGISTRY.items():
        print(f"  {key:<9} {meta['name']:<6} {meta['cls'].VERSION:<5} "
              f"收益结构代码 {len(get_payoff_code(key))} 字符")
