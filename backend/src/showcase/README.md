# showcase —— 先锋晒场

擂台型「晒实绩」平台:体现党员先锋模范作用 + 争先进位导向。

## 领域模型(7 表,均 `// @module: showcase`)

- **ShowcaseCategory** 晒场分类(六榜 seed:业绩/安全/实事/幸福/风貌/人物 先锋榜,扁平可管理)
- **ShowcaseStage** 晒台=一次擂台(台主发起 → 管理员审核上架 → 开放参晒;`rankBy` = likes|metric)
- **ShowcaseEntry** 参晒作品(登录即可投稿 → 台主或管理员审核后公开;published 被作者再编辑 → 回 pending)
- **ShowcaseReaction** 点赞(多态 stage|entry;`@@unique([userId,targetType,targetId,type])` = 一账户一对象一次)
- **ShowcaseFeedback / Reply** 吐槽(可匿名,台主/作者/管理员可见并回复)
- **ShowcaseViewLog** 浏览日志(多态;beacon 回填时长)

## 展示工具区块(showcase-blocks.ts)

晒台台头(introBlocksJson)与作品(blocksJson)= `[{id,type,content}]`,9 种工具:
compare 前后对比 / spot 局部图 / pano360 全景 / ranking 排行榜 / video 视频 /
metric 指标卡 / trend 趋势图 / timeline 时间轴 / story 图文故事。

**加新工具 = `BLOCK_SPECS` 加一条(normalize + collectFileIds 同处)+ 前端
`react/src/features/showcase/tools/<type>.tsx` 加实现并在 registry 注册一行。**

## 权限

- `showcase:publish` 发起晒台(企业管理员/党支部书记/部门经理)
- `showcase:manage` 晒场管理(分类/晒台审核/下架/吐槽)
- 投稿参晒不设权限点(登录即可);作品审核 = 台主或 manage(service 内判)

## 文件

上传走 `storage.put({ownerModule:'showcase', folder:'stage-<id>'|'entry-<id>'})`,
命名「标题-序号.扩展名」;公开口 `GET /public/showcase/files/:id`(带 HTTP Range,视频 seek 必需)。
`collectInUseFileIds()` 已接 MaintenanceService(孤儿 GC);删晒台/作品联动删文件(交叉校验防误删共用)。
