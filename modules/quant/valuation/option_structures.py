# -*- coding: utf-8 -*-
"""
基础期权结构估值代码库 (Option Structure Pricing Library)
=========================================================
衍智 OptionMind · 期权蒙特卡洛智能估值平台 —— 结构代码库模块

当前收录结构（与界面左侧代码库一一对应）：
    snowball      雪球结构 (Snowball / Autocallable)  v2.3
    vanilla       香草期权 (Vanilla Option)           v1.0
    asian         亚式期权 (Asian Option)             v1.4
    sharkfin      鲨鱼鳍结构 (Shark Fin)              v1.1
    binary        二元期权 (Binary / Digital Option)  v1.0
    rangeaccrual  区间累计 (Range Accrual)            v1.0
    airbag        安全气囊 (Airbag)                   v1.0

设计约定：
    1. 每个结构类都带 PAYOFF_CODE 属性 —— 即"收益结构代码"，
       界面比对功能展示/ diff 的就是这段代码；
    2. 所有结构统一走 MonteCarloEngine（GBM 路径模拟，支持对偶变量方差缩减）；
    3. price_mc() 返回统一字典：估值、标准误、95% 置信区间、结构特征统计；
    4. 香草期权额外提供 BS 解析解，用于交叉验证蒙特卡洛引擎正确性。
"""

import numpy as np
from dataclasses import dataclass
from math import log, sqrt, exp, erf

TRADING_DAYS = 252


# =====================================================================
# 蒙特卡洛引擎：几何布朗运动 (GBM) 路径模拟
# =====================================================================
@dataclass
class MarketEnv:
    """市场环境参数"""
    S0: float = 1.0        # 期初标的价格（归一化为 1，合约参数用 %期初价 表示）
    r: float = 0.018       # 无风险利率（年化，连续复利）
    q: float = 0.0         # 股息率（年化）
    sigma: float = 0.22    # 波动率（年化）


class MonteCarloEngine:
    """GBM 路径模拟引擎，支持对偶变量方差缩减、随机种子复现"""

    def __init__(self, market: MarketEnv):
        self.mkt = market

    def simulate(self, T: float, n_paths: int = 100_000,
                 n_steps: int | None = None, seed: int | None = 42,
                 antithetic: bool = True):
        """
        返回 (paths, times)
            paths: shape (n_paths, n_steps+1)，每行一条价格路径
            times: shape (n_steps+1,)，对应时间点（年）
        """
        m = self.mkt
        if n_steps is None:
            n_steps = max(1, round(T * TRADING_DAYS))
        rng = np.random.default_rng(seed)

        n_sim = n_paths // 2 if antithetic else n_paths
        z = rng.standard_normal((n_sim, n_steps))
        if antithetic:
            z = np.vstack([z, -z])

        dt = T / n_steps
        drift = (m.r - m.q - 0.5 * m.sigma ** 2) * dt
        diffusion = m.sigma * sqrt(dt) * z
        log_ret = np.hstack([np.zeros((z.shape[0], 1)),
                             np.cumsum(drift + diffusion, axis=1)])
        paths = m.S0 * np.exp(log_ret)
        times = np.linspace(0, T, n_steps + 1)
        return paths, times


def _stats(payoff_discounted: np.ndarray) -> dict:
    """估值统计：均值、标准误、95% 置信区间"""
    n = len(payoff_discounted)
    mean = float(np.mean(payoff_discounted))
    se = float(np.std(payoff_discounted, ddof=1) / sqrt(n))
    return {"value": mean, "std_error": se,
            "ci95_low": mean - 1.96 * se, "ci95_high": mean + 1.96 * se}


