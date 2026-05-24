import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';
import { IssueCertificateDto } from './dto/issue-certificate.dto';

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
      const inBatch = await tx.certificate.count({ where: { batchKey } });
      if (inBatch >= dto.batchTotal) {
        throw new BadRequestException(
          `批次 ${batchKey} 已发完(${inBatch}/${dto.batchTotal})。如要追加发证,请使用不同的 batchTotal。`,
        );
      }
      const batchSeq = inBatch + 1;
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

          recipientUserId: dto.recipientUserId,
          recipientName: userSnapshot?.name ?? dto.recipientName,
          recipientEmpNo: userSnapshot?.username ?? dto.recipientEmpNo,
          recipientDept: dto.recipientDept,
          recipientIdCard: dto.recipientIdCard,
          recipientPhone: dto.recipientPhone,

          variableData: dto.variableData,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : null,

          issuedBy: ctx.actorId ?? '',
          issuerName: ctx.actorName ?? '',
          issuingOrgId: dto.issuingOrgId,
          issuingOrgName: dto.issuingOrgName,

          pdfData: dto.pdfData,
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
        template: { select: { id: true, name: true, honorCode: true } },
        source: true,
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
      include: { template: { select: { id: true, name: true, honorCode: true } } },
    });
    if (!cert) throw new NotFoundException('证书不存在');
    return cert;
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
