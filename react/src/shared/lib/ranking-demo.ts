/**
 * 党建责任制考核 —— 三级单位真实数据(2023-2025,来自《3年考核结果.xlsx》)+ 2026 模拟。
 *
 * 门户首页(NavPage)与桌面挂件(TaskWidget)共用。排名按当年得分降序计算(高分=第1)。
 * ⚠ 2026 为模拟数据(下个任务接真实考核结果);由前三年确定性推导,保证演示稳定(不随机)。
 */
export const ASSESSMENT_YEARS = [2023, 2024, 2025, 2026] as const;

export interface UnitAssessment {
  name: string;
  /** 与 ASSESSMENT_YEARS 对齐的逐年得分 */
  scores: number[];
}

// 单位 + 2023 / 2024 / 2025 真实考核得分
const RAW: [string, number, number, number][] = [
  ["塔运司", 105.1, 120, 116],
  ["新疆油田运输分公司", 104.3, 116, 110],
  ["长庆运输分公司", 105.8, 97.2, 107],
  ["华北运输分公司", 102.6, 104.1, 95.2],
  ["哈萨克分公司", 100.3, 94.4, 90.2],
  ["黑龙江分公司", 101, 108.2, 86.2],
  ["吉林分公司", 97.9, 102.9, 97.9],
  ["辽宁分公司", 99.8, 96, 102.1],
  ["内蒙古分公司", 97.6, 103.8, 104.2],
  ["北京分公司", 102.4, 119, 118],
  ["河北分公司", 99.1, 94, 97.2],
  ["山东分公司", 102, 109.1, 103.5],
  ["苏皖分公司", 95.2, 100.8, 84.2],
  ["浙江分公司", 96.1, 97.6, 100],
  ["湘鄂分公司", 101.4, 104.3, 93.2],
  ["闽赣分公司", 98.9, 100.6, 96.2],
  ["广东分公司", 98.4, 115, 112],
  ["广西分公司", 101.7, 95.2, 92.2],
  ["云贵分公司", 97.8, 98, 82.2],
  ["重庆分公司", 98.2, 102.6, 105.6],
  ["四川分公司", 97.8, 115.5, 104.9],
  ["西藏分公司", 100.8, 100, 102.8],
  ["陕豫分公司", 99.5, 112, 109],
  ["甘肃分公司", 101.2, 104.7, 106.3],
  ["宁夏分公司", 100, 105, 108],
  ["青海分公司", 101.6, 103.2, 111],
  ["新疆分公司", 103.6, 118, 114],
  ["东北分公司", 100.7, 94.8, 100.7],
  ["西北分公司", 103.8, 108.8, 120],
  ["物资分公司", 98.8, 99.2, 101.4],
  ["华油信通公司", 105.5, 110, 88.2],
  ["建安公司", 98.7, 98.4, 94.2],
  ["公共事务中心", 98.5, 108.5, 98.6],
  ["教育培训中心", 99.9, 114, 99.3],
];

/** 2026 模拟得分:由 2025 得分确定性偏移(-4 ~ +4,非随机),钳制在 [82,120]。 */
function mock2026(score2025: number, i: number): number {
  const v = score2025 + (((i * 13 + 5) % 9) - 4);
  return Math.round(Math.min(120, Math.max(82, v)) * 10) / 10;
}

export const ASSESSMENT_UNITS: UnitAssessment[] = RAW.map(([name, a, b, c], i) => ({
  name,
  scores: [a, b, c, mock2026(c, i)],
}));

export interface RankedUnit {
  name: string;
  score: number;
  rank: number;
}

/** 按某一年(下标)得分降序排名(高分=第1)。 */
export function rankingForYearIndex(yi: number): RankedUnit[] {
  return ASSESSMENT_UNITS.map((u) => ({ name: u.name, score: u.scores[yi] }))
    .sort((x, y) => y.score - x.score)
    .map((u, i) => ({ name: u.name, score: u.score, rank: i + 1 }));
}

/** 最近一个「真实」年度 = 2025(下标 2)= 当前榜单。 */
const LATEST_REAL_INDEX = 2;
export function currentRanking(): RankedUnit[] {
  return rankingForYearIndex(LATEST_REAL_INDEX);
}

/** 某单位逐年排名序列(折线图用)。 */
export function unitRankSeries(name: string): { year: number; rank: number }[] {
  const n = ASSESSMENT_UNITS.length;
  return ASSESSMENT_YEARS.map((year, yi) => {
    const hit = rankingForYearIndex(yi).find((u) => u.name === name);
    return { year, rank: hit ? hit.rank : n };
  });
}

/** 把用户的行政机构名匹配到考核单位;匹配不到则取当前榜单中位作演示。 */
export function resolveUnitName(orgNames: string[]): { name: string; matched: boolean } {
  for (const raw of orgNames) {
    const n = (raw || "").trim();
    if (!n) continue;
    const hit = ASSESSMENT_UNITS.find((u) => n === u.name || n.includes(u.name) || u.name.includes(n));
    if (hit) return { name: hit.name, matched: true };
  }
  const cur = currentRanking();
  return { name: cur[Math.floor(cur.length / 2)].name, matched: false };
}

/** 门户首页排行榜:当前(2025)真实 top 10。 */
export const DEMO_RANKINGS: RankedUnit[] = currentRanking().slice(0, 10);

/** 排名进度条层级语义色:金/橙(领先)→ 红(靠前)→ 灰(中后段),与主题色解耦。 */
export function rankBarGradient(rank: number): string {
  if (rank <= 3) return "linear-gradient(to right, #F5A623, #E8700A)";
  if (rank <= 6) return "linear-gradient(to right, #C8001E, #FF6B6B)";
  return "linear-gradient(to right, #9CA3AF, #D1D5DB)";
}

/** 得分 → 进度条百分比(实际分布 ~82-120,映射 80-120 → 0-100%)。 */
export function scoreBarPct(score: number): number {
  return Math.min(100, Math.max(0, ((score - 80) / 40) * 100));
}
