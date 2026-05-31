import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import JSZip from 'jszip';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';
import { IssueCertificateDto } from './dto/issue-certificate.dto';
import { IssueExternalCertificateDto } from './dto/external-certificate.dto';
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

/** 把 batchSeq 格式化成 3 位补 0(批量最大 999 内显示美观,超出按位数自然展开) */
function padSeq(seq: number): string {
  return seq.toString().padStart(3, '0');
}

function buildCertNo(
  yearLabel: string,
  honorCode: string,
  batchTotal: number,
  batchSeq: number,
): string {
  return `${yearLabel}-${honorCode}-${batchTotal}-${padSeq(batchSeq)}`;
}

function buildBatchKey(
  yearLabel: string,
  honorCode: string,
  batchTotal: number,
): string {
  return `${yearLabel}-${honorCode}-${batchTotal}`;
}


@Injectable()
export class CertificateIssueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * 发一张证书。
   *
   * 流程:
   *   1. 拉模板,校验 honorCode 必填
   *   2. (若有)拉关联 User,作为持证人快照来源
   *   3. 事务内 count + 1 算 batchSeq,超额拒绝
   *   4. 生成 certNo + publicToken,落库
   *   5. 写审计
   *
   * 并发:SQLite 单写者锁保证 count→insert 原子。PG 切过去要加 isolationLevel: 'Serializable'。
   */
  async issue(dto: IssueCertificateDto, ctx: IssueCtx) {
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

    // 关联 User 的话拉一下做快照
    let userSnapshot: { name: string; username: string } | null = null;
    if (dto.recipientUserId) {
      const u = await this.prisma.user.findUnique({
        where: { id: dto.recipientUserId },
      });
      if (!u) throw new NotFoundException('持证人用户不存在');
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
          recipientUserId: dto.recipientUserId,
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

          pdfData: dto.pdfData,
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

  /** 列表 — 不返 pdfData / externalFileData(列表页用不到,省传输) */
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
   * 注:删除会释放该 batch 内的序号槽位 —— 若随后用相同 batchTotal 追加发证,
   *     count+1 可能撞到已存在的更高 seq,certNo 唯一约束会拦下(安全失败,不会脏写)。
   */
  async remove(id: string, ctx: IssueCtx) {
    const cert = await this.prisma.certificate.findUnique({ where: { id } });
    if (!cert) throw new NotFoundException('证书不存在');
    await this.prisma.certificate.delete({ where: { id } });
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
    let userSnapshot: { name: string; username: string } | null = null;
    if (dto.recipientUserId) {
      const u = await this.prisma.user.findUnique({
        where: { id: dto.recipientUserId },
      });
      if (!u) throw new NotFoundException('持证人用户不存在');
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

          recipientUserId: dto.recipientUserId,
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

          // 外部 PDF 同时存到 pdfData(批量下载用)+ externalFileData(标记来源)
          pdfData: dto.externalFileData,
          externalFileData: dto.externalFileData,
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
   * 批量下载:把指定 ids 的证书 PDF 打成 ZIP 返回 buffer。
   * 文件名:{荣誉名}-{姓名}-{员工编号}.pdf,清洗非法字符;
   * 同名加 -2 -3 后缀避免冲突。
   * pdfData 缺失的(很少)用 externalFileData 兜底,都没有就跳过并记入 missing。
   */
  async bulkDownload(ids: string[], ctx: IssueCtx): Promise<Buffer> {
    if (ids.length === 0) throw new BadRequestException('请选择至少 1 张证书');
    const certs = await this.prisma.certificate.findMany({
      where: { id: { in: ids } },
      include: { template: { select: { name: true } } },
    });
    if (certs.length === 0) throw new NotFoundException('未找到任何证书');

    const zip = new JSZip();
    const usedNames = new Set<string>();
    const missing: string[] = [];

    for (const c of certs) {
      const pdfDataUrl = c.pdfData ?? c.externalFileData;
      if (!pdfDataUrl) {
        missing.push(c.certNo);
        continue;
      }
      const base = buildPdfBaseName({
        honorName: c.template?.name ?? c.honorCode,
        recipientName: c.recipientName,
        recipientEmpNo: c.recipientEmpNo,
      });
      // 防同名:第 2 张同名加 -2,第 3 张 -3
      let name = `${base}.pdf`;
      let n = 1;
      while (usedNames.has(name)) {
        n += 1;
        name = `${base}-${n}.pdf`;
      }
      usedNames.add(name);

      const buf = dataUrlToBuffer(pdfDataUrl);
      zip.file(name, buf);
    }

    if (usedNames.size === 0) {
      throw new BadRequestException(
        `所选 ${certs.length} 张证书都缺少 PDF 文件,无法打包`,
      );
    }

    await this.audit.log({
      action: 'cert.issue.bulk-download',
      actorId: ctx.actorId,
      actorName: ctx.actorName,
      ip: ctx.ip,
      detail: JSON.stringify({
        total: certs.length,
        packed: usedNames.size,
        missing,
      }),
    });

    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  }

  /* ─── 公开接口(供 PublicVerifyController 用,不挂 AuthGuard) ─── */

  /** 公开验证:通过 publicToken 拉一张证书,过滤敏感字段 */
  async verifyByToken(token: string) {
    const cert = await this.prisma.certificate.findUnique({
      where: { publicToken: token },
      include: { template: { select: { id: true, name: true, honorCode: true } } },
    });
    if (!cert) throw new NotFoundException('证书不存在或链接无效');
    return sanitizeForPublic(cert);
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
      where: { certNo: { contains: trimmed } },
      orderBy: { issueDate: 'desc' },
      take: 20,
      include: { template: { select: { id: true, name: true, honorCode: true } } },
    });
    return fuzzy.map(sanitizeForPublicList);
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

function dataUrlToBuffer(dataUrl: string): Buffer {
  const idx = dataUrl.indexOf(',');
  if (idx < 0) return Buffer.from('');
  const b64 = dataUrl.slice(idx + 1);
  return Buffer.from(b64, 'base64');
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
