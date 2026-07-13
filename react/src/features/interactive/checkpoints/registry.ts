import { type Checkpoint, type CheckpointKind, type CheckpointUiDef } from "./types";
import { quizCheckpoint } from "./quiz";
import { spotCheckpoint } from "./spot";

/** 关卡类型注册表 —— 加类型在此加一行(+ 后端 CHECKPOINT_KINDS 对称加一条) */
export const CHECKPOINT_UIS: Record<CheckpointKind, CheckpointUiDef> = {
  quiz: quizCheckpoint,
  spot: spotCheckpoint,
};

export const CHECKPOINT_UI_LIST: CheckpointUiDef[] = Object.values(CHECKPOINT_UIS);

export function getCheckpointUi(kind: string | null | undefined): CheckpointUiDef | null {
  return kind ? (CHECKPOINT_UIS[kind as CheckpointKind] ?? null) : null;
}

/** 关卡显示名:标题 > 类型名 */
export function checkpointLabel(cp: Checkpoint): string {
  return cp.title || getCheckpointUi(cp.kind)?.label || cp.kind;
}
