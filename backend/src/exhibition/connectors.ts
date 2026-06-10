/**
 * 连接器注册表 — 后端为每个内部系统写的适配器,**输出与对应组件手动内容完全相同的结构**,
 * 这样客户端无论数据来自上传还是系统,都用同一套逻辑渲染(规格 5.4)。
 *
 * P1:仅注册元信息 + 返回占位空内容(让组件渲染「数据源待接入」而非报错)。
 * P5:在 ExhibitionService 注入 CertificateService / TaskService(走 barrel DI)填真数据 —
 *     honor → { items:[{title,level,year,imageUrl}] };notice → { items:[{title,date,body}] }。
 */

import type { FixtureType } from './exhibition.types';

export interface ConnectorMeta {
  id: string;
  name: string;
  /** 适配到哪种组件(其输出结构 = 该组件的手动内容) */
  forType: FixtureType;
  description: string;
  /** 数据源是否已接入(P1 全为 false = 占位) */
  ready: boolean;
}

/** 可用连接器列表(供 P2 管理端给组件绑定数据来源) */
export const CONNECTORS: ConnectorMeta[] = [
  {
    id: 'honor',
    name: '荣誉管理',
    forType: 'honor_wall',
    description: '对接证书 / 荣誉系统,实时取已发荣誉(名称 / 级别 / 年份 / 获奖人 / 证书图)',
    ready: false, // P5 接 CertificateIssueService.list()
  },
  {
    id: 'notice',
    name: '考核 / 党务',
    forType: 'notice_board',
    description: '对接任务 / 党务系统,实时取公示条目(标题 / 日期 / 正文)',
    ready: false, // P5 接党务公告数据源(task 现有接口不宜公开,需补可见性标记)
  },
];

/**
 * P1 占位解析:连接器尚未接入,返回空 items,客户端据此渲染「暂无数据 / 连接器待接入」。
 * P5 改为按 connectorId 调对应 service 取真实数据。
 */
export function resolveConnectorPlaceholder(connectorId?: string): { items: unknown[] } {
  void connectorId;
  return { items: [] };
}
