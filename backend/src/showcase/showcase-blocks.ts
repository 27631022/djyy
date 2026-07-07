import { BadRequestException } from '@nestjs/common';

/**
 * 先锋晒场「展示工具」区块注册表(与前端 react/src/features/showcase/tools/ 对称)。
 * 晒台台头(introBlocksJson)与参晒作品(blocksJson)存的都是 ShowcaseBlock[] JSON。
 *
 * 每种工具一条 spec:
 *   - normalize:**白名单重建** content —— 只拷已知键、trim + 长度上限、数字 Number.isFinite,
 *     丢弃未知键(防存储注入);必填缺失/非法抛 BadRequestException。
 *   - collectFileIds:该区块引用的 storage fileId(GC「在用集合」+ 删除联动的深收集)。
 * **加新工具 = 这里加一条 spec + 前端 tools/<type>.tsx 加实现并在 registry 注册一行**;
 * normalize 与 fileId 收集同文件同 PR,GC 不会漏。
 */
export type ShowcaseBlockType =
  | 'compare' // 前后对比图(转变前/后 + 拖拽滑杆)
  | 'spot' // 局部图(指定拍摄角度,单张/多张)
  | 'pano360' // 360° 全景图
  | 'ranking' // 排行榜(手动录入清单)
  | 'video' // 视频
  | 'metric' // 指标卡(大数字 + 同比/环比)
  | 'trend' // 趋势图(折线/柱状)
  | 'timeline' // 时间轴
  | 'story'; // 图文故事卡(markdown)

export interface ShowcaseBlock {
  id: string;
  type: ShowcaseBlockType;
  content: Record<string, unknown>;
}

interface BlockSpec {
  normalize(raw: Record<string, unknown>, label: string): Record<string, unknown>;
  collectFileIds?(content: Record<string, unknown>): string[];
}

/* ─── 归一化小工具(纯函数) ─── */

/** cuid 形状校验(不查库:上传本就走本模块端点;伪造最坏=404 图,公开口有 ownerModule 白名单) */
const FILE_ID_RE = /^[a-z0-9]{20,32}$/i;

function optStr(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return s ? s.slice(0, max) : undefined;
}

function reqStr(v: unknown, max: number, what: string): string {
  const s = optStr(v, max);
  if (!s) throw new BadRequestException(what);
  return s;
}

function reqFileId(v: unknown, what: string): string {
  if (typeof v !== 'string' || !FILE_ID_RE.test(v)) throw new BadRequestException(what);
  return v;
}

function optFileId(v: unknown): string | undefined {
  return typeof v === 'string' && FILE_ID_RE.test(v) ? v : undefined;
}

function reqNum(v: unknown, what: string): number {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new BadRequestException(what);
  return n;
}

/** 可选整数,夹取 [min,max];非法/缺失返回 undefined */
function optIntClamp(v: unknown, min: number, max: number): number | undefined {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return undefined;
  return Math.min(Math.max(Math.floor(n), min), max);
}

function reqItems(v: unknown, min: number, max: number, label: string): Record<string, unknown>[] {
  if (!Array.isArray(v) || v.length < min) {
    throw new BadRequestException(`区块「${label}」至少需要 ${min} 项内容`);
  }
  if (v.length > max) throw new BadRequestException(`区块「${label}」内容过多(上限 ${max} 项)`);
  return v.map((it, i) => {
    if (typeof it !== 'object' || it === null) {
      throw new BadRequestException(`区块「${label}」第 ${i + 1} 项格式错误`);
    }
    return it as Record<string, unknown>;
  });
}

/* ─── 工具注册表 ─── */