# =====================================================================
# 结构一：雪球结构 (Snowball / Autocallable)  v2.3
# =====================================================================
@dataclass
class SnowballOption:
    """
    看涨雪球：每月观察敲出、每日观察敲入。
        敲出        → 提前终止，获得 名义本金 × (1 + 票息 × 已存续月数/12)
        未敲出+敲入且到期低于敲入线 → 承担标的亏损：名义本金 × S(T)/S0
        其他        → 获得全部票息：名义本金 × (1 + 票息 × 总月数/12)
    """
    notional: float = 10_000_000   # 名义本金
    coupon: float = 0.185          # 票息（年化）
    knock_out: float = 1.03        # 敲出障碍（%期初价）
    knock_in: float = 0.75         # 敲入障碍（%期初价）
    T: float = 2.0                 # 期限（年）
    ko_observe_per_year: int = 12  # 敲出观察频率（每月）

    VERSION = "v2.3"
    PAYOFF_CODE = '''def payoff(paths, params):
    """雪球结构收益结构（Autocallable）"""
    for t in observe_dates:                      # 每月观察敲出
        if S[t] >= params.knock_out * S0:
            return notional * (1 + params.coupon * t / 12)
    if knocked_in and S[T] < params.knock_in * S0:   # 每日观察敲入
        return notional * S[T] / S0
    return notional * (1 + params.coupon * T / 12)'''

    def price_mc(self, engine: MonteCarloEngine, n_paths=100_000, seed=42) -> dict:
        S0 = engine.mkt.S0
        r = engine.mkt.r
        paths, times = engine.simulate(self.T, n_paths, seed=seed)
        n_steps = paths.shape[1] - 1

        # ---- 敲出观察日（每月）----
        n_obs = int(round(self.T * self.ko_observe_per_year))
        obs_idx = np.array([round(k * n_steps / n_obs) for k in range(1, n_obs + 1)])
        obs_t = times[obs_idx]                                  # 年
        s_obs = paths[:, obs_idx]                               # (n, n_obs)
        ko_mat = s_obs >= self.knock_out * S0
        any_ko = ko_mat.any(axis=1)
        first_ko = ko_mat.argmax(axis=1)                        # 仅 any_ko 时有效
        t_ko = obs_t[first_ko]

        # ---- 敲入（每日收盘价观察）----
        ki_hit = paths.min(axis=1) < self.knock_in * S0
        s_T = paths[:, -1]

        # ---- 收益结构 ----
        months_total = self.T * 12
        pay = np.empty(paths.shape[0])
        disc_t = np.full(paths.shape[0], self.T)

        pay[any_ko] = self.notional * (1 + self.coupon * (t_ko[any_ko] * 12) / 12)
        disc_t[any_ko] = t_ko[any_ko]

        no_ko = ~any_ko
        loss = no_ko & ki_hit & (s_T < self.knock_in * S0)
        pay[loss] = self.notional * s_T[loss] / S0

        rest = no_ko & ~loss
        pay[rest] = self.notional * (1 + self.coupon * months_total / 12)

        res = _stats(pay * np.exp(-r * disc_t))
        res.update({
            "structure": "snowball", "version": self.VERSION,
            "prob_knock_out": float(any_ko.mean()),
            "prob_knock_in": float(ki_hit.mean()),
            "prob_loss": float(loss.mean()),
        })
        return res


# =====================================================================
# 结构二：香草期权 (Vanilla Option)  v1.0
# =====================================================================
@dataclass
class VanillaOption:
    """欧式香草期权：Call: max(S_T - K, 0) / Put: max(K - S_T, 0)"""
    notional: float = 5_000_000
    strike: float = 1.0            # 行权价（%期初价）
    call_put: str = "call"         # "call" / "put"
    T: float = 1.0

    VERSION = "v1.0"
    PAYOFF_CODE = '''def payoff(paths, params):
    """香草期权收益结构"""
    if params.call_put == "call":
        return max(S[T] - params.K, 0)
    return max(params.K - S[T], 0)'''

    def _units(self, engine: MonteCarloEngine) -> float:
        # 名义本金换算为标的单位数
        return self.notional / engine.mkt.S0

    def price_mc(self, engine: MonteCarloEngine, n_paths=100_000, seed=42) -> dict:
        m = engine.mkt
        K = self.strike * m.S0
        paths, _ = engine.simulate(self.T, n_paths, seed=seed)
        s_T = paths[:, -1]
        if self.call_put == "call":
            pay = np.maximum(s_T - K, 0.0)
        else:
            pay = np.maximum(K - s_T, 0.0)
        res = _stats(pay * exp(-m.r * self.T) * self._units(engine))
        res.update({"structure": "vanilla", "version": self.VERSION,
                    "bs_value": self.price_bs(engine)})
        return res

    def price_bs(self, engine: MonteCarloEngine) -> float:
        """Black-Scholes 解析解（用于交叉验证蒙特卡洛引擎）"""
        m = engine.mkt
        K = self.strike * m.S0
        d1 = (log(m.S0 / K) + (m.r - m.q + 0.5 * m.sigma ** 2) * self.T) \
             / (m.sigma * sqrt(self.T))
        d2 = d1 - m.sigma * sqrt(self.T)
        n_cdf = lambda x: 0.5 * (1 + erf(x / sqrt(2)))
        if self.call_put == "call":
            v = m.S0 * exp(-m.q * self.T) * n_cdf(d1) - K * exp(-m.r * self.T) * n_cdf(d2)
        else:
            v = K * exp(-m.r * self.T) * n_cdf(-d2) - m.S0 * exp(-m.q * self.T) * n_cdf(-d1)
        return v * self._units(engine)


