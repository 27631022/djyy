import { Controller, Get, Param, Query } from '@nestjs/common';
import { CertificateIssueService } from './issue.service';

/**
 * 公开证书验证接口 —— 不挂 AuthGuard,任何人可访问。
 *
 * 路径前缀 /public/certificates 与 admin 的 /certificates 物理隔离,
 * 防止意外把 admin endpoint 当成公开接口暴露。
 *
 * 用途:
 *   - 公开页 /verify 输入证书编号查询 → 调 search
 *   - 二维码扫描出来的 URL ?token=xxx → 调 verify/:token
 *
 * 该接口的设计也考虑给未来「首页综合查询」复用:
 *   - search 接受 q 参数,返回脱敏列表
 *   - 字段稳定(certNo + recipientName + issueDate + revoked),前端可挂任何 UI
 */
@Controller('public/certificates')
export class CertificatePublicVerifyController {
  constructor(private readonly svc: CertificateIssueService) {}

  /** 凭 publicToken 拿一张证书 — 公开,含 pdfData 给前端渲染 */
  @Get('verify/:token')
  verify(@Param('token') token: string) {
    return this.svc.verifyByToken(token);
  }

  /** 公开搜索 — 按证书编号 q(精确优先,然后 contains 模糊) */
  @Get('search')
  search(@Query('q') q?: string) {
    return this.svc.publicSearch(q ?? '');
  }
}