const BLOCK_SPECS: Record<ShowcaseBlockType, BlockSpec> = {
  compare: {
    normalize(raw, label) {
      return {
        beforeFileId: reqFileId(raw.beforeFileId, `区块「${label}」缺少「转变前」照片`),
        afterFileId: reqFileId(raw.afterFileId, `区块「${label}」缺少「转变后」照片`),
        beforeLabel: optStr(raw.beforeLabel, 20),
        afterLabel: optStr(raw.afterLabel, 20),
        caption: optStr(raw.caption, 500),
      };
    },
    collectFileIds: (c) => [c.beforeFileId, c.afterFileId].filter((x): x is string => typeof x === 'string'),
  },

  spot: {
    normalize(raw, label) {
      const items = reqItems(raw.items, 1, 20, label).map((it, i) => ({
        fileId: reqFileId(it.fileId, `区块「${label}」第 ${i + 1} 张缺少照片`),
        angle: optStr(it.angle, 50),
        caption: optStr(it.caption, 300),
      }));
      return { items };
    },
    collectFileIds: (c) =>
      (Array.isArray(c.items) ? c.items : [])
        .map((it) => (it as Record<string, unknown>).fileId)
        .filter((x): x is string => typeof x === 'string'),
  },

  pano360: {
    normalize(raw, label) {
      return {
        fileId: reqFileId(raw.fileId, `区块「${label}」缺少全景照片`),
        caption: optStr(raw.caption, 300),
        initialYaw: optIntClamp(raw.initialYaw, -180, 180),
      };
    },
    collectFileIds: (c) => (typeof c.fileId === 'string' ? [c.fileId] : []),
  },

  ranking: {
    normalize(raw, label) {
      const items = reqItems(raw.items, 1, 100, label).map((it, i) => ({
        name: reqStr(it.name, 50, `区块「${label}」第 ${i + 1} 行缺少名称`),
        value: reqNum(it.value, `区块「${label}」第 ${i + 1} 行数值无效`),
      }));
      const order = raw.order === 'asc' ? 'asc' : 'desc';
      return {
        title: optStr(raw.title, 50),
        unit: optStr(raw.unit, 12),
        decimals: optIntClamp(raw.decimals, 0, 4),
        order,
        items,
      };
    },
  },

  video: {
    normalize(raw, label) {
      return {
        fileId: reqFileId(raw.fileId, `区块「${label}」缺少视频文件`),
        posterFileId: optFileId(raw.posterFileId),
        caption: optStr(raw.caption, 300),
      };
    },
    collectFileIds: (c) =>
      [c.fileId, c.posterFileId].filter((x): x is string => typeof x === 'string'),
  },

  metric: {
    normalize(raw, label) {
      let compare: Record<string, unknown> | undefined;
      if (typeof raw.compare === 'object' && raw.compare !== null) {
        const cmp = raw.compare as Record<string, unknown>;
        const type = cmp.type === 'mom' ? 'mom' : cmp.type === 'yoy' ? 'yoy' : undefined;
        const pct = typeof cmp.pct === 'number' && Number.isFinite(cmp.pct) ? cmp.pct : undefined;
        if (type && pct !== undefined) compare = { type, pct };
      }
      return {
        label: reqStr(raw.label, 30, `区块「${label}」缺少指标名称`),
        value: reqNum(raw.value, `区块「${label}」数值无效`),
        unit: optStr(raw.unit, 12),
        decimals: optIntClamp(raw.decimals, 0, 4),
        compare,
        note: optStr(raw.note, 300),
      };
    },
  },

  trend: {
    normalize(raw, label) {
      const points = reqItems(raw.points, 2, 60, label).map((it, i) => ({
        label: reqStr(it.label, 30, `区块「${label}」第 ${i + 1} 个数据点缺少标签`),
        value: reqNum(it.value, `区块「${label}」第 ${i + 1} 个数据点数值无效`),
      }));
      return {
        title: optStr(raw.title, 50),
        chart: raw.chart === 'bar' ? 'bar' : 'line',
        unit: optStr(raw.unit, 12),
        decimals: optIntClamp(raw.decimals, 0, 4),
        points,
      };
    },
  },

  timeline: {
    normalize(raw, label) {
      const items = reqItems(raw.items, 1, 50, label).map((it, i) => ({
        date: reqStr(it.date, 20, `区块「${label}」第 ${i + 1} 个节点缺少时间`),
        title: reqStr(it.title, 100, `区块「${label}」第 ${i + 1} 个节点缺少标题`),
        description: optStr(it.description, 1000),
        fileId: optFileId(it.fileId),
      }));
      return { items };
    },
    collectFileIds: (c) =>
      (Array.isArray(c.items) ? c.items : [])
        .map((it) => (it as Record<string, unknown>).fileId)
        .filter((x): x is string => typeof x === 'string'),
  },

  story: {
    normalize(raw, label) {
      const markdown = optStr(raw.markdown, 50_000);
      if (!markdown) throw new BadRequestException(`区块「${label}」正文为空`);
      // XSS 由前端 MarkdownView 的 rehype-sanitize 白名单兜(与 knowledge 同栈),后端不解析
      return { markdown };
    },
  },
};