# =====================================================================
# 结构三：亚式期权 (Asian Option)  v1.4
# =====================================================================
@dataclass
class AsianOption:
    """亚式期权：以均价结算。Call: max(Avg(S) - K, 0)"""
    notional: float = 8_000_000
    strike: float = 1.0
    call_put: str = "call"
    T: float = 1.0
    avg_method: str = "arithmetic"   # "arithmetic" 算术平均 / "geometric" 几何平均
    avg_window_days: int | None = None  # 均价观察窗口（交易日），None = 全期平均

    VERSION = "v1.4"
    PAYOFF_CODE = '''def payoff(paths, params):
    """亚式期权收益结构（均价结算）"""
    avg = mean(S[window])            # 算术 / 几何平均
    if params.call_put == "call":
        return max(avg - params.K, 0)
    return max(params.K - avg, 0)'''

    def price_mc(self, engine: MonteCarloEngine, n_paths=100_000, seed=42) -> dict:
        m = engine.mkt
        K = self.strike * m.S0
        paths, _ = engine.simulate(self.T, n_paths, seed=seed)
        window = paths if self.avg_window_days is None \
            else paths[:, -self.avg_window_days:]
        if self.avg_method == "arithmetic":
            avg = window.mean(axis=1)
        else:
            avg = np.exp(np.log(window).mean(axis=1))
        if self.call_put == "call":
            pay = np.maximum(avg - K, 0.0)
        else:
            pay = np.maximum(K - avg, 0.0)
        res = _stats(pay * exp(-m.r * self.T) * (self.notional / m.S0))
        res.update({"structure": "asian", "version": self.VERSION,
                    "avg_method": self.avg_method})
        return res


# =====================================================================
# 结构四：鲨鱼鳍结构 (Shark Fin)  v1.1
# =====================================================================
@dataclass
class SharkFinOption:
    """
    看涨鲨鱼鳍：每日观察触碰障碍。
        存续期内任一交易日收盘价 ≥ 障碍 → 触碰失效，仅获保底收益
        未触碰 → 保底收益 + 参与率 × max(S_T/S0 - 执行价, 0)
    """
    notional: float = 10_000_000
    strike: float = 1.0            # 执行价（%期初价）
    knock_out: float = 1.15        # 触碰障碍（%期初价）
    participation: float = 0.80    # 参与率
    rebate: float = 0.032          # 保底收益（年化）
    T: float = 1.0

    VERSION = "v1.1"
    PAYOFF_CODE = '''def payoff(paths, params):
    """鲨鱼鳍结构收益结构"""
    if max(S[:]) >= params.knock_out * S0:      # 触碰障碍
        return notional * params.rebate          # 仅获保底收益
    gain = params.participation * max(S[T]/S0 - params.K, 0)
    return notional * (params.rebate + gain)'''

    def price_mc(self, engine: MonteCarloEngine, n_paths=100_000, seed=42) -> dict:
        m = engine.mkt
        paths, _ = engine.simulate(self.T, n_paths, seed=seed)
        touched = paths.max(axis=1) >= self.knock_out * m.S0
        s_T_ratio = paths[:, -1] / m.S0
        rebate_total = self.rebate * self.T
        gain = self.participation * np.maximum(s_T_ratio - self.strike, 0.0)
        pay = self.notional * np.where(touched, rebate_total, rebate_total + gain)
        res = _stats(pay * exp(-m.r * self.T))
        res.update({"structure": "sharkfin", "version": self.VERSION,
                    "prob_knock_out": float(touched.mean())})
        return res


