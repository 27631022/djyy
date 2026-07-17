import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Readable } from 'node:stream';
import JSZip from 'jszip';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';
import { StorageService } from '../storage';
import { IssueCertificateDto } from './dto/issue-certificate.dto';
import { IssueExternalCertificateDto } from './dto/external-certificate.dto';
import { AttachCertificateFileDto } from './dto/attach-file.dto';
import { RevokeCertificateDto } from './dto/revoke-certificate.dto';

interface IssueCtx {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

interface ListFilter {
  templateId?: string;
  source?: 'internal' | 'external';
  revoked?: boolean;
  batchKey?: string;
  recipientUserId?: string;
}

/** 补 0 到 3 位(最大 999 内显示美观,超出按位数自然展开)。总数段、序号段都用它 */
function pad3(n: number): string {
  return n.toString().padStart(3, '0');
}

function buildCertNo(
  yearLabel: string,
  honorCode: string,
  batchTotal: number,
  batchSeq: number,
): string {
  // 编号:{年}-{荣誉码}-{总数3位}-{序号3位},如 2026-QDJL-005-001
  return `${yearLabel}-${honorCode}-${pad3(batchTotal)}-${pad3(batchSeq)}`;
}

function buildBatchKey(
  yearLabel: string,
  honorCode: string,
  batchTotal: number,
): string {
  // 内部分组键 — 用原始 batchTotal(不补 0)。仅用于按批次聚合发号,不对外展示,
  // 故不随 certNo 显示格式变化(避免改格式后把在途批次重新分组/重新编号)。
  return `${yearLabel}-${honorCode}-${batchTotal}`;
}

/** 姓名比对前的归一化:去空白(公文给 2 字姓名垫空格对齐:「聂  伟」vs 库里「聂伟」) */
function foldName(s: string): string {
  return (s ?? '').replace(/\s+/g, '');
}

/**
 * 身份一致性闸 —— 「关联的 User」必须与「证书上要写的人」是同一个人。
 *
 * ★ 为什么必须有这一刀:落库时 individual 分支会用 userSnapshot.name/username
 *   **覆盖** DTO 传来的姓名/工号。也就是说一旦 recipientUserId 绑错人,
 *   证书正面、编号、PDF、公开验证页会**静默**变成另一个人,发证人在 UI 上
 *   看不到任何差异;而且错的人能在「我的证书」里搜到它,对的人永远搜不到,
 *   考核荣誉积分也会归到错误单位。发证后又没有改绑接口(只能作废重发)。
 *
 *   加了这一刀,误绑从「静默改写身份」变成「发证失败并说清原因」。
 *
 * 只在两边都提供了值时比对(工号可选,老数据/外部录入可能没有)。
 */
function assertIdentityMatches(
  dto: { recipientName?: string; recipientEmpNo?: string | null },
  u: { name: string; username: string },
): void {
  const dtoName = foldName(dto.recipientName ?? '');
  if (dtoName && foldName(u.name) !== dtoName) {
    throw new BadRequestException(
      `持证人信息与关联用户不符:证书上要写「${dto.recipientName}」,但关联的用户是「${u.name}」(员工编号 ${u.username})。请重新确认是哪一位,或清除关联后手工发证。`,
    );
  }
  const dtoEmpNo = (dto.recipientEmpNo ?? '').trim();
  if (dtoEmpNo && dtoEmpNo !== u.username) {
    throw new BadRequestException(
      `持证人员工编号与关联用户不符:证书上要写「${dtoEmpNo}」,但关联用户「${u.name}」的员工编号是「${u.username}」。请重新确认是哪一位。`,
    );
  }
}


@Injectable()
export class CertificateIssueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  /** 批量下载任务:token → {ids, exp}(内存、短时效)。供浏览器原生下载凭 token 拉 ZIP */
  private readonly bulkJobs = new Map<string, { ids: string[]; exp: number }>();

