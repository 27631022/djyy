/**
 * AI 消费方注册表(「哪个应用的哪个功能,需要什么能力的模型」的中央目录)。
 *
 * 为什么放在 external-api 模块内、用「静态表 + string key」而不是反向 import 各业务模块:
 *   - external-api 是底座基础设施,被 certificate 等业务模块依赖(DAG 单向)。
 *     若它反向 import certificate 会破坏依赖图。故消费方在这里以 string key 登记,
 *     业务模块调用时只传 key(松引用)。
 *   - 加新应用(如任务派发)时,在这里加一行即可,路由总览/绑定 UI 自动出现该条目。
 *
 * consumerKey 命名约定:`<模块>.<功能>.<子类>`,如 'certificate.extract.text'。
 * 一旦上线就别改 key —— AiRoute 表用它做绑定主键。
 */
export type AiCapability = 'chat' | 'vision' | 'reasoning';

export interface AiConsumer {
  /** 稳定标识,AiRoute.consumerKey 引用它。上线后勿改。 */
  key: string;
  /** 所属应用(展示分组用),如 '证书管理' */
  app: string;
  /** 功能名,如 'AI 提取 · Word/PDF 文本' */
  label: string;
  /** 该功能需要的模型能力 —— 决定备选链从哪个能力池里按优先级取 */
  capability: AiCapability;
  /** 一句话说明这个功能拿模型干什么 */
  description?: string;
}

/**
 * 当前所有会调用外部/内部模型的业务功能。
 * 证书 AI 提取(文本走 chat、图片走 vision)+ 任务派发 AI 识别通知文件。
 */
export const AI_CONSUMERS: AiConsumer[] = [
  {
    key: 'certificate.extract.text',
    app: '证书管理',
    label: 'AI 提取 · Word/PDF 文本',
    capability: 'chat',
    description: '解析上传的表彰文件正文,抽取荣誉名称 / 受表彰人 / 年度等结构化信息',
  },
  {
    key: 'certificate.extract.image',
    app: '证书管理',
    label: 'AI 提取 · 拍照 / 图片',
    capability: 'vision',
    description: '从证书 / 表彰文件图片中识别结构化信息(多模态)',
  },
  {
    key: 'task.extract.text',
    app: '任务派发',
    label: 'AI 识别 · 通知文件',
    capability: 'chat',
    description:
      '解析上传的通知 / 红头文件,抽取任务名称 / 填报要求 / 截止日期,并按要求生成填报字段、建议填报范围',
  },
];

export function getConsumer(key: string): AiConsumer | undefined {
  return AI_CONSUMERS.find((c) => c.key === key);
}
