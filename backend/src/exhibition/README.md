# exhibition · 企业虚拟展厅

数据驱动的 3D 展厅后端(规格 [docs/specs/2026-06-07-virtual-exhibition-hall.md](../../../docs/specs/2026-06-07-virtual-exhibition-hall.md))。
一个展厅 = 一份空间文档(`Hall`):`walls` + `fixtures` + `meta` 均以 JSON 串存;素材松引用 storage `fileId`。

## 接口
| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/api/halls` | 公开 | 目录 `[{id,name,thumbnail,published}]` |
| GET | `/api/halls/:id` | 公开 | 单厅**已解析** JSON(fileId→相对 url,connector→占位) |
| POST | `/api/halls` | `exhibition:manage` | 新建(保存空间 JSON) |
| PATCH | `/api/halls/:id` | `exhibition:manage` | 更新 |
| DELETE | `/api/halls/:id` | `exhibition:manage` | 删除 |
| GET | `/api/connectors` | 仅登录 | 可用连接器列表 |
| GET | `/api/public/exhibition/assets/:id` | 公开流式 | 素材(校验 `ownerModule=exhibition`) |
| 上传 | 复用 `POST /api/files` | 仅登录 | `ownerModule='exhibition'`, `folder=hallId` |

## 关键约定
- 素材一律存 `fileId`,GET 详情时由 service「已解析」旁补公开 url(见 `exhibition.types.ts` 的 `FILE_ID_TO_URL`)。
- 跨模块松引用(`fileId`/`createdById`),不建外键(守「表归属 + DAG」)。
- 客户端 = **独立工程** `exhibition-client/`(Babylon.js);`exhibition.types.ts` 在两边各存一份,改契约时同步。

## 后续
- **P5 连接器**(`connectors.ts`):`honor`→`CertificateIssueService.list()`、`notice`→党务公告数据源。
- **P2/P3 管理端**:并入 react/ 后台 `features/exhibition`(建厅 / 传素材 / 平面图生成器)。
