# search — 全站搜索聚合

首页搜索栏 + `/search` 结果页的后端。**owns 0 张表**;照 `maintenance` 范式:位于内容模块之上、
无人依赖本模块(只被 AppModule 注册)→ 依赖图仍是 DAG。

## 职责边界

- 本模块只做:扇出(Promise.all 调各内容模块的 `search*` 方法)、聚合分组、统一 `SearchHit` 映射、`url` 生成。
- **可见性过滤在各内容模块自持**:knowledge/showcase 只回 published 口径;证书 `searchMine(actorId)`
  由控制器注入当前用户,绝不透传客户端 recipientUserId。
- 读操作不写审计(与 knowledge `search-suggest` 一致)。

## 接口(登录即可,无 @Permission)

| 接口 | 用途 |
|---|---|
| `GET /search/suggest?q=&limit=` | 首页联想:各组前 N(1..5)条 + 组 total,空组不返回 |
| `GET /search?q=` | 结果页「全部」tab:每组前 10 条 + 组 total |
| `GET /search?q=&type=&page=&pageSize=` | 结果页单类型分页(pageSize ≤ 50) |

## url 模板 ↔ 前端路由对照(改前端路由时同步这里)

| type | url 模板 | 前端页面 |
|---|---|---|
| `knowledge` | `/knowledge/articles/:id?q=` | 知识阅读页(`?q=` TreeWalker 定位高亮) |
| `faq` | `/knowledge/articles/:articleId?faq=<faqId>` | 知识阅读页(受控展开该 FAQ 并定位) |
| `nav` | NavItem.url 原样 | 站内路由或外链(前端按 `^https?://` 分流) |
| `showcase-stage` | `/showcase/stages/:id?q=` | 晒台详情(`?q=` 定位) |
| `showcase-entry` | `/showcase/entries/:id?q=` | 作品详情(`?q=` 定位) |
| `certificate` | `/verify/:publicToken` | 证书公开验证页(无需登录) |

## 内容源(首批,2026-07)

knowledge 文章+FAQ、导航应用项(内存过滤 listForPortal)、先锋晒场 晒台+作品、我的证书。
加新内容源 = 该模块 service 加 `searchXxx(q, page, pageSize)`(自持可见性)+ 本模块
`ALL_TYPES`/`fetchGroup` 加一个 case + 前端 `features/search` 的类型/分组标签补一项。
