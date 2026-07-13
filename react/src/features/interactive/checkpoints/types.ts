import { type ComponentType } from "react";

/**
 * 关卡类型注册表(前端侧)—— 与后端 backend/src/interactive/checkpoints.ts 对称。
 * 加一个新关卡类型 = 双端注册表各加一条(前端 checkpoints/<kind>.tsx + registry 一行,
 * 后端 CHECKPOINT_KINDS 一条)。
 *
 * 判定在服务端(答案/热区绝不下发手机);前端只负责:编辑器属性面板(EditorPanel)+
 * 手机作答卡(Play,消费服务端脱敏投影 challenge、上报作答意图)。
 */

export type CheckpointKind = "quiz" | "spot";

export interface QuizQuestion {
  id: string;
  text: string;
  options: string[]; // 2..6 项
  correctIdx: number;
  imageFileId?: string;
}

export interface SpotRegion {
  x: number; // % of 找错图(0..100)
  y: number;
  w: number;
  h: number;
}

export interface SpotPuzzle {
  id: string;
  imageFileId?: string; // 编辑草稿期可空;保存时后端剔除缺图的 puzzle(编辑器 validate 会提示)
  prompt?: string;
  regions: SpotRegion[];
}

export interface Checkpoint {
  id: string;
  kind: CheckpointKind;
  t: number; // 0.02..1 路线弧长参数
  penaltySteps: number; // 答错退回步数(0=原地重答)
  title?: string;
  quiz?: { questions: QuizQuestion[] };
  spot?: { puzzles: SpotPuzzle[] };
}

/** 服务端脱敏投影(projectRemote.challenge):quiz 无 correctIdx / spot 无 regions */
export interface CheckpointChallenge {
  cpId: string;
  kind: CheckpointKind;
  nonce: number;
  penaltySteps: number;
  title?: string;
  quiz?: { text: string; options: string[]; imageFileId?: string };
  spot?: { imageFileId: string; prompt?: string };
}

export interface CheckpointPlayProps {
  challenge: CheckpointChallenge;
  /** 上报作答意图(quiz 传 choice / spot 传 px,py %);cpId/nonce 由外层拼装 */
  submit: (payload: { choice?: number; px?: number; py?: number }) => void;
  disabled?: boolean;
}

export interface CheckpointEditorProps {
  value: Checkpoint;
  onChange: (cp: Checkpoint) => void;
  /** 素材上传落点:storage folder=design-<designId> */
  designId: string;
}

export interface CheckpointUiDef {
  kind: CheckpointKind;
  label: string;
  /** 画布/列表上的记号(emoji,大屏也用) */
  icon: string;
  /** 新建关卡默认负载(带一条空题/空图,进来即可填) */
  makeDefault(t: number): Checkpoint;
  /** 右栏属性面板:编辑 kind 专属负载(题目/找错图热区) */
  EditorPanel: ComponentType<CheckpointEditorProps>;
  /** 手机作答卡(P4 Remote 按 challenge.kind 分发) */
  Play: ComponentType<CheckpointPlayProps>;
  /** 保存前校验:返回问题描述(会被后端剔除/忽略的内容)或 null */
  validate(cp: Checkpoint): string | null;
}

export function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `cp_${Math.random().toString(36).slice(2)}${Date.now()}`;
}
