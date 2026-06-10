import * as XLSX from 'xlsx';

/**
 * 与会人(导入名单的一行)。跨模块松引用:这里只存名字/单位/职务/评分等明文,
 * 不强绑 User —— 名单常来自外部 Excel,不一定都是系统用户。
 */
export interface Attendee {
  id: string;
  name: string;
  empNo?: string;
  unit?: string;
  position?: string;
  /** 评分(分高排前);算分引擎延后,先用导入列 */
  score?: number;
  /** 分组/类别(机关/基层/领奖…),排座分区匹配键 */
  group?: string;
  /** 特殊身份(来宾/记者/列席/工作人员…,字典 venue_special_type);非空=不参与自动排座、待手动指定座 */
  special?: string;
  /** 固定座(占位,V2.3 用) */
  fixed?: boolean;
}

/** 容错表头映射:中文原文 + 英文小写 → 字段 */
const HEADER_MAP: Record<string, keyof Attendee> = {
  姓名: 'name',
  名字: 'name',
  name: 'name',
  工号: 'empNo',
  员工编号: 'empNo',
  编号: 'empNo',
  empno: 'empNo',
  单位: 'unit',
  部门: 'unit',
  所在单位: 'unit',
  unit: 'unit',
  职务: 'position',
  职位: 'position',
  position: 'position',
  评分: 'score',
  分数: 'score',
  积分: 'score',
  score: 'score',
  分组: 'group',
  类别: 'group',
  组别: 'group',
  group: 'group',
};

function resolveField(key: string): keyof Attendee | undefined {
  const raw = key.trim();
  return HEADER_MAP[raw] ?? HEADER_MAP[raw.toLowerCase()];
}

/**
 * 解析名单文件(.xlsx / .xls / .csv)→ Attendee[]。
 *
 * 取第一个 sheet。**不直接把第一行当表头** —— 真实单位的名单第一行常是合并的大标题
 * (如「XX单位参会人员名单」),旧逻辑会把标题行当表头、找不到「姓名」列 → 0 人 →
 * 报「没解析到人员」。改为:读成二维数组,扫描前若干行、定位「含姓名列」的那一行作表头
 * (姓名是必备列),其上的标题/空行自动跳过、无关列(如「序号」)自动忽略;表头下逐行成人。
 */
export function parseRosterBuffer(buffer: Buffer): Attendee[] {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
  if (!matrix.length) return [];

  // 表头行 = 前 15 行里第一行「有一列能映射到姓名」的行
  const SCAN = Math.min(matrix.length, 15);
  let headerRow = -1;
  for (let i = 0; i < SCAN; i++) {
    const row = matrix[i] ?? [];
    if (row.some((cell) => resolveField(String(cell ?? '')) === 'name')) {
      headerRow = i;
      break;
    }
  }
  if (headerRow < 0) return []; // 没有「姓名」表头列,无法解析

  // 列索引 → 字段
  const colField = new Map<number, keyof Attendee>();
  (matrix[headerRow] ?? []).forEach((cell, ci) => {
    const f = resolveField(String(cell ?? ''));
    if (f) colField.set(ci, f);
  });

  const out: Attendee[] = [];
  for (let i = headerRow + 1; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    const att: Attendee = { id: `a${out.length + 1}`, name: '' };
    for (const [ci, field] of colField) {
      const s = String(row[ci] ?? '').trim();
      if (!s) continue;
      if (field === 'score') {
        const n = parseFloat(s);
        if (Number.isFinite(n)) att.score = n;
      } else if (field === 'name') att.name = s;
      else if (field === 'empNo') att.empNo = s;
      else if (field === 'unit') att.unit = s;
      else if (field === 'position') att.position = s;
      else if (field === 'group') att.group = s;
    }
    if (att.name) out.push(att);
  }
  return out;
}

/** 规整前端回传的名单(编辑后保存):重排 id、清洗类型,丢弃无名字行 */
export function normalizeRoster(input: unknown): Attendee[] {
  if (!Array.isArray(input)) return [];
  const out: Attendee[] = [];
  const seen = new Set<string>();
  input.forEach((raw, i) => {
    if (!raw || typeof raw !== 'object') return;
    const r = raw as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    if (!name) return;
    // 保留前端传入的 id(稳定标识)。原来无条件按下标重排成 a{i+1},会让排座结果
    // assignment.attendeeId 与 roster.id 脱钩(图上有人却报「未排上 N 人」)。
    // 仅在缺失/重复时才生成兜底 id。
    let id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : `a${i + 1}`;
    while (seen.has(id)) id = `a${i + 1}_${seen.size}`;
    seen.add(id);
    const att: Attendee = { id, name };
    if (typeof r.empNo === 'string' && r.empNo.trim()) att.empNo = r.empNo.trim();
    if (typeof r.unit === 'string' && r.unit.trim()) att.unit = r.unit.trim();
    if (typeof r.position === 'string' && r.position.trim()) att.position = r.position.trim();
    if (typeof r.group === 'string' && r.group.trim()) att.group = r.group.trim();
    if (typeof r.special === 'string' && r.special.trim()) att.special = r.special.trim();
    const score = typeof r.score === 'number' ? r.score : parseFloat(String(r.score ?? ''));
    if (Number.isFinite(score)) att.score = score;
    if (r.fixed === true) att.fixed = true;
    out.push(att);
  });
  return out;
}

export function parseRosterJson(json: string | null | undefined): Attendee[] {
  if (!json) return [];
  try {
    return normalizeRoster(JSON.parse(json));
  } catch {
    return [];
  }
}
