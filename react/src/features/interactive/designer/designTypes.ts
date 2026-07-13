import { type EventSound } from "../api";
import { type Checkpoint } from "../checkpoints/types";
import { type RoutePoint } from "../lib/routeMath";
import { getCheckpointUi, checkpointLabel } from "../checkpoints/registry";

/**
 * 自制闯关赛设计契约(前端镜像)—— 权威归一化在后端 route-race-design.ts 的
 * normalizeRouteRaceDesign(白名单重建/clamp/剔除非法关卡),这里只做宽松解析 + 默认工厂。
 * 坐标一律 % of 背景图;board.bgSize=背景天然像素尺寸(编辑器/大屏同一 aspect-ratio 容器,防跨屏变形)。
 */

export interface PodiumFrame {
  ax: number;
  ay: number;
  as: number;
  nx: number;
  ny: number;
}

export interface RouteRaceDesign {
  version: 1;
  durationSec: number; // 时限内冲终点:先到者按完成时间排名,时间到按进度排名
  board: {
    backgroundFileId?: string;
    bgSize?: { w: number; h: number };
    route: RoutePoint[]; // ≥2 点单条 polyline;≤64 点
    totalSteps: number; // 走完全程总点击数
    checkpoints: Checkpoint[];
    sprites: string[]; // 人物立绘 fileId ≤8,按 racer 稳定序循环分配
    spriteSizePct: number; // 人物宽 % of 背景宽
  };
  lobby: { backgroundFileId?: string; title?: string };
  award: { podiumFileId?: string; frames?: PodiumFrame[]; avatarBehind: boolean };
  remoteBgFileId?: string;
  sound?: EventSound;
}

export function defaultDesign(): RouteRaceDesign {
  return {
    version: 1,
    durationSec: 120,
    board: { route: [], totalSteps: 100, checkpoints: [], sprites: [], spriteSizePct: 8 },
    lobby: {},
    award: { avatarBehind: true },
  };
}

/** 宽松解析 configJson(填默认,编辑器用;权威归一化在后端) */
export function parseDesign(raw: string | null | undefined): RouteRaceDesign {
  const d = defaultDesign();
  if (!raw) return d;
  try {
    const o = JSON.parse(raw) as Partial<RouteRaceDesign> & Record<string, unknown>;
    const board = (o.board ?? {}) as Partial<RouteRaceDesign["board"]>;
    const lobby = (o.lobby ?? {}) as Partial<RouteRaceDesign["lobby"]>;
    const award = (o.award ?? {}) as Partial<RouteRaceDesign["award"]>;
    return {
      version: 1,
      durationSec: Number(o.durationSec) > 0 ? Number(o.durationSec) : d.durationSec,
      board: {
        backgroundFileId: board.backgroundFileId || undefined,
        bgSize: board.bgSize && Number(board.bgSize.w) > 0 && Number(board.bgSize.h) > 0 ? { w: Number(board.bgSize.w), h: Number(board.bgSize.h) } : undefined,
        route: Array.isArray(board.route) ? board.route.map((p) => ({ x: Number(p.x) || 0, y: Number(p.y) || 0 })) : [],
        totalSteps: Number(board.totalSteps) > 0 ? Number(board.totalSteps) : d.board.totalSteps,
        checkpoints: Array.isArray(board.checkpoints) ? (board.checkpoints as Checkpoint[]) : [],
        sprites: Array.isArray(board.sprites) ? board.sprites.filter((s): s is string => typeof s === "string" && !!s) : [],
        spriteSizePct: Number(board.spriteSizePct) > 0 ? Number(board.spriteSizePct) : d.board.spriteSizePct,
      },
      lobby: { backgroundFileId: lobby.backgroundFileId || undefined, title: lobby.title || undefined },
      award: {
        podiumFileId: award.podiumFileId || undefined,
        frames: Array.isArray(award.frames) && award.frames.length >= 3 ? (award.frames as PodiumFrame[]) : undefined,
        avatarBehind: award.avatarBehind !== false,
      },
      remoteBgFileId: (o.remoteBgFileId as string) || undefined,
      sound: o.sound as EventSound | undefined,
    };
  } catch {
    return d;
  }
}

/**
 * 保存前校验:列出会被后端归一化「剔除/忽略」的内容,防「设计所见 ≠ 运行所得」。
 * (后端 normalizeRouteRaceDesign 会剔除:无有效题目/找错图的关卡、修正后挤出终点的关卡)
 */
export function findDesignIssues(design: RouteRaceDesign): string[] {
  const issues: string[] = [];
  if (design.board.route.length < 2) issues.push("还没画行进路线(至少 2 个点),游戏将无法正常显示");
  if (!design.board.backgroundFileId) issues.push("游戏中场景还没上传背景图");
  const sorted = [...design.board.checkpoints].sort((a, b) => a.t - b.t);
  let lastGate = 0;
  sorted.forEach((cp) => {
    const ui = getCheckpointUi(cp.kind);
    const err = ui?.validate(cp);
    if (err) issues.push(`关卡「${checkpointLabel(cp)}」:${err}`);
    // 与后端 computeGates 同口径:gate 单调 +1 修正后超出总步数 → 该关被剔除
    let gate = Math.min(design.board.totalSteps, Math.max(1, Math.round(cp.t * design.board.totalSteps)));
    if (gate <= lastGate) gate = lastGate + 1;
    if (gate > design.board.totalSteps) issues.push(`关卡「${checkpointLabel(cp)}」挤在终点附近放不下,保存后将被忽略(减少关卡或增大总步数)`);
    lastGate = gate;
  });
  return issues;
}
