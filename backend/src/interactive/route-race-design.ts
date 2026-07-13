import { CHECKPOINT_KINDS, normalizeCheckpoint, type Checkpoint } from './checkpoints';
import { normalizeGameSound, type EventSound } from './event-config';

/**
 * 自制闯关赛(route_race)设计契约 —— 互动游戏编辑器的产物,存 InteractiveGameDesign.configJson;
 * 添加为节目时整份快照进 InteractiveGame.configJson(+ designId/designName 溯源)。
 * 前端镜像:react/src/features/interactive/designer/designTypes.ts(宽松 parse,权威归一化在这里)。
 *
 * 坐标一律 % of 背景图(0..100);board.bgSize 存背景天然像素尺寸 —— 编辑器/大屏用同一
 * aspect-ratio 容器渲染,保证路线/关卡跨屏不变形(纵横比统一的关键)。
 */

export interface RoutePoint {
  x: number; // % of 背景图宽
  y: number; // % of 背景图高
}

/** 领奖台版式(与 race 的 PodiumFrame 同构):前 3 名头像圈(圆心+直径)+ 名牌位置,% of 领奖台图 */
export interface PodiumFrame {
  ax: number;
  ay: number;
  as: number;
  nx: number;
  ny: number;
}

export interface RouteRaceDesign {
  version: 1;
  durationSec: number; // 5..1800 总时长(时限内冲终点)
  board: {
    // ── 场景②:游戏中 ──
    backgroundFileId?: string;
    bgSize?: { w: number; h: number }; // 背景图天然像素尺寸(上传时读取)
    route: RoutePoint[]; // ≥2 点单条 polyline(<2 视为未配置);≤64 点
    totalSteps: number; // 10..2000 走完全程总点击数
    checkpoints: Checkpoint[]; // 归一化后按 t 升序,且 gate 可行(不可行的已剔除)
    sprites: string[]; // 人物立绘 fileId ≤8,按 racer 稳定序循环分配
    spriteSizePct: number; // 2..30 人物宽 % of 背景宽
  };
  lobby: {
    // ── 场景①:游戏前(报名页)──
    backgroundFileId?: string; // 缺省 = 虚化 board 背景
    title?: string;
  };
  award: {
    // ── 场景③:颁奖 ──
    podiumFileId?: string; // 缺省 = CSS 领奖台兜底
    frames?: PodiumFrame[]; // 版式(复用 PodiumFrameEditor);缺省用默认
    avatarBehind: boolean; // 头像藏台图后(从相框透明洞露出)
  };
  remoteBgFileId?: string; // 手机端背景(可选)
  sound?: EventSound; // 5 槽音效初值;添加为节目时由 service 拼进顶层 sound(游戏 config 里不留)
}