# =====================================================================
# 结构五：二元期权 (Binary / Digital Option)  v1.0
# =====================================================================
@dataclass
class BinaryOption:
    """
    现金结算二元期权（Cash-or-Nothing）：
        到期满足行权条件 → 支付固定金额 Q
        否则 → 支付 0
    附 BS 框架下解析解（现金或无价值数字期权）用于交叉验证。
    """
    notional: float = 5_000_000
    strike: float = 1.05           # 行权条件（%期初价）
    call_put: str = "call"         # call: S_T >= K 时赔付 / put: S_T <= K
    payoff_rate: float = 0.15      # 固定赔付金额 = 名义本金 × payoff_rate
    T: float = 1.0

    VERSION = "v1.0"
    PAYOFF_CODE = '''def payoff(paths, params):
    """二元期权收益结构（现金或无价值）"""
    if params.call_put == "call":
        return params.Q if S[T] >= params.K else 0
    return params.Q if S[T] <= params.K else 0'''

    def price_mc(self, engine: MonteCarloEngine, n_paths=100_000, seed=42) -> dict:
        m = engine.mkt
        K = self.strike * m.S0
        Q = self.notional * self.payoff_rate
        paths, _ = engine.simulate(self.T, n_paths, seed=seed)
        s_T = paths[:, -1]
        hit = (s_T >= K) if self.call_put == "call" else (s_T <= K)
        pay = np.where(hit, Q, 0.0)
        res = _stats(pay * exp(-m.r * self.T))
        res.update({"structure": "binary", "version": self.VERSION,
                    "prob_payoff": float(hit.mean()),
                    "bs_value": self.price_bs(engine)})
        return res

    def price_bs(self, engine: MonteCarloEngine) -> float:
        """解析解：Q × e^(-rT) × N(±d2)"""
        m = engine.mkt
        K = self.strike * m.S0
        d2 = (log(m.S0 / K) + (m.r - m.q - 0.5 * m.sigma ** 2) * self.T) \
             / (m.sigma * sqrt(self.T))
        n_cdf = lambda x: 0.5 * (1 + erf(x / sqrt(2)))
        p = n_cdf(d2) if self.call_put == "call" else n_cdf(-d2)
        return self.notional * self.payoff_rate * exp(-m.r * self.T) * p


# =====================================================================
# 结构六：区间累计 (Range Accrual)  v1.0
# =====================================================================
@dataclass
class RangeAccrualOption:
    """
    区间累计结构：每日观察，标的收盘价落在 [下限, 上限] 区间内即累计一天票息。
        到期收益 = 名义本金 × 票息(年化) × 区间内天数 / 全年天数
    """
    notional: float = 10_000_000
    coupon: float = 0.06           # 票息（年化，按累计天数计）
    lower: float = 0.90            # 区间下限（%期初价）
    upper: float = 1.10            # 区间上限（%期初价）
    T: float = 1.0

    VERSION = "v1.0"
    PAYOFF_CODE = '''def payoff(paths, params):
    """区间累计收益结构：逐日观察，落入区间累计票息"""
    days_in = count(params.lower * S0 <= S[t] <= params.upper * S0)
    return notional * params.coupon * days_in / total_days'''

    def price_mc(self, engine: MonteCarloEngine, n_paths=100_000, seed=42) -> dict:
        m = engine.mkt
        paths, _ = engine.simulate(self.T, n_paths, seed=seed)
        lo, hi = self.lower * m.S0, self.upper * m.S0
        in_range = (paths >= lo) & (paths <= hi)      # (n, steps+1) 含期初
        days_in = in_range.sum(axis=1)
        total_days = paths.shape[1]
        pay = self.notional * self.coupon * self.T * days_in / total_days
        res = _stats(pay * exp(-m.r * self.T))
        res.update({"structure": "rangeaccrual", "version": self.VERSION,
                    "avg_days_ratio": float((days_in / total_days).mean())})
        return res


