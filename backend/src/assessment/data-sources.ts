/**
 * 数据源 / 采集方式(DataSource)注册表 —— 决定每个叶子指标「完成情况从哪来」,产出「原始度量」。
 * 与「计分工具(scoring-strategies.ts)」解耦:产出 outputType 与计分工具 inputType 兼容即可任意组合。
 *
 * collection(采集方式,按叶子各选,一套考核内可混用):
 *   dept_fill    部门填写       —— 责任部门直接录值/分(可附佐证材料)
 *   target       目标值→完成率  —— 设目标值 + 录实际值,自动算完成率%
 *   self_report  单位自评+佐证  —— 被考核单位自评填报 + 上传佐证材料,责任部门/考核办复核
 *   business     业务系统自动   —— 日常任务落实自动取数(任务完成率/逾期率、宣传稿件数、证书荣誉…)
 *   survey       群众打分/测评  —— 群众投票评分 → 满意率/均分
 *   assessment   他考核结果     —— 取另一考核某对象的总分/定级(党建占业绩 20% 这类跨路线组合)
 *
 * ready=false 的源在 P1 仅「可配置」(UI 灰显「待接入」标),实际取数/采集在 P2-P4 落地;
 * 发起考核(P2)时若叶子选了未就绪的源,再按 ready 拦截。
 *
 * 加新数据源 = 这里加一条 DATA_SOURCE_SPECS + 前端 data-sources/ 加镜像项;business 类取数在 service 注入对应模块 service 实现。
 */
export type DataSourceOutput = 'rate' | 'number' | 'bool' | 'count';
export type DataSourceCollection = 'dept_fill' | 'target' | 'self_report' | 'business' | 'survey' | 'assessment';

export interface DataSourceSpec {
  id: string;
  label: string;
  description: string;
  collection: DataSourceCollection;
  outputType: DataSourceOutput;
  /** 是否已就绪可取数(P1:仅 dept_fill/target;其余占位) */
  ready: boolean;
}

const DATA_SOURCE_SPECS: Record<string, DataSourceSpec> = {
  dept_fill: {
    id: 'dept_fill',
    label: '部门填写',
    description: '责任部门直接录入数值/分(可附佐证材料)',
    collection: 'dept_fill',
    outputType: 'number',
    ready: true,
  },
  target: {
    id: 'target',
    label: '目标值→完成率',
    description: '设目标值(如完成利润 1200 万)+ 录实际值,自动算完成率%',
    collection: 'target',
    outputType: 'rate',
    ready: true,
  },
  self_report: {
    id: 'self_report',
    label: '单位自评+佐证',
    description: '被考核单位自评填报、上传作证材料,责任部门/考核办复核(填报 P2)',
    collection: 'self_report',
    outputType: 'number',
    ready: false,
  },
  'business.task.completionRate': {
    id: 'business.task.completionRate',
    label: '督办任务完成率',
    description: '派发任务的完成率(自动取数,P2 接入)',
    collection: 'business',
    outputType: 'rate',
    ready: false,
  },
  'business.task.overdueRate': {
    id: 'business.task.overdueRate',
    label: '督办任务逾期率',
    description: '派发任务的逾期率(自动取数,P2 接入)',
    collection: 'business',
    outputType: 'rate',
    ready: false,
  },
  'business.publicity': {
    id: 'business.publicity',
    label: '宣传稿件数',
    description: '宣传稿件数等(对应模块就绪后接入)',
    collection: 'business',
    outputType: 'count',
    ready: false,
  },
  'business.certificate.honor': {
    id: 'business.certificate.honor',
    label: '荣誉积分',
    description: '证书荣誉按级别积分(自动取数,P2 接入)',
    collection: 'business',
    outputType: 'count',
    ready: false,
  },
  survey: {
    id: 'survey',
    label: '群众打分/测评',
    description: '群众投票评分、民主测评满意率(采集 P4)',
    collection: 'survey',
    outputType: 'rate',
    ready: false,
  },
  'assessment.result': {
    id: 'assessment.result',
    label: '他考核结果',
    description: '取另一考核某对象的总分(如党建结果喂业绩考核「党建占 20%」)',
    collection: 'assessment',
    outputType: 'number',
    ready: false,
  },
};

export const DATA_SOURCE_IDS = Object.keys(DATA_SOURCE_SPECS);

export function getDataSourceSpec(id: string): DataSourceSpec | undefined {
  return DATA_SOURCE_SPECS[id];
}

export function listDataSources(): DataSourceSpec[] {
  return DATA_SOURCE_IDS.map((id) => DATA_SOURCE_SPECS[id]);
}
