import * as XLSX from 'xlsx';
import type { PrismaClient } from '@prisma/client';

/**
 * 报送目录(清单)导入 —— 纯函数,无 Nest 依赖,便于 HTTP 端点与一次性脚本复用。
 * 帮扶产品清单列(按表头关键词匹配,容忍空白/换行/列序变动):
 *   产品名称 / 推荐单位 / 产品规格 / 企业采购价(元) / 税率 / 起订量 / 联系方式 /
 *   类别 / 类别说明 / 供应商 / 产地 / 总序号 / 分序号
 */
export interface CatalogItemInput {
  totalSeq: number | null;
  subSeq: number | null;
  productName: string;
  spec: string | null;
  purchasePriceCents: number | null;
  taxRate: string | null;
  minOrderQty: string | null;
  contact: string | null;
  category: string;
  categoryDesc: string | null;
  supplier: string | null;
  recommendOrg: string | null;
  origin: string | null;
  dataJson: string;
}

type Field = keyof Omit<CatalogItemInput, 'dataJson'>;

const norm = (v: unknown) => String(v ?? '').replace(/\s+/g, '');

/** 表头单元格 → 字段名(关键词包含匹配;类别说明优先于类别)。 */
function fieldForHeader(header: string): Field | null {
  const h = norm(header);
  if (!h) return null;
  if (h.includes('产品名称') || h === '名称') return 'productName';
  if (h.includes('推荐单位')) return 'recommendOrg';
  if (h.includes('规格')) return 'spec';
  if (h.includes('采购价') || h.includes('单价')) return 'purchasePriceCents';
  if (h.includes('税率')) return 'taxRate';
  if (h.includes('起订量')) return 'minOrderQty';
  if (h.includes('联系方式') || h.includes('联系人')) return 'contact';
  if (h.includes('类别说明') || (h.includes('类别') && h.includes('说明'))) return 'categoryDesc';
  if (h.includes('类别') || h.includes('分类') || h.includes('部分')) return 'category';
  if (h.includes('供应商')) return 'supplier';
  if (h.includes('产地')) return 'origin';
  if (h.includes('总序号')) return 'totalSeq';
  if (h.includes('分序号')) return 'subSeq';
  return null;
}

const str = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
};
const intOf = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};
/** 元 → 分(四舍五入)。非数值/超出合理范围(>2千万元,疑似脏数据)→ null。价格是可空快照,丢弃无害。 */
const MAX_PRICE_CENTS = 2_000_000_000; // 2千万元
const cents = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const c = Math.round(n * 100);
  if (!Number.isSafeInteger(c) || Math.abs(c) > MAX_PRICE_CENTS) return null;
  return c;
};

/** 解析 xlsx Buffer → 清单行。取第一个工作表,首行为表头。productName 为空的行跳过。 */
export function parseCatalogBuffer(buffer: Buffer): CatalogItemInput[] {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });
  if (rows.length < 2) return [];

  const headers = rows[0] as unknown[];
  const colOf = {} as Partial<Record<Field, number>>;
  headers.forEach((h, idx) => {
    const f = fieldForHeader(String(h ?? ''));
    if (f && colOf[f] === undefined) colOf[f] = idx;
  });

  const at = (row: unknown[], f: Field): unknown =>
    colOf[f] === undefined ? undefined : row[colOf[f] as number];

  const out: CatalogItemInput[] = [];
  for (const row of rows.slice(1)) {
    if (!Array.isArray(row)) continue;
    const productName = str(at(row, 'productName'));
    if (!productName) continue; // 跳过空行 / 合计行
    out.push({
      totalSeq: intOf(at(row, 'totalSeq')),
      subSeq: intOf(at(row, 'subSeq')),
      productName,
      spec: str(at(row, 'spec')),
      purchasePriceCents: cents(at(row, 'purchasePriceCents')),
      taxRate: str(at(row, 'taxRate')),
      minOrderQty: str(at(row, 'minOrderQty')),
      contact: str(at(row, 'contact')),
      category: str(at(row, 'category')) ?? '未分类',
      categoryDesc: str(at(row, 'categoryDesc')),
      supplier: str(at(row, 'supplier')),
      recommendOrg: str(at(row, 'recommendOrg')),
      origin: str(at(row, 'origin')),
      dataJson: '{}',
    });
  }
  return out;
}

/**
 * 把解析出的清单整体写入 catalog(幂等:同 catalogTag 先清后灌)。
 * prisma 形参用 PrismaClient,PrismaService 结构兼容 → HTTP service 与脚本都能调。
 * createMany 分批(SQLite 参数上限)。
 */
export async function persistCatalog(
  prisma: PrismaClient,
  meta: { catalogTag: string; name: string; year?: number | null },
  items: CatalogItemInput[],
): Promise<{ catalogId: string; count: number }> {
  const catalog = await prisma.reportCatalog.upsert({
    where: { catalogTag: meta.catalogTag },
    create: { catalogTag: meta.catalogTag, name: meta.name, year: meta.year ?? null, active: true },
    update: { name: meta.name, year: meta.year ?? null, active: true },
  });
  // 幂等重导:先清旧行
  await prisma.reportCatalogItem.deleteMany({ where: { catalogTag: meta.catalogTag } });

  const BATCH = 500;
  for (let i = 0; i < items.length; i += BATCH) {
    const chunk = items.slice(i, i + BATCH).map((it) => ({
      ...it,
      catalogTag: meta.catalogTag,
      catalogId: catalog.id,
    }));
    await prisma.reportCatalogItem.createMany({ data: chunk });
  }
  return { catalogId: catalog.id, count: items.length };
}