# =====================================================================
# 结构七：安全气囊 (Airbag)  v1.0
# =====================================================================
@dataclass
class AirbagOption:
    """
    安全气囊结构（到期观察型）：
        S_T ≥ S0      → 参与上涨：名义本金 × (1 + 参与率 × (S_T/S0 − 1))
        气囊线 ≤ S_T < S0 → 本金保障：名义本金 × 1（不亏不赚）
        S_T < 气囊线   → 亏损缓冲：名义本金 × S_T / 气囊线
                         （跌破气囊才亏损，且亏损按"气囊线折算"，小于直接持有标的）
    """
    notional: float = 10_000_000
    airbag_level: float = 0.80     # 气囊线（%期初价）
    participation: float = 1.0     # 上涨参与率
    T: float = 1.0

    VERSION = "v1.0"
    PAYOFF_CODE = '''def payoff(paths, params):
    """安全气囊收益结构（到期观察）"""
    if S[T] >= S0:
        return notional * (1 + params.participation * (S[T]/S0 - 1))
    elif S[T] >= params.airbag_level * S0:
        return notional                       # 本金保障
    return notional * S[T] / (params.airbag_level * S0)  # 亏损缓冲'''

    def price_mc(self, engine: MonteCarloEngine, n_paths=100_000, seed=42) -> dict:
        m = engine.mkt
        paths, _ = engine.simulate(self.T, n_paths, seed=seed)
        s_T = paths[:, -1]
        ab = self.airbag_level * m.S0
        up = s_T >= m.S0
        safe = (~up) & (s_T >= ab)
        down = s_T < ab
        pay = np.empty(paths.shape[0])
        pay[up] = self.notional * (1 + self.participation * (s_T[up] / m.S0 - 1))
        pay[safe] = self.notional
        pay[down] = self.notional * s_T[down] / ab
        res = _stats(pay * exp(-m.r * self.T))
        res.update({"structure": "airbag", "version": self.VERSION,
                    "prob_airbag_breach": float(down.mean()),
                    "prob_protected": float(safe.mean())})
        return res


# =====================================================================
# 结构注册表：供界面"结构选择 → 匹配库内模型"调用
# =====================================================================
STRUCTURE_REGISTRY = {
    "snowball":     {"cls": SnowballOption,     "name": "雪球结构",   "en": "Snowball / Autocallable"},
    "vanilla":      {"cls": VanillaOption,      "name": "香草期权",   "en": "Vanilla Option"},
    "asian":        {"cls": AsianOption,        "name": "亚式期权",   "en": "Asian Option"},
    "sharkfin":     {"cls": SharkFinOption,     "name": "鲨鱼鳍结构", "en": "Shark Fin"},
    "binary":       {"cls": BinaryOption,       "name": "二元期权",   "en": "Binary / Digital"},
    "rangeaccrual": {"cls": RangeAccrualOption, "name": "区间累计",   "en": "Range Accrual"},
    "airbag":       {"cls": AirbagOption,       "name": "安全气囊",   "en": "Airbag"},
}


def get_payoff_code(struct_key: str) -> str:
    """界面比对功能：取出库内某结构的收益结构代码（仅收益结构部分）"""
    return STRUCTURE_REGISTRY[struct_key]["cls"].PAYOFF_CODE


def price(struct_key: str, market: MarketEnv, n_paths=100_000, seed=42, **params) -> dict:
    """统一估值入口：price("snowball", market, coupon=0.185, ...)"""
    option = STRUCTURE_REGISTRY[struct_key]["cls"](**params)
    return option.price_mc(MonteCarloEngine(market), n_paths=n_paths, seed=seed)
