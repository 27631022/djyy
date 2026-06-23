import { getDataSource } from "./data-sources/registry";
import { getStrategy } from "./scoring/registry";
import type { IndicatorNode } from "./api";

const numOf = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** 数据源说明(给评分标准用)。 */
function dataSourceDesc(node: IndicatorNode): string {
  if (node.dataSource === "report.query") {
    const f = (node.sourceParams as { field?: string } | undefined)?.field === "rate" ? "完成率" : "实际值";
    return `按报送任务对应目标的${f}取数`;
  }
  return getDataSource(node.dataSource)?.label ?? "未指定数据源";
}

/** 计分规则一句话(常用工具展开参数,其余回退 summary)。 */
export function scoringRuleText(node: IndicatorNode): string {
  const st = node.scoringType ?? "";
  const p = node.strategyParams ?? {};
  const w = node.weight || 0;
  const get = (o: unknown, k: string) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined);
  if (st === "threshold_tiers") {
    const tiers = (Array.isArray(p.tiers) ? p.tiers : [])
      .map((t) => `≥${numOf(get(t, "min"))}% 得 ${numOf(get(t, "score"))} 分`)
      .join(";");
    return tiers ? `完成率 ${tiers};未达不得分` : "按阈值档位给分,未达不得分";
  }
  if (st === "proportional") return `按完成率比例给分,完成率 100% 得满分 ${w} 分(封顶 ${numOf(p.cap, 100)}%)`;
  if (st === "minmax") return `在全部考核对象中按相对水平给分,最高 ${w} 分、最低 0 分`;
  if (st === "rank_linear" || st === "rank_tiers") return `按在全部考核对象中的名次给分(满分 ${w} 分)`;
  if (st === "binary") return `完成得 ${numOf(p.onTrue, w)} 分,未完成得 ${numOf(p.onFalse, 0)} 分`;
  if (st === "manual") return `责任部门按本标准人工打分(0 ~ ${w} 分)`;
  if (st === "manual_deduct") return `满分 ${w} 分起评,按问题逐条扣分`;
  const strat = getStrategy(st);
  return strat?.summary?.(p) ?? strat?.label ?? "";
}

/** 按当前配置生成「评分标准/说明」草稿(指标名 + 数据源 + 计分规则 + 满分)。 */
export function buildRubric(node: IndicatorNode): string {
  const name = node.label?.trim() || "本指标";
  const w = node.weight || 0;
  return `${name}:${dataSourceDesc(node)};${scoringRuleText(node)}。本项满分 ${w} 分。`;
}

/** AI 生成入参(同样按当前配置拼)。 */
export function criteriaInput(node: IndicatorNode) {
  return {
    label: node.label ?? "",
    dataSourceDesc: dataSourceDesc(node),
    tool: getStrategy(node.scoringType)?.label ?? node.scoringType ?? "",
    rule: scoringRuleText(node),
    weight: node.weight || 0,
  };
}