// ── 归一化小工具 ──
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
function clampInt(v: unknown, min: number, max: number, fb: number): number {
  return Math.round(clampNum(v, min, max, fb));
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function normFrames(v: unknown): PodiumFrame[] | undefined {
  if (!Array.isArray(v) || v.length < 3) return undefined;
  return v.slice(0, 3).map((f) => {
    const o = asRec(f);
    return {
      ax: clampNum(o.ax, 0, 100, 50),
      ay: clampNum(o.ay, 0, 100, 40),
      as: clampNum(o.as, 2, 60, 15),
      nx: clampNum(o.nx, 0, 100, 50),
      ny: clampNum(o.ny, 0, 100, 60),
    };
  });
}

/**
 * 关卡步数阈值(gate):`round(t × totalSteps)` clamp [1..totalSteps],再单调 +1 修正防撞车。
 * **归一化与运行时共用同一函数**(单一事实源):normalize 用它剔除修正后越界的关卡,
 * 所以对已归一化的设计,返回值严格递增且 ≤ totalSteps,与 checkpoints 一一对应。
 */
export function computeGates(checkpoints: { t: number }[], totalSteps: number): number[] {
  const gates: number[] = [];
  let last = 0;
  for (const cp of checkpoints) {
    let gate = Math.min(totalSteps, Math.max(1, Math.round(cp.t * totalSteps)));
    if (gate <= last) gate = last + 1;
    gates.push(gate); // 可能 > totalSteps —— normalize 据此剔除;归一化数据不会出现
    last = gate;
  }
  return gates;
}

export const DEFAULT_TOTAL_STEPS = 100;
export const DEFAULT_DURATION_SEC = 120;
export const MAX_ROUTE_POINTS = 64;

/**
 * 设计归一化(白名单重建,非法回退默认)—— 存库/添加节目/GC 前都走这里。
 * 注意:挤在末端修正后越界的关卡会被**剔除**(编辑器保存时应同步提示,防「所见≠运行所得」)。
 */
export function normalizeRouteRaceDesign(input: unknown): RouteRaceDesign {
  const o = asRec(input);
  const boardIn = asRec(o.board);
  const lobbyIn = asRec(o.lobby);
  const awardIn = asRec(o.award);

  const totalSteps = clampInt(boardIn.totalSteps, 10, 2000, DEFAULT_TOTAL_STEPS);

  // 路线:逐点 clamp,<2 点视为未配置(清空)
  let route: RoutePoint[] = (Array.isArray(boardIn.route) ? boardIn.route : [])
    .slice(0, MAX_ROUTE_POINTS)
    .map((p) => {
      const po = asRec(p);
      return { x: round2(clampNum(po.x, 0, 100, 50)), y: round2(clampNum(po.y, 0, 100, 50)) };
    });
  if (route.length < 2) route = [];

  // 关卡:逐个经注册表归一化 → 按 t 升序 → gate 可行性剔除(computeGates 单调修正后越界的丢弃)
  const cpsRaw = (Array.isArray(boardIn.checkpoints) ? boardIn.checkpoints : [])
    .map(normalizeCheckpoint)
    .filter((c): c is Checkpoint => !!c)
    .sort((a, b) => a.t - b.t)
    .slice(0, 20);
  const gates = computeGates(cpsRaw, totalSteps);
  const checkpoints = cpsRaw.filter((_, i) => gates[i] <= totalSteps);

  const sprites = (Array.isArray(boardIn.sprites) ? boardIn.sprites : [])
    .map(fid)
    .filter((x): x is string => !!x)
    .slice(0, 8);

  const bgW = clampInt(asRec(boardIn.bgSize).w, 1, 20000, 0);
  const bgH = clampInt(asRec(boardIn.bgSize).h, 1, 20000, 0);

  const design: RouteRaceDesign = {
    version: 1,
    durationSec: clampInt(o.durationSec, 5, 1800, DEFAULT_DURATION_SEC),
    board: {
      route,
      totalSteps,
      checkpoints,
      sprites,
      spriteSizePct: clampNum(boardIn.spriteSizePct, 2, 30, 8),
    },
    lobby: {},
    award: { avatarBehind: awardIn.avatarBehind !== false },
  };

  const boardBg = fid(boardIn.backgroundFileId);
  if (boardBg) design.board.backgroundFileId = boardBg;
  if (bgW > 0 && bgH > 0) design.board.bgSize = { w: bgW, h: bgH };

  const lobbyBg = fid(lobbyIn.backgroundFileId);
  if (lobbyBg) design.lobby.backgroundFileId = lobbyBg;
  const lobbyTitle = str(lobbyIn.title, 60);
  if (lobbyTitle) design.lobby.title = lobbyTitle;

  const podium = fid(awardIn.podiumFileId);
  if (podium) design.award.podiumFileId = podium;
  const frames = normFrames(awardIn.frames);
  if (frames) design.award.frames = frames;

  const remoteBg = fid(o.remoteBgFileId);
  if (remoteBg) design.remoteBgFileId = remoteBg;

  // 音效:设计里存初值(编辑器可编);添加为节目时 service 会另行 normalizeGameSound 拼顶层
  if (o.sound !== undefined) design.sound = normalizeGameSound(o.sound);

  return design;
}

/**
 * 收集设计引用的全部 storage fileId —— 孤儿 GC 在用集合的**单一事实源**。
 * InteractiveGameDesign.configJson 与 route_race 节目的 InteractiveGame.configJson 两处都靠它;
 * 设计新增 fileId 字段只改这一处(+normalize),否则素材 30 天后被孤儿回收误删。
 */
export function collectDesignFileIds(design: RouteRaceDesign): string[] {
  const ids: string[] = [];
  const push = (v: string | undefined): void => {
    if (v) ids.push(v);
  };
  push(design.board.backgroundFileId);
  push(design.lobby.backgroundFileId);
  push(design.award.podiumFileId);
  push(design.remoteBgFileId);
  for (const s of design.board.sprites) push(s);
  for (const cp of design.board.checkpoints) {
    for (const f of CHECKPOINT_KINDS[cp.kind].collectFileIds(cp)) push(f);
  }
  for (const eff of Object.values(design.sound?.effects ?? {})) push(eff.fileId);
  return ids;
}
