import { ForbiddenException, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StorageService } from '../storage';
import { CertificateService } from '../certificate';
import { TaskService } from '../task';
import { RoleService } from '../role';
import { AuditService } from '../audit';
import { ExhibitionService } from '../exhibition';
import { ReportService } from '../report';

/** 上传超过这么多天仍无人引用,才算孤儿(宽限,避免误删「正在走向导、还没提交」的上传)。 */
const ORPHAN_GRACE_DAYS = 30;

/**
 * 「资料库」模块豁免:这些模块的文件**设计上就常驻**、没有业务表逐条引用 ——
 * avatar(头像原图+历史库,「下次上线不必重生成」)/ model3d(3D 生成历史,展厅可回选)。
 * 不豁免会被整库当孤儿,管理员一点 purge 全删(头像全站裂)。
 */
const LIBRARY_MODULES = new Set(['avatar', 'model3d']);

/**
 * 运维维护。当前:孤儿文件 GC。
 *
 * 「孤儿」= storage 里上传过、但没有任何业务记录引用、且超过宽限期的文件
 * (典型来源:走了上传、但放弃发证/派发)。**注意 storage.softDelete 会删真实字节、不可逆**,
 * 所以这里**报告优先**:@Cron 只扫描 + 写审计,真正清理(purge)由系统管理员手动触发。
 *
 * 「在用集合」由各业务模块自报(certificate/task 的 collectInUseFileIds),本模块只聚合 ——
 * 守「不直 prisma 别人的表」。本模块在 storage/certificate/task 之上,无人依赖它 → 不破 DAG。
 */
@Injectable()
export class MaintenanceService {
  constructor(
    private readonly storage: StorageService,
    private readonly certificates: CertificateService,
    private readonly tasks: TaskService,
    private readonly roles: RoleService,
    private readonly audit: AuditService,
    private readonly exhibitions: ExhibitionService,
    private readonly reports: ReportService,
  ) {}

  /** 聚合所有业务模块「在用」的 storage fileId。漏一个消费方都可能误删 —— 新增引用文件的模块要在这里加。 */
  private async inUseFileIds(): Promise<Set<string>> {
    const [cert, task, hall, report] = await Promise.all([
      this.certificates.collectInUseFileIds(),
      this.tasks.collectInUseFileIds(),
      this.exhibitions.collectInUseFileIds(),
      this.reports.collectInUseFileIds(),
    ]);
    return new Set<string>([...cert, ...task, ...hall, ...report]);
  }

  /** 候选过滤:剔除资料库模块(avatar/model3d,常驻文件,见 LIBRARY_MODULES) */
  private async orphanCandidates(graceDays: number) {
    const inUse = await this.inUseFileIds();
    const cands = await this.storage.findOrphanCandidates(inUse, graceDays);
    return cands.filter((c) => !LIBRARY_MODULES.has(c.ownerModule));
  }

  /** 扫描孤儿文件(只读报告)。 */
  async scanOrphans(graceDays = ORPHAN_GRACE_DAYS) {
    const cands = await this.orphanCandidates(graceDays);
    const bytes = cands.reduce((s, c) => s + c.size, 0);
    return {
      graceDays,
      count: cands.length,
      bytes,
      // 截断样本(前 200),避免响应过大;真要全量靠 purge 后看审计
      files: cands.slice(0, 200).map((c) => ({
        id: c.id,
        ownerModule: c.ownerModule,
        originalName: c.originalName,
        size: c.size,
        createdAt: c.createdAt,
      })),
    };
  }

  /** 清理孤儿文件(仅系统管理员;softDelete 删字节、不可逆)。返回清理条数 + 释放字节。 */
  async purgeOrphans(actorId: string, graceDays = ORPHAN_GRACE_DAYS) {
    const { isPlatformAdmin } = await this.roles.getScopesForPermission(actorId, 'admin:menu');
    if (!isPlatformAdmin) {
      throw new ForbiddenException('仅系统管理员可清理孤儿文件');
    }
    const cands = await this.orphanCandidates(graceDays);
    let purged = 0;
    let bytes = 0;
    for (const c of cands) {
      try {
        await this.storage.softDelete(c.id, { actorId });
        purged += 1;
        bytes += c.size;
      } catch {
        /* 单个失败不阻断整批 */
      }
    }
    await this.audit.log({
      actorId,
      action: 'maintenance.orphan-purge',
      detail: { purged, bytes, graceDays },
    });
    return { purged, bytes };
  }

  /** 每周扫描孤儿文件并写审计(只报告、不删 —— 删字节不可逆,清理留给管理员手动确认)。 */
  @Cron(CronExpression.EVERY_WEEK)
  async reportOrphansWeekly(): Promise<void> {
    try {
      const r = await this.scanOrphans();
      if (r.count > 0) {
        await this.audit.log({
          action: 'maintenance.orphan-scan',
          detail: { count: r.count, bytes: r.bytes, graceDays: r.graceDays },
        });
      }
    } catch {
      /* 调度任务失败不抛 */
    }
  }
}