  /**
   * 发一张证书。
   *
   * 流程:
   *   1. 拉模板,校验 honorCode 必填
   *   2. (若有)拉关联 User,校验与证书上要写的人是同一个,并作为持证人快照来源
   *   3. 事务内取批次现存 max(batchSeq) + 1 算 batchSeq,超额拒绝
   *   4. 生成 certNo + publicToken,落库
   *   5. 写审计
   *
   * 并发:SQLite 单写者锁保证 count→insert 原子。PG 切过去要加 isolationLevel: 'Serializable'。
   */
  async issue(dto: IssueCertificateDto, ctx: IssueCtx) {
    // V4:本步「先发号建记录」—— 此时还没 PDF(pdfFileId/thumbnail 可空)。
    // 前端拿到真实 certNo 后再渲染 PDF、上传 storage、调 attachFile 回填,
    // 以此根除「占位编号烤进 PDF」(发号在渲染之前)。
    const template = await this.prisma.certificateTemplate.findUnique({
      where: { id: dto.templateId },
    });
    if (!template) throw new NotFoundException('模板不存在');
    if (!template.honorCode) {
      throw new BadRequestException(
        '模板未设置荣誉首字母代码(honorCode),无法生成证书编号。请先到模板编辑页补填。',
      );
    }
    const honorCode = template.honorCode;
    // V3:honorType 以模板为准(发证页类型不再让用户选,由模板带出);
    //     DTO 若另传则忽略 — 保证「同一模板下所有证书类型一致」
    const honorType: 'individual' | 'collective' =
      template.honorType === 'collective' ? 'collective' : 'individual';

    // 关联 User 的话拉一下做快照。
    // 集体荣誉恒不绑自然人(下方落库置 null),故连查都不查 —— 传了也当没传,不报错。
    let userSnapshot: { name: string; username: string } | null = null;
    if (honorType === 'individual' && dto.recipientUserId) {
      const u = await this.prisma.user.findUnique({
        where: { id: dto.recipientUserId },
      });
      if (!u) throw new NotFoundException('持证人用户不存在');
      assertIdentityMatches(dto, u);
      userSnapshot = { name: u.name, username: u.username };
    }

    const batchKey = buildBatchKey(dto.yearLabel, honorCode, dto.batchTotal);
    const publicToken = randomBytes(24).toString('base64url');

    const created = await this.prisma.$transaction(async (tx) => {
      // 发号 = 批次现存最大序号 + 1。
      // 删掉中间某号不会被回填(不复用),也不会撞已存在 certNo(避免 P2002 → 500)。
      const agg = await tx.certificate.aggregate({
        where: { batchKey },
        _max: { batchSeq: true },
      });
      const maxSeq = agg._max.batchSeq ?? 0;
      const batchSeq = maxSeq + 1;
      if (batchSeq > dto.batchTotal) {
        throw new BadRequestException(
          `批次 ${batchKey} 已发完(${maxSeq}/${dto.batchTotal})。如要追加发证,请使用不同的 batchTotal。`,
        );
      }
      const certNo = buildCertNo(
        dto.yearLabel,
        honorCode,
        dto.batchTotal,
        batchSeq,
      );

      return tx.certificate.create({
        data: {
          certNo,
          yearLabel: dto.yearLabel,
          honorCode,
          batchKey,
          batchTotal: dto.batchTotal,
          batchSeq,
          publicToken,

          templateId: template.id,
          source: 'internal',
          // V3:荣誉类型快照,以模板为准(忽略 DTO)
          honorType,

          // V3:集体荣誉时 recipientName 就是集体名,不再用 User 快照覆盖
          //     (防止 userSnapshot.name 误覆盖)。
          //     仅 individual 时才允许 User 快照覆盖。
          // ⚠ 集体证书不绑自然人:否则该自然人会在「我的证书」(searchMine 按
          //   recipientUserId 过滤)里搜到集体证,且被 listHonorRecords 当成个人荣誉
          //   计入考核积分。
          recipientUserId: honorType === 'collective' ? null : dto.recipientUserId,
          recipientName:
            honorType === 'collective'
              ? dto.recipientName
              : userSnapshot?.name ?? dto.recipientName,
          recipientEmpNo:
            honorType === 'collective'
              ? dto.recipientEmpNo
              : userSnapshot?.username ?? dto.recipientEmpNo,
          recipientDept: dto.recipientDept,
          recipientIdCard: dto.recipientIdCard,
          recipientPhone: dto.recipientPhone,

          variableData: dto.variableData,
          // V3:允许前端覆盖颁发日期(表彰日期),否则用 prisma @default(now())
          issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : null,

          issuedBy: ctx.actorId ?? '',
          issuerName: ctx.actorName ?? '',
          issuingOrgId: dto.issuingOrgId,
          issuingOrgName: dto.issuingOrgName,

          pdfFileId: dto.pdfFileId,
          sourceFileId: dto.sourceFileId,
          thumbnail: dto.thumbnail,
        },
      });
    });

    await this.audit.log({
      action: 'cert.issue.create',
      target: created.id,
      actorId: ctx.actorId,
      actorName: ctx.actorName,
      ip: ctx.ip,
      detail: JSON.stringify({
        certNo: created.certNo,
        templateId: created.templateId,
        templateName: template.name,
        recipientName: created.recipientName,
        recipientEmpNo: created.recipientEmpNo,
        batchKey: created.batchKey,
        batchSeq: created.batchSeq,
        // pdfData 不入审计 detail
      }),
    });

    return created;
  }

