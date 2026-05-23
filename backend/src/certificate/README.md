# certificate 模块

证书管理系统的后端实现。

## Owns

- `CertificateTemplate` 表 — 证书模板(designJson 是前端 Canvas 设计器序列化的 DesignerState)

## 对外 API

`index.ts` 导出:
- `CertificateService` — 注入到其他模块以读写模板(目前没人需要,V2 发证模块会用)
- `CertificateModule` — 在 app.module 注册

## HTTP 路由(都需要登录)

- `GET    /api/certificate-templates`        列表(`?active=true|false` 过滤)
- `GET    /api/certificate-templates/:id`    详情
- `POST   /api/certificate-templates`        新建
- `PATCH  /api/certificate-templates/:id`    更新
- `DELETE /api/certificate-templates/:id`    删除(V2 改软删)

## 审计

写操作都打 audit:
- `cert.template.create`
- `cert.template.update`
- `cert.template.delete`

注意:audit detail 不存 designJson / thumbnail(可能很大),只记元数据变化和 flag。

## V2 计划

- 加 `Certificate` 表(已发证书记录,@relation 回本表 onDelete: Restrict)
- 加发证 API:`POST /api/certificates` 选模板 + 填数据 → 生成
- 加公开验证 API:`GET /api/verify/:token`(无 AuthGuard)
- 软删除:把 `delete` 改为 `update({ active: false })`
