/**
 * 数据源 / 采集方式 注册表(前端镜像后端 data-sources.ts 的元数据)。
 * 仅用于:LeafConfigPanel 的数据源下拉 + 标签展示。取数在后端。
 */
export type DataSourceOutput = "rate" | "number" | "bool" | "count" | "label";
export type DataSourceCollection =
  | "dept_fill"
  | "target"
  | "self_report"
  | "business"
  | "survey"
  | "assessment";

export interface DataSourceMeta {
  id: string;
  label: string;
  description: string;
  collection: DataSourceCollection;
  outputType: DataSourceOutput;
  ready: boolean;
}

export const DATA_SOURCES: DataSourceMeta[] = [
  { id: "dept_fill", label: "部门填写", description: "责任部门直接录入数值/分(可附佐证材料)", collection: "dept_fill", outputType: "number", ready: true },
  { id: "target", label: "目标值→完成率", description: "设目标值(如完成利润 1200 万)+ 录实际值,自动算完成率%", collection: "target", outputType: "rate", ready: true },
  { id: "self_report", label: "单位自评+佐证", description: "被考核单位自评填报、上传作证材料,责任部门/考核办复核(填报 P2)", collection: "self_report", outputType: "number", ready: false },
  { id: "business.task.completionRate", label: "督办任务完成率", description: "派发任务的完成率(自动取数,P2 接入)", collection: "business", outputType: "rate", ready: false },
  { id: "business.task.overdueRate", label: "督办任务逾期率", description: "派发任务的逾期率(自动取数,P2 接入)", collection: "business", outputType: "rate", ready: false },
  { id: "business.publicity", label: "宣传稿件数", description: "宣传稿件数等(对应模块就绪后接入)", collection: "business", outputType: "count", ready: false },
  { id: "business.certificate.honor", label: "荣誉积分", description: "证书荣誉按级别积分(自动取数,P2 接入)", collection: "business", outputType: "count", ready: false },
  { id: "survey", label: "群众打分/测评", description: "群众投票评分、民主测评满意率(采集 P4)", collection: "survey", outputType: "rate", ready: false },
  { id: "assessment.result", label: "他考核结果", description: "取另一考核某对象的总分(党建占业绩 20% 这类跨路线组合)", collection: "assessment", outputType: "number", ready: false },
  { id: "dept_grade", label: "部门评定等次", description: "责任部门/考核人直接评定一个名次/等次(先进/良好/达标…),配「评价定分」给固定分", collection: "dept_fill", outputType: "label", ready: true },
  { id: "assessment.grade", label: "他考核定级档次", description: "取另一考核某对象的定级档次(党建定级→业绩兑现:先进=24/良好=20…),配「评价定分」(P2 接入)", collection: "assessment", outputType: "label", ready: false },
];

export const DATA_SOURCE_MAP: Record<string, DataSourceMeta> = Object.fromEntries(
  DATA_SOURCES.map((d) => [d.id, d]),
);

export function getDataSource(id?: string): DataSourceMeta | undefined {
  return id ? DATA_SOURCE_MAP[id] : undefined;
}

export const OUTPUT_LABELS: Record<DataSourceOutput, string> = {
  rate: "完成率/比率",
  number: "数值",
  bool: "是/否",
  count: "计数",
  label: "评价等次",
};

export const COLLECTION_LABELS: Record<DataSourceCollection, string> = {
  dept_fill: "部门填写",
  target: "目标值",
  self_report: "单位自评",
  business: "业务系统",
  survey: "群众打分",
  assessment: "他考核",
};