  /**
   * 回填证书文件(发号后,用真实 certNo 渲染完 PDF 再调)。
   * pdfFileId 必填;thumbnail / variableData 可选(真号重渲染后的快照,覆盖发号时的占位)。
   */
  async attachFile(id: string, dto: AttachCertificateFileDto, ctx: IssueCtx) {
    const cert = await this.prisma.certificate.findUnique({ where: { id } });
    if (!cert) throw new NotFoundException('证书不存在');
    const updated = await this.prisma.certificate.update({
      where: { id },
      data: {
        pdfFileId: dto.pdfFileId,
        ...(dto.thumbnail !== undefined ? { thumbnail: dto.thumbnail } : {}),
        ...(dto.variableData !== undefined
          ? { variableData: dto.variableData }
          : {}),
      },
    });
    await this.audit.log({
      action: 'cert.issue.attach-file',
      target: id,
      actorId: ctx.actorId,
      actorName: ctx.actorName,
      ip: ctx.ip,
      detail: JSON.stringify({ certNo: cert.certNo, pdfFileId: dto.pdfFileId }),
    });
    return updated;
  }

  /** 列表 — 不返大文件字段(列表页用不到,省传输) */
  async list(filter: ListFilter) {
    const where: Record<string, unknown> = {};
    if (filter.templateId) where.templateId = filter.templateId;
    if (filter.source) where.source = filter.source;
    if (filter.revoked !== undefined) where.revoked = filter.revoked;
    if (filter.batchKey) where.batchKey = filter.batchKey;
    if (filter.recipientUserId) where.recipientUserId = filter.recipientUserId;

    return this.prisma.certificate.findMany({
      where,
      orderBy: { issueDate: 'desc' },
      select: {
        id: true,
        certNo: true,
        yearLabel: true,
        honorCode: true,
        batchKey: true,
        batchTotal: true,
        batchSeq: true,
        publicToken: true,
        templateId: true,
        template: {
          select: { id: true, name: true, honorCode: true, honorLevel: true },
        },
        source: true,
        // V3:荣誉类型(个人/集体)快照 — 综合搜索 + 列表「持证人/集体」列要用
        honorType: true,
        recipientUserId: true,
        recipientName: true,
        recipientEmpNo: true,
        recipientDept: true,
        recipientIdCard: false,
        recipientPhone: false,
        variableData: true,
        issueDate: true,
        validUntil: true,
        issuedBy: true,
        issuerName: true,
        issuingOrgId: true,
        issuingOrgName: true,
        revoked: true,
        revokedAt: true,
        revokedReason: true,
        revokedBy: true,
        // pdfData / externalFileData 不返,详情接口再返
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * 我的证书搜索(全站搜索聚合模块调用)。
   * ⚠ recipientUserId 由服务端注入 actorId,绝不接受客户端入参(区别于 list(filter) 的信任语义)——
   * 否则登录用户可枚举他人证书。含已撤销(items 带 revoked,前端标记)。
   */
  async searchMine(actorId: string, rawQ: string, page = 1, pageSize = 10) {
    const q = rawQ.trim();
    const empty = {
      total: 0,
      items: [] as Array<{
        id: string; certNo: string; templateName: string; honorType: string | null;
        yearLabel: string; issueDate: Date; revoked: boolean; publicToken: string;
      }>,
    };
    if (!q) return empty;
    const p = Math.max(page, 1);
    const size = Math.min(Math.max(pageSize, 1), 50);
    const where = {
      recipientUserId: actorId,
      OR: [
        { certNo: { contains: q, mode: 'insensitive' as const } },
        { yearLabel: { contains: q, mode: 'insensitive' as const } },
        { honorCode: { contains: q, mode: 'insensitive' as const } },
        // 关系过滤:template 为 null(外部录入)自然不命中,无需特判
        { template: { name: { contains: q, mode: 'insensitive' as const } } },
      ],
    };
    const [total, rows] = await Promise.all([
      this.prisma.certificate.count({ where }),
      this.prisma.certificate.findMany({
        where,
        orderBy: { issueDate: 'desc' },
        skip: (p - 1) * size,
        take: size,
        select: {
          id: true,
          certNo: true,
          yearLabel: true,
          honorType: true,
          issueDate: true,
          revoked: true,
          publicToken: true,
          template: { select: { name: true } },
        },
      }),
    ]);
    return {
      total,
      items: rows.map((c) => ({
        id: c.id,
        certNo: c.certNo,
        templateName: c.template?.name ?? '',
        honorType: c.honorType,
        yearLabel: c.yearLabel,
        issueDate: c.issueDate,
        revoked: c.revoked,
        publicToken: c.publicToken,
      })),
    };
  }

  /** 详情 — 含 pdfData / externalFileData,下载/预览用 */
  async get(id: string) {
    const cert = await this.prisma.certificate.findUnique({
      where: { id },
      include: {
        template: {
          select: { id: true, name: true, honorCode: true, honorLevel: true },
        },
      },
    });
    if (!cert) throw new NotFoundException('证书不存在');
    return cert;
  }

  /**
   * 轻量缩略图 — 只返回压缩预览图(几十 KB),不带 pdfData(数 MB)。
   * 已发证书详情的预览用这个,避免每次拉整张高清 PDF。
   * thumbnail 为空(外部证书 / 老数据)时返回 null,前端回退到完整 PDF 预览。
   */
  async getThumbnail(id: string): Promise<{ thumbnail: string | null }> {
    const cert = await this.prisma.certificate.findUnique({
      where: { id },
      select: { thumbnail: true },
    });
    if (!cert) throw new NotFoundException('证书不存在');
    return { thumbnail: cert.thumbnail };
  }

  /**
   * 硬删除一张证书(管理员专用,@Permission('certificate:delete'))。
   * 与「撤销」不同:撤销是软标记保留数据,删除是物理移除。
   * 注:删除会释放该 batch 内的序号槽位 —— 发号取的是批次现存 max(batchSeq) + 1,
   *     故删掉中间号不会被回填(不复用),删掉最大号则会被下一次发证重新用上。
   */
  async remove(id: string, ctx: IssueCtx) {
    const cert = await this.prisma.certificate.findUnique({ where: { id } });
    if (!cert) throw new NotFoundException('证书不存在');
    await this.prisma.certificate.delete({ where: { id } });
    // 联动删存储文件:pdfFileId 每证唯一,删证书即删其 PDF,避免孤儿。best-effort 不阻断。
    // sourceFileId(表彰原始文件)可能被同批多证共享 → 不在此联动删,交给孤儿回收兜底。
    if (cert.pdfFileId) {
      try {
        await this.storage.softDelete(cert.pdfFileId, ctx);
      } catch {
        /* 文件删除失败留给孤儿回收,不阻断删证书 */
      }
    }
    await this.audit.log({
      action: 'cert.issue.delete',
      target: id,
      actorId: ctx.actorId,
      actorName: ctx.actorName,
      ip: ctx.ip,
      detail: JSON.stringify({
        certNo: cert.certNo,
        recipientName: cert.recipientName,
        batchKey: cert.batchKey,
        source: cert.source,
      }),
    });
    return { ok: true, id };
  }

  /* ─── 外部证书上传(Phase E)─── */

  /**
   * source='external' 路径:不绑定模板,直接接收用户上传的 PDF。
   * 证书编号同样按 batch 规则生成。
   */
  async issueExternal(dto: IssueExternalCertificateDto, ctx: IssueCtx) {
    // honorType 缺省 = 个人(与下方 recipientName 的取值分支保持同一判据)
    const isIndividual = !dto.honorType || dto.honorType === 'individual';
    let userSnapshot: { name: string; username: string } | null = null;
    if (isIndividual && dto.recipientUserId) {
      const u = await this.prisma.user.findUnique({
        where: { id: dto.recipientUserId },
      });
      if (!u) throw new NotFoundException('持证人用户不存在');
      // 与 issue() 同一把闸:外部录入同样会用 User 快照覆盖姓名/工号,
      // 绑错人同样是静默改写身份
      assertIdentityMatches(dto, u);
      userSnapshot = { name: u.name, username: u.username };
    }

    const batchKey = buildBatchKey(dto.yearLabel, dto.honorCode, dto.batchTotal);
    const publicToken = randomBytes(24).toString('base64url');

    const created = await this.prisma.$transaction(async (tx) => {
      const agg = await tx.certificate.aggregate({
        where: { batchKey },
        _max: { batchSeq: true },
      });
      const maxSeq = agg._max.batchSeq ?? 0;
      const batchSeq = maxSeq + 1;
      if (batchSeq > dto.batchTotal) {
        throw new BadRequestException(
          `批次 ${batchKey} 已发完(${maxSeq}/${dto.batchTotal})。如要追加发证,请使用不同的 batchTotal。`,
        );
      }
      const certNo = buildCertNo(
        dto.yearLabel,
        dto.honorCode,
        dto.batchTotal,
        batchSeq,
      );

      return tx.certificate.create({
        data: {
          certNo,
          yearLabel: dto.yearLabel,
          honorCode: dto.honorCode,
          batchKey,
          batchTotal: dto.batchTotal,
          batchSeq,
          publicToken,

          templateId: null,
          source: 'external',
          honorType: dto.honorType,

          // 集体荣誉不绑自然人(同 issue():否则该人会在「我的证书」里搜到集体证,
          // 且被荣誉取数当成个人荣誉计入考核)
          recipientUserId: isIndividual ? dto.recipientUserId : null,
          recipientName:
            dto.honorType && dto.honorType !== 'individual'
              ? dto.recipientName
              : userSnapshot?.name ?? dto.recipientName,
          recipientEmpNo:
            dto.honorType && dto.honorType !== 'individual'
              ? dto.recipientEmpNo
              : userSnapshot?.username ?? dto.recipientEmpNo,
          recipientDept: dto.recipientDept,
          recipientIdCard: dto.recipientIdCard,
          recipientPhone: dto.recipientPhone,

          variableData: dto.variableData ?? '{}',
          validUntil: dto.validUntil ? new Date(dto.validUntil) : null,

          issuedBy: ctx.actorId ?? '',
          issuerName: ctx.actorName ?? '',
          issuingOrgName: dto.issuingOrgName,

          // 外部上传原件:字节存 storage,这里只记指针
          pdfFileId: dto.pdfFileId,
        },
      });
    });

    await this.audit.log({
      action: 'cert.issue.external',
      target: created.id,
      actorId: ctx.actorId,
      actorName: ctx.actorName,
      ip: ctx.ip,
      detail: JSON.stringify({
        certNo: created.certNo,
        honorName: dto.honorName,
        honorCode: dto.honorCode,
        recipientName: created.recipientName,
        batchKey: created.batchKey,
      }),
    });

    return created;
  }

  /* ─── 撤销 + 批量下载(Phase C) ─── */

  async revoke(id: string, dto: RevokeCertificateDto, ctx: IssueCtx) {
    const cert = await this.prisma.certificate.findUnique({ where: { id } });
    if (!cert) throw new NotFoundException('证书不存在');
    if (cert.revoked) {
      throw new BadRequestException('证书已撤销,不能重复操作');
    }
    const updated = await this.prisma.certificate.update({
      where: { id },
      data: {
        revoked: true,
        revokedAt: new Date(),
        revokedReason: dto.reason,
        revokedBy: ctx.actorId,
      },
    });
    await this.audit.log({
      action: 'cert.issue.revoke',
      target: id,
      actorId: ctx.actorId,
      actorName: ctx.actorName,
      ip: ctx.ip,
      detail: JSON.stringify({
        certNo: cert.certNo,
        recipientName: cert.recipientName,
        reason: dto.reason,
      }),
    });
    return updated;
  }

  /**
   * 准备批量下载:存 ids→token(内存、5 分钟失效),返回浏览器原生下载用的 token URL。
   * 不在此打包 —— 真正的 ZIP 在公开 GET /public/certificates/bulk-zip 流式生成(见 getBulkZip),
   * 让浏览器边下边写盘(不经 axios 内存 Blob,批量再大也稳)。
   */
  async prepareBulkDownload(
    ids: string[],
    ctx: IssueCtx,
  ): Promise<{ url: string }> {
    if (!ids || ids.length === 0)
      throw new BadRequestException('请选择至少 1 张证书');
    const n = await this.prisma.certificate.count({
      where: { id: { in: ids } },
    });
    if (n === 0) throw new NotFoundException('未找到任何证书');
    this.pruneBulkJobs();
    const token = randomBytes(18).toString('base64url');
    this.bulkJobs.set(token, {
      ids: [...ids],
      exp: Math.floor(Date.now() / 1000) + 300,
    });
    await this.audit.log({
      action: 'cert.issue.bulk-download',
      actorId: ctx.actorId,
      actorName: ctx.actorName,
      ip: ctx.ip,
      detail: JSON.stringify({ count: ids.length }),
    });
    return { url: `/public/certificates/bulk-zip?token=${token}` };
  }

  /**
   * 凭 token 取批量 ZIP(公开下载口用)。文件名 {荣誉名}-{姓名}-{员工编号}.pdf,
   * 同名加 -2/-3;无 PDF 的跳过;全跳过则报错。
   */
  async getBulkZip(
    token: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    this.pruneBulkJobs();
    const job = this.bulkJobs.get(token);
    if (!job || Math.floor(Date.now() / 1000) > job.exp) {
      throw new NotFoundException('下载链接无效或已过期');
    }
    const certs = await this.prisma.certificate.findMany({
      where: { id: { in: job.ids } },
      include: { template: { select: { name: true } } },
    });
    const zip = new JSZip();
    const usedNames = new Set<string>();
    for (const c of certs) {
      if (!c.pdfFileId) continue;
      let buf: Buffer;
      try {
        buf = (await this.storage.getBuffer(c.pdfFileId)).buffer;
      } catch {
        continue; // 文件缺失/读失败:跳过不阻断整包
      }
      const base = buildPdfBaseName({
        honorName: c.template?.name ?? c.honorCode,
        recipientName: c.recipientName,
        recipientEmpNo: c.recipientEmpNo,
      });
      let name = `${base}.pdf`;
      let k = 1;
      while (usedNames.has(name)) {
        k += 1;
        name = `${base}-${k}.pdf`;
      }
      usedNames.add(name);
      zip.file(name, buf);
    }
    if (usedNames.size === 0) {
      throw new NotFoundException('所选证书都没有可下载的文件');
    }
    const buffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });
    const now = new Date();
    const stamp =
      `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}` +
      `${String(now.getDate()).padStart(2, '0')}-` +
      `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    return { buffer, filename: `djyy-certificates-${stamp}.zip` };
  }

  private pruneBulkJobs(): void {
    const now = Math.floor(Date.now() / 1000);
    for (const [t, j] of this.bulkJobs) {
      if (now > j.exp) this.bulkJobs.delete(t);
    }
  }

  /* ─── 公开接口(供 PublicVerifyController 用,不挂 AuthGuard) ─── */

  /**
   * 公开验证:通过 publicToken 拉一张证书。
   *
   * 关键:**不返回 pdfData**(单张高清证书可达十几 MB,data:PDF 又在非 HTTPS 下
   * 被浏览器拒绝 iframe 渲染 → 公开页空白)。改返回轻量 thumbnail 供前端 <img> 预览;
   * 下载原件走 getPublicFile(按需拉)。idCard/phone/externalFileData 不外露。
   */
  async verifyByToken(token: string) {
    const cert = await this.prisma.certificate.findUnique({
      where: { publicToken: token },
      select: {
        id: true,
        certNo: true,
        yearLabel: true,
        honorCode: true,
        batchKey: true,
        batchTotal: true,
        batchSeq: true,
        publicToken: true,
        templateId: true,
        template: {
          select: { id: true, name: true, honorCode: true, honorLevel: true },
        },
        source: true,
        honorType: true,
        recipientUserId: true,
        recipientName: true,
        recipientEmpNo: true,
        recipientDept: true,
        variableData: true,
        issueDate: true,
        validUntil: true,
        issuedBy: true,
        issuerName: true,
        issuingOrgId: true,
        issuingOrgName: true,
        revoked: true,
        revokedAt: true,
        revokedReason: true,
        revokedBy: true,
        // 轻量预览图(几十 KB JPEG)。external 证书可能为 null
        thumbnail: true,
        createdAt: true,
        updatedAt: true,
        // 显式不取:pdfFileId / sourceFileId / recipientIdCard / recipientPhone(下载走 getPublicFileStream)
      },
    });
    if (!cert) throw new NotFoundException('证书不存在或链接无效');
    return cert;
  }

  /**
   * 公开下载:按 publicToken 取证书文件流(从 storage 按 fileId 拉)。
   * 与 verifyByToken 分开 —— 验证页只传轻量 thumbnail,点「下载」才拉原件。
   */
  async getPublicFileStream(
    token: string,
  ): Promise<{ stream: Readable; filename: string; mimeType: string }> {
    const cert = await this.prisma.certificate.findUnique({
      where: { publicToken: token },
      select: {
        pdfFileId: true,
        certNo: true,
        honorCode: true,
        recipientName: true,
        recipientEmpNo: true,
        template: { select: { name: true } },
      },
    });
    if (!cert) throw new NotFoundException('证书不存在或链接无效');
    if (!cert.pdfFileId) throw new NotFoundException('该证书没有可下载的文件');
    const { meta, stream } = await this.storage.getStream(cert.pdfFileId);
    const base = buildPdfBaseName({
      honorName: cert.template?.name ?? cert.honorCode,
      recipientName: cert.recipientName,
      recipientEmpNo: cert.recipientEmpNo,
    });
    return { stream, filename: `${base}.pdf`, mimeType: meta.mimeType };
  }

  /**
   * 公开查询:按证书编号搜。
   * 精确匹配优先,找不到则做 contains 模糊。
   * 限 20 条 + 不返 pdfData(列表只显示元数据,需要详情走 verifyByToken)。
   */
  async publicSearch(q: string) {
    const trimmed = (q ?? '').trim();
    if (!trimmed) return [];

    // 1. 先精确匹配
    const exact = await this.prisma.certificate.findFirst({
      where: { certNo: trimmed },
      include: { template: { select: { id: true, name: true, honorCode: true } } },
    });
    if (exact) return [sanitizeForPublicList(exact)];

    // 2. 模糊
    const fuzzy = await this.prisma.certificate.findMany({
      where: { certNo: { contains: trimmed, mode: 'insensitive' } },
      orderBy: { issueDate: 'desc' },
      take: 20,
      include: { template: { select: { id: true, name: true, honorCode: true } } },
    });
    return fuzzy.map(sanitizeForPublicList);
  }

  /**
   * 消费方(assessment 荣誉自动取数):列出有效荣誉记录(排除已撤销,可按年份段过滤)。
   * 只回单位归集所需字段:关联用户 id(→行政归属反查)/ 单位路径快照 / 荣誉级别(模板快照,外部证书无模板为 null)。
   */
  async listHonorRecords(yearLabel?: string): Promise<
    { recipientUserId: string | null; recipientDept: string | null; honorLevel: string | null }[]
  > {
    const rows = await this.prisma.certificate.findMany({
      where: { revoked: false, ...(yearLabel ? { yearLabel } : {}) },
      select: {
        recipientUserId: true,
        recipientDept: true,
        template: { select: { honorLevel: true } },
      },
    });
    return rows.map((r) => ({
      recipientUserId: r.recipientUserId,
      recipientDept: r.recipientDept,
      honorLevel: r.template?.honorLevel ?? null,
    }));
  }
}

/* ─── 文件名 + 数据转换辅助 ─── */

/** 默认文件名:{荣誉名}-{姓名}-{员工号},去掉非法字符 */
function buildPdfBaseName(opts: {
  honorName: string;
  recipientName: string;
  recipientEmpNo?: string | null;
}): string {
  const parts = [opts.honorName, opts.recipientName];
  if (opts.recipientEmpNo) parts.push(opts.recipientEmpNo);
  return parts.map((p) => p.trim().replace(/[\\/:*?"<>|]/g, '_')).join('-');
}

/* ─── 公开接口字段脱敏 ─── */

/** 不外露:身份证号/电话/外部文件原文件,但保留 pdfData 给公开页渲染 */
function sanitizeForPublic<
  T extends {
    recipientIdCard?: string | null;
    recipientPhone?: string | null;
    externalFileData?: string | null;
  },
>(cert: T): T {
  return {
    ...cert,
    recipientIdCard: null,
    recipientPhone: null,
    externalFileData: null,
  };
}

/** 列表/搜索结果用:再剥掉 pdfData(节省带宽 + 防爬全证书),详情走 verifyByToken */
function sanitizeForPublicList<
  T extends {
    recipientIdCard?: string | null;
    recipientPhone?: string | null;
    externalFileData?: string | null;
    pdfData?: string | null;
  },
>(cert: T): T {
  return {
    ...sanitizeForPublic(cert),
    pdfData: null,
  };
}
