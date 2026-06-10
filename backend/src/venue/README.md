# venue —— 会场管理模块

实体会议室 → 会场图设计 → 智能选座。

## 表(均 `// @module: venue`)
- `MeetingRoom` 实体会议室(一室多图)
- `VenueLayout` 会场图(`layoutJson` = 可序列化画布 VenueDesignerState,元素含 seat/zone 稳定 id + 网格 + 背景;`thumbnail` 缩略图;`seatCount` 缓存)
- `SeatingPlan` 选座方案(绑定一张会场图;`rosterJson` 名单 + `rulesJson` 规则)——**V2 启用**
- `SeatingAssignment` 座位分配(seatId 引用 layoutJson 里 seat 稳定 id)——**V2 启用**

venue 内部所有权树用真实 relation + cascade;指向 venue 外的 orgId/userId/fileId 一律 string 松引用、不建 relation(守「表归属单一模块 + DAG」)。

## 接口
- `GET/POST /venue/rooms`、`GET/PATCH/DELETE /venue/rooms/:id`
- `GET /venue/layouts?roomId=`、`GET/POST /venue/layouts`、`GET/PATCH/DELETE /venue/layouts/:id`(设计器保存整体 PATCH 回写 layoutJson/thumbnail/seatCount)

写操作 `@Permission('venue:manage')`(platform_admin 直通),读仅登录。每次写记 `audit.log({ action: 'venue.*' })`。

## 进度
- **V1(已落地)**:会议室 + 会场图 CRUD + 画布设计器(前端 fork 自证书设计器,加网格/吸附 + 会场元素)。
- **V2(待做)**:seating 控制器/服务、名单导入(后端 `xlsx` 解析)、确定性智能选座引擎、座位分配落库 + 手动改、导出。
- **V3(延后)**:3D 预览(three.js)。
