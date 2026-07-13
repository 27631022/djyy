import { type ComponentType } from "react";
import { type RosterPlayer, type ScreenEventMsg } from "../useRoom";
import { type EventConfig, type GroupingConfig, type SoundKey } from "../api";

/** 大屏渲染:消费服务端 projectScreen 投影 + 花名册 + 瞬时事件(触发动画/音效)+ 节目分组(队色) */
export interface GameScreenProps {
  view: unknown | null;
  roster: RosterPlayer[];
  connectedCount: number;
  settlement: unknown | null;
  lastEvent: ScreenEventMsg | null;
  eventConfig: EventConfig;
  grouping: GroupingConfig | null; // 当前节目的分组(队色/队名查这里,分组属节目玩法)
  roomCode: string; // 报名页二维码/房号用
  joinQr: string | null; // 入场二维码 data URL
}

/** 手机渲染:消费服务端 projectRemote 投影 + 发玩家动作 */
export interface GameRemoteProps {
  view: unknown | null;
  connected: boolean;
  sendAction: (action: Record<string, unknown>) => void;
  eventConfig: EventConfig;
  grouping: GroupingConfig | null;
}

/** 后台配置:受控 value/onChange(配置写进 Game.configJson) */
export interface GameConfigProps {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}

/**
 * 前端游戏定义(与后端 GameDef 对称的展示侧)。
 * 加一个新游戏 = 新建 games/<type>.tsx 导出一个 GameUi + registry 注册一行。
 */
export interface GameUi {
  type: string;
  label: string;
  icon: string; // lucide 图标名
  hint: string; // 一句话玩法说明(配置台/选择器)
  rules?: string; // 玩家侧规则说明(手机上「游戏名称」下展示,介绍个人/团体赛怎么玩;\n 分行)
  /** true = 不进「添加节目」的游戏类型裸列(如 route_race 必须从「自制游戏库」带设计添加,防空配置) */
  hidden?: boolean;
  defaultConfig: Record<string, unknown>;
  /** 每游戏默认音效覆盖(未上传自定义音时用;缺省槽位回退全局内置 DEFAULT_SOUND_URL) */
  defaultSounds?: Partial<Record<SoundKey, string>>;
  Screen: ComponentType<GameScreenProps>;
  Remote: ComponentType<GameRemoteProps>;
  Config: ComponentType<GameConfigProps>;
}
