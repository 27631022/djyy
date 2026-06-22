import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type ReportLine, type ReportSubmission } from '@prisma/client';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';
import { OrganizationService } from '../organization';
import { UserService } from '../user';
import { RoleService } from '../role';
import { parseFields, type ReportField } from './report-fields';
import { SaveSubmissionDto } from './dto/save-submission.dto';
import { ReviewSubmissionDto } from './dto/review-submission.dto';

interface ActorContext {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

/** catalog_pick 填报值(点选商品落的清单快照)。supplier/taxRate/minOrderQty/contact 用于保全清单完整信息。 */
interface CatalogPick {
  catalogItemId?: string;
  productName?: string;
  spec?: string | null;
  category?: string | null;
  categoryDesc?: string | null;
  recommendOrg?: string | null;
  origin?: string | null;
  supplier?: string | null; // 清单供应商(非发票销售方)
  taxRate?: string | null;
  minOrderQty?: string | null;
  contact?: string | null;
  unitPriceCents?: number | null;
}

/** 映射出的一条明细行(→ ReportLine)。 */
interface MappedLine {
  productName: string;
  spec: string | null;
  category: string | null;
  categoryDesc: string | null;
  recommendOrg: string | null;
  origin: string | null;
  catalogSupplier: string | null;
  unitPriceCents: number | null;
  catalogItemId: string | null;
  amountCents: number;
  feeSource: string;
  qty: number | null;
  extraJson: string;
}

const isEmpty = (v: unknown): boolean =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

const fileIdOf = (v: unknown): string | null => {
  if (Array.isArray(v) && v[0] && typeof v[0] === 'object') {
    const id = (v[0] as { id?: unknown }).id;
    return typeof id === 'string' ? id : null;
  }
  return null;
};

/** 从已映射明细的 extraJson 里读出税额(分);无则 0。 */
const taxCentsOfLine = (l: MappedLine): number => {
  try {
    return Number((JSON.parse(l.extraJson) as { taxCents?: unknown }).taxCents) || 0;
  } catch {
    return 0;
  }
};

// 金额一律存「分」(Int32)。单行 2000 万元上限(对齐 report-catalog.import 的 MAX_PRICE_CENTS),
// 合计 Int32 上限 —— 防越界写库抛 P2023/22003(否则 catch 只认 P2002 → 裸 500)。
const MAX_LINE_CENTS = 2_000_000_000; // 2000 万元/行
const MAX_TOTAL_CENTS = 2_147_483_647; // Int32 上限

/**
 * 报送录入(master-detail)。一个派发对象可录**多张发票**(ReportSubmission,无 @unique),
 * 每张 = 头(发票号/日期/共享发票·合同文件)+ N 行明细(ReportLine,产品快照/金额/费用来源 = 结构化列)。
 * formData 按字段 role 映射:invoiceNo/purchaseDate/invoiceFile/contractFile + detail_table→lines。
 * 详见 docs/specs/2026-06-16-report-platform.md。
 */
@Injectable()
export class ReportSubmissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly orgs: OrganizationService,
    private readonly users: UserService,
    private readonly roles: RoleService,
  ) {}

  /* ─── 填报页数据(承办人侧)─── */
  async getFill(targetId: string, actor: ActorContext) {
    const actorId = actor.actorId;
    if (!actorId) throw new BadRequestException('缺少操作者身份');
    const target = await this.prisma.reportTarget.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('派发对象不存在');
    if (target.ownerUserId !== actorId)
      throw new ForbiddenException('只有承办人可以录入(请先在「我的待办」接收)');
    const task = await this.prisma.reportTask.findUnique({ where: { id: target.taskId } });
    if (!task) throw new NotFoundException('报送任务不存在');

    const [dispatchUser, dispatchOrg, unitOrg, submissions] = await Promise.all([
      this.users.findOne(task.dispatchUserId).catch(() => null),
      task.dispatchOrgId ? this.orgs.findOne(task.dispatchOrgId).catch(() => null) : Promise.resolve(null),
      target.targetOrgId ? this.orgs.findOne(target.targetOrgId).catch(() => null) : Promise.resolve(null),
      this.loadSubmissions(targetId),
    ]);

    return {
      targetId,
      taskId: task.id,
      taskTitle: task.title,
      notes: task.notes,
      dueAt: task.dueAt,
      noticeFileId: task.noticeFileId,
      noticeFileName: task.noticeFileName,
      catalogTag: task.catalogTag,
      fields: parseFields(task.fieldsJson),
      targetStatus: target.status,
      unitOrgName: unitOrg?.name ?? null,
      dispatchOrgName: dispatchOrg?.name ?? null,
      dispatchUserName: dispatchUser?.name ?? null,
      dispatchUserPhone: dispatchUser?.phone ?? null,
      submissions,
    };
  }

  /** 该对象的全部发票(头 + 明细行),供填报页 + 审核展示(已映射:含 taxCents / totalTaxCents / discrepancyNote)。 */
  private async loadSubmissions(targetId: string) {
    const rows = await this.prisma.reportSubmission.findMany({
      where: { targetId },
      orderBy: { seq: 'asc' },
      include: { lines: { orderBy: { lineNo: 'asc' } } },
    });
    return rows.map((r) => this.mapSubmissionRow(r));
  }

  /** 列出某对象的发票(承办人 / 派发人 / 管理员可看)。 */
  async listSubmissions(targetId: string, actor: ActorContext) {
    const actorId = actor.actorId;
    if (!actorId) throw new BadRequestException('缺少操作者身份');
    const target = await this.prisma.reportTarget.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('派发对象不存在');
    const task = await this.prisma.reportTask.findUnique({ where: { id: target.taskId } });
    if (!task) throw new NotFoundException('报送任务不存在');
    await this.assertCanView(actorId, target.ownerUserId, task.dispatchUserId);
    return this.loadSubmissions(targetId);
  }

  /* ─── 录入一张发票(头 + 明细)─── */
  async saveSubmission(targetId: string, dto: SaveSubmissionDto, actor: ActorContext) {
    const actorId = actor.actorId;
    if (!actorId) throw new BadRequestException('缺少操作者身份');
    const target = await this.prisma.reportTarget.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('派发对象不存在');
    if (target.ownerUserId !== actorId) throw new ForbiddenException('只有承办人可以录入');
    const task = await this.prisma.reportTask.findUnique({ where: { id: target.taskId } });
    if (!task) throw new NotFoundException('报送任务不存在');

    const fields = parseFields(task.fieldsJson);
    const formData = (dto.formData ?? {}) as Record<string, unknown>;
    const mapped = this.mapSubmission(fields, formData);

    // ── 自动审批判定(权威,后端算)──
    // 规则:每条明细金额都能在发票上找到对应行(价税合计,多重集匹配)+ 全部命中扶贫目录
    //   → 系统直接判定通过(approved);否则转人工审核(submitted)。发票总额可以不等
    //   (一张发票可只上报其中的扶贫明细)。详见 docs/specs/2026-06-16-report-platform.md。
    const verdict = this.autoApproveVerdict(mapped.lines, dto.invoiceLines);

    // 头层备注:自动通过→记自动通过依据;转人工→把原因 + 提交人确认备注合并(审核页高亮)
    const headData: Record<string, unknown> = { ...mapped.headData };
    const discrepancy = dto.discrepancyNote?.trim();
    if (verdict.autoApprove) {
      headData.__autoApproved = true;
    } else {
      const merged = [verdict.reasons.join(';'), discrepancy].filter(Boolean).join(' | ');
      if (merged) headData.__discrepancyNote = merged.slice(0, 800);
    }
    const supplier = dto.supplier?.trim();
    if (supplier) headData.__supplier = supplier.slice(0, 200);

    // 校验:发票号必填(去重键)+ 必填字段
    if (!mapped.invoiceNo) throw new BadRequestException('请填写发票号');
    const missing: string[] = [];
    for (const f of fields) {
      if (!f.required) continue;
      if (f.type === 'detail_table') {
        if (mapped.lines.length === 0) missing.push(f.label);
      } else if (isEmpty(formData[f.code])) {
        missing.push(f.label);
      }
    }
    if (missing.length) throw new BadRequestException(`请先填写:${missing.join('、')}`);

    const unitOrg = target.targetOrgId ? await this.orgs.findOne(target.targetOrgId).catch(() => null) : null;
    const now = new Date();

    let created;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        // 发号:该对象下第几张(@@unique([targetId,seq]);SQLite 单写锁可保,PG 需 Serializable)
        const seq = (await tx.reportSubmission.count({ where: { targetId } })) + 1;
        const sub = await tx.reportSubmission.create({
          data: {
            taskId: target.taskId,
            targetId,
            seq,
            invoiceNo: mapped.invoiceNo,
            purchaseDate: mapped.purchaseDate ?? now,
            unitOrgId: target.targetOrgId,
            unitName: unitOrg?.name ?? null,
            totalAmountCents: mapped.totalAmountCents,
            invoiceFileId: mapped.invoiceFileId,
            contractFileId: mapped.contractFileId,
            headData: JSON.stringify(headData),
            status: verdict.autoApprove ? 'approved' : 'submitted',
            reviewNote: verdict.autoApprove
              ? '系统自动审核通过:明细金额与发票一致,且均在扶贫清单目录'
              : null,
            submittedById: actorId,
            submittedAt: now,
          },
        });
        if (mapped.lines.length) {
          await tx.reportLine.createMany({
            data: mapped.lines.map((l, i) => ({
              submissionId: sub.id,
              taskId: target.taskId,
              orgId: target.targetOrgId,
              lineNo: i + 1,
              supplier: supplier ?? null, // 发票销售方(一票一个)冗余到每行,便于按销售方 group-by
              ...l,
            })),
          });
        }
        return sub;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const fieldsHit = (e.meta?.target as string[] | undefined) ?? [];
        if (fieldsHit.includes('invoiceNo')) throw new BadRequestException(`发票号「${mapped.invoiceNo}」已录入过`);
        throw new BadRequestException('发号冲突,请重试');
      }
      // 金额越界(Int 列)兜底成友好 400,避免裸 500
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2023')
        throw new BadRequestException('金额超出范围,请核对后重录');
      throw e;
    }

    // 对象保持「填报中」,允许继续录多张发票
    if (target.status === 'pending') {
      await this.prisma.reportTarget.update({ where: { id: targetId }, data: { status: 'in_progress' } });
    }
    await this.audit.log({
      ...actor,
      action: verdict.autoApprove ? 'report.submission.auto-approve' : 'report.submission.create',
      target: created.id,
      detail: {
        taskId: target.taskId,
        invoiceNo: mapped.invoiceNo,
        lineCount: mapped.lines.length,
        totalAmountCents: mapped.totalAmountCents,
        autoApprove: verdict.autoApprove,
        reasons: verdict.reasons,
      },
    });
    const row = await this.prisma.reportSubmission.findUnique({
      where: { id: created.id },
      include: { lines: { orderBy: { lineNo: 'asc' } } },
    });
    return row ? this.mapSubmissionRow(row) : null;
  }

  /**
   * 自动审批判定。两条硬性条件全满足 → 自动通过:
   *  ① 每条上报明细都命中扶贫目录(catalogItemId 非空)——「清单内容包含在发票里」;
   *  ② 每条明细的金额(价税合计)都能在发票各行金额里找到对应(多重集匹配)——「单项金额对上」。
   * 任一不满足 → 转人工审核,并给出可读原因(存头层 __discrepancyNote 供审核高亮)。
   * 发票总额不参与判定(一张发票可只上报其中的扶贫明细,总额可不等)。
   */
  private autoApproveVerdict(
    lines: MappedLine[],
    invoiceLines: number[] | undefined,
  ): { autoApprove: boolean; reasons: string[] } {
    const reasons: string[] = [];
    if (lines.length === 0) return { autoApprove: false, reasons: ['无明细行'] };

    // ① 扶贫目录命中
    const unmatched = lines.filter((l) => !l.catalogItemId).length;
    if (unmatched > 0) reasons.push(`${unmatched} 项不在扶贫清单目录(需人工核定对应商品)`);

    // ② 单项金额与发票对上(价税合计,分;多重集消费,避免一行发票被多条明细复用)
    if (!invoiceLines || invoiceLines.length === 0) {
      reasons.push('未经发票识别,金额无法与发票自动比对');
    } else {
      const pool = invoiceLines.map((y) => Math.round(Number(y) * 100)).filter((c) => Number.isFinite(c));
      let amountBad = 0;
      for (const l of lines) {
        const cents = l.amountCents + taxCentsOfLine(l); // 价税合计
        const i = pool.findIndex((x) => x === cents);
        if (i < 0) amountBad++;
        else pool.splice(i, 1);
      }
      if (amountBad > 0) reasons.push(`${amountBad} 项明细金额与发票不一致`);
    }
    return { autoApprove: reasons.length === 0, reasons };
  }

  /** 删除一张发票(承办人;人工已通过的不可删,系统自动通过的允许承办人删改重录)。级联删明细行。 */
  async deleteSubmission(submissionId: string, actor: ActorContext) {
    const actorId = actor.actorId;
    if (!actorId) throw new BadRequestException('缺少操作者身份');
    const sub = await this.prisma.reportSubmission.findUnique({ where: { id: submissionId } });
    if (!sub) throw new NotFoundException('发票记录不存在');
    const target = await this.prisma.reportTarget.findUnique({ where: { id: sub.targetId } });
    if (target?.ownerUserId !== actorId) throw new ForbiddenException('只有承办人可以删除自己的录入');
    // 人工审核通过的不可删;系统自动通过的(__autoApproved)允许承办人删除重录,避免误判被锁死
    if (sub.status === 'approved' && !this.parseJsonObj(sub.headData).__autoApproved)
      throw new BadRequestException('已通过审核的发票不能删除');
    await this.prisma.reportSubmission.delete({ where: { id: submissionId } }); // 明细 onDelete: Cascade
    await this.audit.log({ ...actor, action: 'report.submission.delete', target: submissionId, detail: { taskId: sub.taskId, invoiceNo: sub.invoiceNo } });
    return { ok: true };
  }

  /* ─── 审核(派发人 / 管理员)─── */
  async reviewSubmission(submissionId: string, dto: ReviewSubmissionDto, actor: ActorContext) {
    const actorId = actor.actorId;
    if (!actorId) throw new BadRequestException('缺少操作者身份');
    const sub = await this.prisma.reportSubmission.findUnique({ where: { id: submissionId } });
    if (!sub) throw new NotFoundException('发票记录不存在');
    const task = await this.prisma.reportTask.findUnique({ where: { id: sub.taskId } });
    if (!task) throw new NotFoundException('报送任务不存在');
    const { isPlatformAdmin } = await this.roles.getScopesForPermission(actorId, 'report:manage');
    if (task.dispatchUserId !== actorId && !isPlatformAdmin)
      throw new ForbiddenException('只有派发人或管理员可以审核');
    if (sub.status !== 'submitted') throw new BadRequestException('只有「已提交」的发票可以审核');

    const isReturn = dto.decision === 'return';
    const note = dto.note?.trim() || null;
    if (isReturn && !note) throw new BadRequestException('退回必须填写原因');

    const updated = await this.prisma.reportSubmission.update({
      where: { id: submissionId },
      data: {
        status: isReturn ? 'returned' : 'approved',
        reviewNote: note,
        ...(isReturn ? { returnCount: { increment: 1 } } : {}),
      },
    });
    await this.audit.log({ ...actor, action: isReturn ? 'report.submission.return' : 'report.submission.approve', target: submissionId, detail: { taskId: sub.taskId, note } });
    return { ok: true, status: updated.status };
  }

  /* ─── 映射 formData → 头 + 明细行(按字段 role)─── */
  private mapSubmission(fields: ReportField[], formData: Record<string, unknown>) {
    let invoiceNo = '';
    let purchaseDate: Date | null = null;
    let invoiceFileId: string | null = null;
    let contractFileId: string | null = null;
    let headFeeSource: string | null = null;
    const headData: Record<string, unknown> = {};
    let lines: MappedLine[] = [];

    for (const f of fields) {
      const v = formData[f.code];
      if (f.type === 'detail_table') {
        lines = this.mapLines(f, v);
        continue;
      }
      switch (f.role) {
        case 'invoiceNo':
          invoiceNo = v == null ? '' : String(v).trim();
          break;
        case 'purchaseDate':
          if (typeof v === 'string' && v) {
            const d = new Date(v);
            if (!Number.isNaN(d.getTime())) purchaseDate = d;
          }
          break;
        case 'invoiceFile':
          invoiceFileId = fileIdOf(v);
          break;
        case 'contractFile':
          contractFileId = fileIdOf(v);
          break;
        case 'feeSource':
          // 头层费用来源(一张发票一个)
          headFeeSource = v == null ? '' : String(v).trim();
          if (headFeeSource) headData[f.code] = headFeeSource;
          break;
        default:
          if (!isEmpty(v)) headData[f.code] = v;
      }
    }
    // 头层费用来源 → 套用到每条明细(供考核按 ReportLine.feeSource 汇总;一张发票内统一)
    if (headFeeSource) lines = lines.map((l) => ({ ...l, feeSource: headFeeSource! }));
    const totalAmountCents = lines.reduce((s, l) => s + l.amountCents, 0); // 不含税合计
    if (totalAmountCents > MAX_TOTAL_CENTS)
      throw new BadRequestException('单张发票合计金额过大,请拆分录入');
    const totalTaxCents = lines.reduce((s, l) => s + taxCentsOfLine(l), 0);
    if (totalTaxCents > 0) headData.__totalTaxCents = totalTaxCents;
    return { invoiceNo, purchaseDate, invoiceFileId, contractFileId, headData, lines, totalAmountCents, totalTaxCents };
  }

  private mapLines(field: ReportField, value: unknown): MappedLine[] {
    const rows = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
    const cols = field.columns ?? [];
    const productCol = cols.find((c) => c.role === 'product');
    const amountCol = cols.find((c) => c.role === 'amount');
    const feeCol = cols.find((c) => c.role === 'feeSource');
    const qtyCol = cols.find((c) => c.role === 'qty');
    const taxCol = cols.find((c) => c.role === 'tax');
    const out: MappedLine[] = [];

    rows.forEach((row, idx) => {
      const pick = productCol && row[productCol.code] && typeof row[productCol.code] === 'object'
        ? (row[productCol.code] as CatalogPick)
        : null;
      const amountRaw = amountCol ? row[amountCol.code] : undefined;
      const hasProduct = !!pick && !!pick.productName;
      const hasAmount = !isEmpty(amountRaw);
      // 空行判定:产品/金额都没 且 其余列也都空 才算空。任一列有内容即保留 —— 支持无产品/无金额的通用报送
      const otherContent = cols.some((c) => c !== productCol && c !== amountCol && !isEmpty(row[c.code]));
      if (!hasProduct && !hasAmount && !otherContent) return; // 跳过完全空行

      if (productCol && !hasProduct) throw new BadRequestException(`明细第 ${idx + 1} 行未选商品`);
      const amountNum = Number(amountRaw);
      if (amountCol && (!hasAmount || !Number.isFinite(amountNum) || amountNum < 0))
        throw new BadRequestException(`明细第 ${idx + 1} 行金额无效`);
      const amountCents = hasAmount ? Math.round(amountNum * 100) : 0;
      if (!Number.isSafeInteger(amountCents) || amountCents > MAX_LINE_CENTS)
        throw new BadRequestException(`明细第 ${idx + 1} 行金额过大(单行上限 2000 万元)`);
      const feeSource = feeCol ? String(row[feeCol.code] ?? '').trim() : '';
      if (feeCol?.required && !feeSource) throw new BadRequestException(`明细第 ${idx + 1} 行未选费用来源`);

      // 税额(元→分);无列/留空=0。价税合计 = amountCents + taxCents(展示/汇总时算)
      let taxCents = 0;
      const taxRaw = taxCol ? row[taxCol.code] : undefined;
      if (!isEmpty(taxRaw)) {
        const taxNum = Number(taxRaw);
        if (!Number.isFinite(taxNum) || taxNum < 0)
          throw new BadRequestException(`明细第 ${idx + 1} 行税额无效`);
        taxCents = Math.round(taxNum * 100);
        if (!Number.isSafeInteger(taxCents) || taxCents > MAX_LINE_CENTS)
          throw new BadRequestException(`明细第 ${idx + 1} 行税额过大`);
      }

      const extra: Record<string, unknown> = {};
      for (const c of cols) {
        if (c === productCol || c === amountCol || c === feeCol || c === qtyCol || c === taxCol) continue;
        if (!isEmpty(row[c.code])) extra[c.code] = row[c.code];
      }
      // 税额随明细存进 extraJson(无需迁移);响应映射时还原成 taxCents 字段
      if (taxCents > 0) extra.taxCents = taxCents;
      // 清单完整快照:税率/起订量/联系方式等非维度字段存 extra.catalog(年度调整不丢历史信息)
      const catalogExtra: Record<string, unknown> = {};
      if (pick?.taxRate) catalogExtra.taxRate = String(pick.taxRate);
      if (pick?.minOrderQty) catalogExtra.minOrderQty = String(pick.minOrderQty);
      if (pick?.contact) catalogExtra.contact = String(pick.contact);
      if (Object.keys(catalogExtra).length) extra.catalog = catalogExtra;
      const qtyNum = qtyCol ? Number(row[qtyCol.code]) : NaN;
      out.push({
        productName: hasProduct ? String(pick!.productName) : '',
        spec: pick?.spec ?? null,
        category: pick?.category ?? null,
        categoryDesc: pick?.categoryDesc ?? null,
        recommendOrg: pick?.recommendOrg ?? null,
        origin: pick?.origin ?? null,
        catalogSupplier: pick?.supplier ?? null,
        unitPriceCents: typeof pick?.unitPriceCents === 'number' ? pick!.unitPriceCents : null,
        catalogItemId: pick?.catalogItemId ?? null,
        amountCents,
        feeSource,
        qty: Number.isFinite(qtyNum) ? Math.trunc(qtyNum) : null,
        extraJson: JSON.stringify(extra),
      });
    });
    return out;
  }

  /* ─── 响应映射:从 JSON 列还原 税额 / 价税合计 / 差异备注,并隐藏内部 JSON 字段 ─── */
  private parseJsonObj(s: string): Record<string, unknown> {
    try {
      const v: unknown = JSON.parse(s);
      return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  private mapLineRow(l: ReportLine) {
    const extra = this.parseJsonObj(l.extraJson);
    const cat = extra.catalog && typeof extra.catalog === 'object' ? (extra.catalog as Record<string, unknown>) : {};
    const str = (v: unknown) => (typeof v === 'string' ? v : null);
    return {
      id: l.id,
      lineNo: l.lineNo,
      productName: l.productName,
      spec: l.spec, // 规格(清单快照)
      category: l.category,
      categoryDesc: l.categoryDesc,
      recommendOrg: l.recommendOrg,
      origin: l.origin,
      catalogSupplier: l.catalogSupplier, // 清单供应商(快照)
      unitPriceCents: l.unitPriceCents,
      catalogItemId: l.catalogItemId,
      amountCents: l.amountCents, // 不含税
      taxCents: Number(extra.taxCents) || 0, // 税额(存于 extraJson)
      feeSource: l.feeSource,
      supplier: l.supplier, // 销售方(发票识别的实际销售单位,冗余到行)
      qty: l.qty,
      // 清单完整快照(税率/起订量/联系方式)
      taxRate: str(cat.taxRate),
      minOrderQty: str(cat.minOrderQty),
      contact: str(cat.contact),
    };
  }

  private mapSubmissionRow(sub: ReportSubmission & { lines: ReportLine[] }) {
    const head = this.parseJsonObj(sub.headData);
    return {
      id: sub.id,
      seq: sub.seq,
      invoiceNo: sub.invoiceNo,
      purchaseDate: sub.purchaseDate,
      unitName: sub.unitName,
      totalAmountCents: sub.totalAmountCents, // 不含税合计
      totalTaxCents: Number(head.__totalTaxCents) || 0, // 税额合计
      supplier: typeof head.__supplier === 'string' ? head.__supplier : null,
      discrepancyNote: typeof head.__discrepancyNote === 'string' ? head.__discrepancyNote : null,
      autoApproved: head.__autoApproved === true, // 系统自动通过(非人工)
      invoiceFileId: sub.invoiceFileId,
      contractFileId: sub.contractFileId,
      status: sub.status,
      reviewNote: sub.reviewNote,
      submittedAt: sub.submittedAt,
      returnCount: sub.returnCount,
      lines: (sub.lines ?? []).map((l) => this.mapLineRow(l)),
    };
  }

  private async assertCanView(actorId: string, ownerUserId: string | null, dispatchUserId: string) {
    if (ownerUserId === actorId || dispatchUserId === actorId) return;
    const { isPlatformAdmin } = await this.roles.getScopesForPermission(actorId, 'report:manage');
    if (!isPlatformAdmin) throw new ForbiddenException('无权查看该报送的录入');
  }
}