/** 支持的工具类型(由注册表键派生) */
export const SHOWCASE_BLOCK_TYPES = Object.keys(BLOCK_SPECS) as ShowcaseBlockType[];

/** 工具中文名(错误信息用;展示名以前端注册表为准) */
const BLOCK_LABEL: Record<ShowcaseBlockType, string> = {
  compare: '前后对比图',
  spot: '局部图',
  pano360: '360°全景',
  ranking: '排行榜',
  video: '视频',
  metric: '指标卡',
  trend: '趋势图',
  timeline: '时间轴',
  story: '图文故事',
};

const BLOCK_ID_RE = /^[a-z0-9_-]{4,40}$/i;

/**
 * 校验并规整一组区块。返回干净的 ShowcaseBlock[](保持数组顺序;id 不合法则按序重发)。
 * 非法直接抛 BadRequestException(带工具中文名 + 第几块,前端 toast 可直读)。
 */
export function normalizeBlocks(raw: unknown, opts: { max: number; what: string }): ShowcaseBlock[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new BadRequestException(`${opts.what}的区块必须是数组`);
  if (raw.length > opts.max) {
    throw new BadRequestException(`${opts.what}的区块过多(上限 ${opts.max} 块)`);
  }
  const seen = new Set<string>();
  return raw.map((item, idx) => {
    if (typeof item !== 'object' || item === null) {
      throw new BadRequestException(`第 ${idx + 1} 个区块格式错误`);
    }
    const b = item as Record<string, unknown>;
    const type = b.type as ShowcaseBlockType;
    if (!SHOWCASE_BLOCK_TYPES.includes(type)) {
      throw new BadRequestException(`第 ${idx + 1} 个区块的工具类型 "${String(b.type)}" 不支持`);
    }
    let id = typeof b.id === 'string' && BLOCK_ID_RE.test(b.id) ? b.id : `blk_${idx + 1}`;
    while (seen.has(id)) id = `${id}_x`;
    seen.add(id);
    const label = `${BLOCK_LABEL[type]}(第 ${idx + 1} 块)`;
    const content =
      typeof b.content === 'object' && b.content !== null
        ? (b.content as Record<string, unknown>)
        : {};
    return { id, type, content: BLOCK_SPECS[type].normalize(content, label) };
  });
}

/** 安全解析存库的区块 JSON → ShowcaseBlock[](坏 JSON 返回 []) */
export function parseBlocks(json: string | null | undefined): ShowcaseBlock[] {
  if (!json) return [];
  try {
    const v: unknown = JSON.parse(json);
    return Array.isArray(v) ? (v as ShowcaseBlock[]) : [];
  } catch {
    return [];
  }
}

/** 深收集区块 JSON 里引用的全部 storage fileId(GC 在用集合 / 删除联动用) */
export function collectBlocksFileIds(json: string | null | undefined): string[] {
  const out: string[] = [];
  for (const b of parseBlocks(json)) {
    const spec = BLOCK_SPECS[b.type];
    if (spec?.collectFileIds && typeof b.content === 'object' && b.content !== null) {
      out.push(...spec.collectFileIds(b.content));
    }
  }
  return out;
}
