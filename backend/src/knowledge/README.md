# knowledge — 知识分享平台

> 设计规格:docs/specs/2026-07-05-knowledge-platform.md

## 拥有的表(schema.prisma `// @module: knowledge`)

| 表 | 用途 |
|---|---|
| KnowledgeCategory | 领域分类(党建/设备/安全…),两级树;深度/同级重名 service 校验 |
| KnowledgeType | 内容类型(条例/制度/经验/操作指南)+ **requireReview 审核开关(唯一配置处)** |
| KnowledgeArticle | 文章:contentMd 直存库;tagsJson 标签;versionGroupId 版本链;冗余计数列 |
| KnowledgeAttachment | 展示型附件(模板下载),fileId 松引用 storage |
| KnowledgeComment | 评论(单层 + @回复),P3 启用 |
| KnowledgeReaction | 点赞/收藏(type 区分),P3 启用 |
| KnowledgeFeedback / KnowledgeFeedbackReply | 吐槽 = 不公开反馈通道(可匿名),P3 启用 |
| KnowledgeViewLog | 原始浏览日志(durationSec 由 beacon 回填),P1 计数 / P3 时长 |

## 状态机

`draft →(submit)→ pending | published`(按 KnowledgeType.requireReview 分流,管理员免审)
`pending →(review)→ published | rejected(必填原因)`;`published →(unpublish)→ draft`
**版本链**:发布(直发或过审)事务内把同 versionGroupId 的其他 published → `archived`
(archived 不进列表/搜索,详情可直接访问,新版详情页「历史版本」可查)。

## 对外 API(/api 前缀,均登录;标注者需权限)

- `GET/POST/PATCH/DELETE /knowledge/categories(/:id)`(写=knowledge:manage)
- `GET/POST/PATCH/DELETE /knowledge/types(/:code)`(写=knowledge:manage)
- `GET /knowledge/articles?q=&categoryId=&typeCode=&tag=&mine=1&favorite=1&sort=latest|hot&status=&page=&pageSize=`
- `GET /knowledge/articles/:id`(返回 attachments + versions;草稿等仅作者/manage)
- `POST /knowledge/articles`(knowledge:publish)/ `PATCH /:id` / `DELETE /:id`(作者或 manage,service 判)
- `POST /:id/submit` / `POST /:id/review`(manage)/ `POST /:id/unpublish`(manage)
- `POST /:id/view`(30 分钟去重 +viewCount,返回 viewLogId)
- `POST /articles/:id/attachments` / `DELETE /knowledge/attachments/:id` / `POST /knowledge/attachments/:id/download`
- **公开口** `GET /public/knowledge/files/:id`(仅 ownerModule=knowledge;`<img>` 带不了 auth 头的受控豁免)

## 文件与 GC

前端上传一律 `storageApi.upload(file, { ownerModule: 'knowledge', folder: 'article-<id>' })`;
正文图片以相对路径 `/api/public/knowledge/files/<fileId>` 烤进 markdown(渲染时拼 origin)。
`collectInUseFileIds()` 上报 附件 + 封面 + 正文引用,**已接入 MaintenanceService**;
新增引用 storage 的字段务必同步该方法,否则孤儿 GC 会误删。
删文章联动软删其 storage 文件。

## 依赖(DAG)

knowledge → prisma / audit / auth / storage / role。maintenance → knowledge(聚合 GC)。
P5 起 knowledge → points(埋积分事件);points 对 knowledge 零感知。
