import * as crypto from 'crypto';

/**
 * 关卡类型注册表 —— 照 task/fields、showcase/tools 的双端注册表范式(前端对称:
 * react/src/features/interactive/checkpoints/)。加一个新关卡类型 = 双端注册表各加一条。
 *
 * 服务端权威:题目答案(correctIdx)/找错热区(regions)只存在配置里,判定只在 judge 内做,
 * projectRemote 投影**绝不下发**这两个字段(脱敏由 route-race.game 保证)。
 */

export type CheckpointKind = 'quiz' | 'spot';

export interface QuizQuestion {
  id: string;
  text: string; // 题干 ≤200 字
  options: string[]; // 2..6 项,各 ≤80 字
  correctIdx: number; // 正确项下标(服务端私有,不下发)
  imageFileId?: string; // 可选题图(storage 松引用)
}

/** 找错热区:% of 找错图(0..100),命中任一即答对 */
export interface SpotRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SpotPuzzle {
  id: string;
  imageFileId: string; // 找错图(必填,缺图的 puzzle 归一化时剔除)
  prompt?: string; // 提示语 ≤200 字
  regions: SpotRegion[]; // 1..8 个热区(服务端私有,不下发)
}

export interface Checkpoint {
  id: string;
  kind: CheckpointKind;
  t: number; // 0.02..1 路线弧长参数(编辑器吸附存 t,运行时换算成步数阈值 gate)
  penaltySteps: number; // 答错退回步数 0..500;0=原地重答语义(退回后仍在阈值上,保持拦截换题)
  title?: string;
  quiz?: { questions: QuizQuestion[] };
  spot?: { puzzles: SpotPuzzle[] };
}

/** 手机端作答动作(quiz 用 choice;spot 用 px/py % 坐标) */
export interface AnswerAction {
  kind: 'answer';
  cpId: string;
  nonce: number;
  choice?: number;
  px?: number;
  py?: number;
}

// ── 归一化小工具(与 event-config/race.game 同风格) ──
function asRec(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}
function fid(v: unknown): string | undefined {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s.slice(0, 64) : undefined;
}
function clampNum(v: unknown, min: number, max: number, fb: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fb;
}
function idOf(v: unknown): string {
  const s = str(v, 40);
  return s || crypto.randomUUID();
}

// 手机点按容差:热区四边各外扩 1%(移动端指尖精度低,不因 1px 之差误判)
const SPOT_HIT_TOLERANCE = 1;

interface CheckpointSpec {
  /** 白名单重建 kind 专属负载;无有效内容返回 null(该关卡整个被剔除) */
  normalize(cp: Record<string, unknown>): Pick<Checkpoint, 'quiz' | 'spot'> | null;
  /** 该关卡可轮换的题目/图数(答错换下一题用) */
  itemCount(cp: Checkpoint): number;
  /** 服务端权威判定(itemIdx 已 % itemCount) */
  judge(cp: Checkpoint, itemIdx: number, action: AnswerAction): boolean;
  /** 收集该关卡引用的 storage fileId(孤儿 GC 在用集合) */
  collectFileIds(cp: Checkpoint): string[];
}

export const CHECKPOINT_KINDS: Record<CheckpointKind, CheckpointSpec> = {
  quiz: {
    normalize(cp) {
      const raw = asRec(cp.quiz);
      const list = Array.isArray(raw.questions) ? raw.questions.slice(0, 20) : [];
      const questions: QuizQuestion[] = [];
      for (const q of list) {
        const o = asRec(q);
        const text = str(o.text, 200);
        const options = (Array.isArray(o.options) ? o.options : [])
          .map((x) => str(x, 80))
          .filter(Boolean)
          .slice(0, 6);
        if (!text || options.length < 2) continue; // 空题干/不足两项 → 该题剔除
        const correctIdx = Math.min(options.length - 1, Math.max(0, Math.round(clampNum(o.correctIdx, 0, options.length - 1, 0))));
        const out: QuizQuestion = { id: idOf(o.id), text, options, correctIdx };
        const img = fid(o.imageFileId);
        if (img) out.imageFileId = img;
        questions.push(out);
      }
      if (!questions.length) return null;
      return { quiz: { questions } };
    },
    itemCount(cp) {
      return cp.quiz?.questions.length ?? 0;
    },
    judge(cp, itemIdx, action) {
      const q = cp.quiz?.questions[itemIdx];
      if (!q) return false;
      const choice = Number(action.choice);
      return Number.isInteger(choice) && choice === q.correctIdx;
    },
    collectFileIds(cp) {
      return (cp.quiz?.questions ?? []).map((q) => q.imageFileId).filter((x): x is string => !!x);
    },
  },

  spot: {
    normalize(cp) {
      const raw = asRec(cp.spot);
      const list = Array.isArray(raw.puzzles) ? raw.puzzles.slice(0, 20) : [];
      const puzzles: SpotPuzzle[] = [];
      for (const p of list) {
        const o = asRec(p);
        const imageFileId = fid(o.imageFileId);
        if (!imageFileId) continue; // 缺图 → 该图剔除
        const regions: SpotRegion[] = (Array.isArray(o.regions) ? o.regions : [])
          .map((r) => {
            const ro = asRec(r);
            const x = clampNum(ro.x, 0, 98, 0);
            const y = clampNum(ro.y, 0, 98, 0);
            return {
              x,
              y,
              w: clampNum(ro.w, 2, 100 - x, 10),
              h: clampNum(ro.h, 2, 100 - y, 10),
            };
          })
          .slice(0, 8);
        if (!regions.length) continue; // 无热区 → 该图剔除
        const out: SpotPuzzle = { id: idOf(o.id), imageFileId, regions };
        const prompt = str(o.prompt, 200);
        if (prompt) out.prompt = prompt;
        puzzles.push(out);
      }
      if (!puzzles.length) return null;
      return { spot: { puzzles } };
    },
    itemCount(cp) {
      return cp.spot?.puzzles.length ?? 0;
    },
    judge(cp, itemIdx, action) {
      const p = cp.spot?.puzzles[itemIdx];
      if (!p) return false;
      const px = Number(action.px);
      const py = Number(action.py);
      if (!Number.isFinite(px) || !Number.isFinite(py)) return false;
      return p.regions.some(
        (r) =>
          px >= r.x - SPOT_HIT_TOLERANCE &&
          px <= r.x + r.w + SPOT_HIT_TOLERANCE &&
          py >= r.y - SPOT_HIT_TOLERANCE &&
          py <= r.y + r.h + SPOT_HIT_TOLERANCE,
      );
    },
    collectFileIds(cp) {
      return (cp.spot?.puzzles ?? []).map((p) => p.imageFileId);
    },
  },
};

export const CHECKPOINT_KIND_LIST = Object.keys(CHECKPOINT_KINDS) as CheckpointKind[];

/** 归一化一个关卡(kind 白名单 + 负载经注册表重建);非法/空内容返回 null(剔除) */
export function normalizeCheckpoint(input: unknown): Checkpoint | null {
  const o = asRec(input);
  const kind = String(o.kind) as CheckpointKind;
  const spec = CHECKPOINT_KINDS[kind];
  if (!spec) return null;
  const payload = spec.normalize(o);
  if (!payload) return null;
  const cp: Checkpoint = {
    id: idOf(o.id),
    kind,
    t: clampNum(o.t, 0.02, 1, 0.5),
    penaltySteps: Math.round(clampNum(o.penaltySteps, 0, 500, 10)),
    ...payload,
  };
  const title = str(o.title, 40);
  if (title) cp.title = title;
  return cp;
}
