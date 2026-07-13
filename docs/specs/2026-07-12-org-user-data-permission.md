# 组织 / 用户管理 三级数据权限（2026-07-12）

> 补上 seed.ts:354 自认的欠账：「任务域已按 scope 强制；组织/用户管理的范围限制后续按需加」。
> 本次把数据范围收敛落到用户管理与组织管理两个域，并顺手堵掉两个更基础的安全缺口。

## 需求（用户口径）

- 系统管理员：看/管全部用户 + 党组织 + 行政机构。
- 机构管理员：看/管所在**二级单位及以下**行政机构与人员。
- 三级机构管理员：只看/管**本单位**人员（叶子单位 own≈subtree）。
- **对口上级机构仍需可见**：三级单位的部门配了「对口上级机构」（机关部门），那个上级机构及其联系人要能看到。
- 党委管理员：编辑**所在党委及以下党支部**的党员（党组织归属 + 联系方式）；建/撤本党委下的党支部。普通党员只读（进不了后台即天然只读）。

## 现状缺口（调研结论，均带 file:line 已存档）

1. **数据范围机制早已齐备但用户/组织域零接入**：`UserRole.scope`（self/own/subtree/all/custom）+ `UserRoleScope` 锚点表 + `RoleService.getScopesForPermission` 是唯一解析入口，task/report/assessment 都在用；user/organization 两模块一处未接。
2. **OrganizationController 连 AuthGuard 都没挂**：未登录即可拉全树、查任意机构成员（含姓名/工号/**电话**）、增删改组织、改 meta。
3. **用户写接口无权限校验**：`replaceRoles`（任何登录用户可给自己授 platform_admin 提权）、memberships 增删、建/删用户都只要登录，actor 仅用于审计。
4. `admin:user:*`/`admin:org:*`/`admin:role:*` 权限点 seed 里有、也授给了角色，但**没挂在任何用户/组织/角色接口上**。

## 落法（不建新表，全用现有 scope 机制）

### 权威解析器 `OrgScopeService`（backend/src/organization/org-scope.service.ts，新）

- 注入 `RoleService`；一次 `loadIndex()` 把全量 org（~1000 行）读入内存建索引（parentOf/childrenOf/kind/isDept/isVirtual/meta）。
- **分维累计**（行政维 admin / 党维 party 互不放大）：
  - platform_admin / 任一 `scope=all` → unrestricted 早退；
  - `scope=custom` → 锚点按 `org.kind` 分维、整子树展开（`subtreeInto`），并记 `anchorIds`（锚点本体禁删/禁移）；
  - `scope=subtree/own` → **只推导行政维**：`adminManageAnchor`（`owningUnitOf` 找所在单位；机关部门人员锚本部门不放大到全公司），subtree 展全子树、own 只含锚点自身；**党维不做归属推导**（防行政管理员因个人党员身份跨线拿党务权，党委管理员必须配 custom 党组织锚点）。
- **读范围**额外附加：
  - `counterpartOrgIds`：可见行政子树内任一机构 `meta.counterpartParentOrgIds` 指向的机关部门（只读、仅直接成员）；
  - `fallbackOrgIds`：任何登录人兜底可见「本人所在单位」子树（机关人员=全公司，与任务派发 `owningUnitOf` 口径一致）——保 AssignPicker/TargetPicker 等业务选人组件不回归。
- 对外方法：`resolveUserRead` / `userVisibleOrgIds` / `resolveWrite(perm)` / `membersAccess(full|direct|none)` / 一组 `assertOrg*`（create/update/move/remove/link/reorder 的写范围断言）。

### 接口收敛

**组织**（organization.controller）：
- 补类级 `AuthGuard`（堵未登录访问）。
- 树/列表**结构**保持登录可见（决定 1：任务派发/考核/筛选器等业务组件依赖全量树）。
- `members` 按 `membersAccess`：管理范围/兜底=完整（可 recursive）；对口上级=仅直接成员（recursive 降级）；范围外 403。
- 写（create/update/move/remove/links/reorder）挂 `@Permission('admin:org:write')` + `OrgScopeService` 断言，锚点本体禁删禁移、建根级仅系统管理员、维度隔离（党维锚点不能动行政树）。

**用户**（user.controller + user.service）：
- `list/stats/findOneScoped` 注入 actor，服务端 where = 客户端过滤参数 ∩ 可见范围（悬空用户对有管理范围者可见=认领归位）。
- 写（create/update/softDelete/memberships/custom-fields）挂 `@Permission('admin:user:write')` + service 分维校验：
  - 行政维覆盖（目标任一行政归属 ∈ 行政写范围，或目标悬空）→ 资料 + 行政归属 + 在职状态；
  - 党维覆盖（目标党组织归属 ∈ 党维写范围）→ 联系方式 + 党组织归属；
  - 归属增删按「目标组织的 kind」对应维度定权（把人挂进/移出哪个组织，以组织定权）。
- **`replaceRoles` 改挂 `@Permission('admin:role:write')`**（内置仅 platform_admin）——机构/党委管理员管归属和资料、不配角色，堵自我提权。
- 新增 `GET /users/directory`（通讯录级：姓名/工号检索、最小字段、登录即可、不收敛）——供跨范围选人组件（知识维护人/证书受表彰人/报送个人对象/组织加成员）用。

**角色**（role.controller）：create/update/remove/replacePermissions 全挂 `@Permission('admin:role:write')`（堵「加权限点变相提权」）。

### 角色（seed.ts）

- `org_admin` 机构管理员：`admin:menu / org:read / user:read / user:write`（**不含 org:write**——不动组织树、只管人）。
- `party_admin` 党委管理员：`admin:menu / org:read / org:write / user:read / user:write`（org:write 被党维 custom 锚点限定到本党委子树）。
- 配 scope=custom（推荐，显式选单位/党委）或 subtree（自动锚本人所在单位）。dev 库经专项脚本补种（未整库 reseed，惯例）。

### 前端

- `usersApi.directory`；5 个 picker（MaintainerPicker/UserMultiPicker/ReportTargetPicker/RecipientPicker/组织页加成员）改走 directory（避免收敛后跨单位搜不到人；真正的闸在写接口）。
- Users 角色 tab 的 custom 锚点选择器升级 `ScopeOrgSelector`：行政机构/党组织两棵树切换（党委管理员切「党组织」锚定所在党委）。

### 角色页直接管理成员（2026-07-12 续 · 用户追加需求「在角色与权限中可以直接添加和删除人员」）

「角色与权限」页的「关联用户」tab 从只读改为可加/减（原来挂「请到用户管理页分配」提示）：
- 后端 role 模块加 `POST /roles/:id/users {userId,scope,scopeOrgIds?}`（追加/更新一名成员，幂等——同用户再加=改 scope）+ `DELETE /roles/:id/users/:userId`，均 `@Permission('admin:role:write')`（与 replaceRoles 同口径，仅系统管理员，防提权）。`RoleService.addUser/removeUser` 直接操作 `UserRole/UserRoleScope`（两表 `@module: role`，合规）；**不注入 OrganizationService/UserService**——org 模块已依赖 role（OrgScopeService），反向注入会成 User→Org→Role→User 环，故 role 内直 prisma 只读存在性校验，scope 白名单/custom 校验 role 模块自带一份 `ROLE_SCOPE_VALUES`。
- 前端 `ScopeOrgSelector`+`MultiOrgSelector`（组件）与 `FlatOrg`/`flattenTree`/`buildOrgIndex`（`orgFlatten.ts` 纯函数,拆开避免 fast-refresh 警告）从 Users.tsx 抽到 `features/user/components/`，user barrel 导出，Users 页与角色页共用。角色页 UsersTab 加「添加成员」面板（directory 搜人 + scope 下拉 + custom 时 ScopeOrgSelector 锚点）+ 每行「解除该角色」按钮，按 `admin:role:write` 门控显隐。
- 验证：三端门禁绿；**API 16/16**（加人 self/custom 锚点、同用户再加改 scope 不重复、userCount 同步、非法 scope/缺锚点/非 custom 带锚点/不存在用户/锚点不存在 400·404、非管理员加/减 403、移除+404）+ 浏览器（关联用户 tab 添加面板 directory 联想「吕海军」跨单位可搜、切 custom 出行政/党组织锚点选择器、3 个解除按钮、0 console error）。

## 身份来源（回答用户第 4 点）

解析器**两种都认**：配了 `scope=custom` 用显式锚点（推荐——两万人库人员调动频繁，白纸黑字最不易出意外、可跨单位授权）；否则 `scope=subtree/own` 按本人 membership 推导（零配置，但调动会悄悄改范围、多归属有歧义）。

## 多镜头对抗审查（5 维找 + 逐条怀疑者复核）→ 修 9 / 否决 8

**High**
- **认领抢人（addMembership/removeMembership 只校验目标组织不校验目标用户）**：有范围管理员可把别单位正式成员挂进自己组织从而伪造覆盖、接管账号。修：`assertTargetInDimension`——归属增删要求目标用户在操作维度上「维度内悬空 OR 已被覆盖」（党委管理员给「有行政归属、无党组织」的党员挂支部属党维认领，放行；抢别单位正式成员被拒）。
- **import 组织导入越权**：`/import/organizations` 走 `OrganizationService.create` DI 路径无范围校验，party_admin 可批量建根级行政机构。修：import 两个端点前置 `assertGlobalImporter`（要求 `resolveWrite` unrestricted，即 platform_admin / 一级 enterprise_admin），鉴权提到文件校验之前。

**Medium**
- **详情泄露身份证（findOneScoped 对读兜底/对口层返回完整档案）**：任意机关员工 GET /users/:id 读全公司身份证。修：findOneScoped 收紧为「本人 OR 管理覆盖（targetWriteCoverage）」——读兜底/对口层只给 list/directory 最小字段与 members 的 direct 名单，不经详情端点外泄 customFields/roles。
- **锚点软删绕过**：PATCH `{active:false}` 不走 `assertOrgRemovable`。修：`assertOrgUpdatable` 加 `deactivating` 参数，对 anchorIds 命中的目标拦 active:false。
- **主岗跨范围翻转**：addMembership isPrimary=true 降级范围外主岗 / removeMembership 删主岗自动提升范围外归属。修：降级前若被降级主岗在范围外则 403；自动提升受限时只在范围内剩余归属里选。
- **TaskDetail 403 静默**：跨二级单位派发人展开对方对口部门「可承揽人员」被 members 403，前端渲染成「该部门暂无人员」。修：加 `isError` 分支显示「你没有查看该部门人员的权限」。
- **import catch 吞 ForbiddenException**：scoped 导入人范围外归属静默成功产悬空用户。修：catch 只吞 ConflictException（重复归属），其余回显错误行（配合 assertGlobalImporter 后实际不再触发，双保险）。

**Low**
- **counterpart 可写 meta 自授读权**：受限 admin:org:write 持有者 PATCH in-scope org 的 meta 指向任意机构自授读权。修：resolveUserRead 收集 counterpart 目标限定 `kind==='admin' && isDept`（对口上级按定义就是机关部门，堵跨维/指向公司根）。
- **userVisibleOrgIds 死代码**：零调用 + 与两处活实现逻辑重复的口径漂移风险。修：删除（findOneScoped 改用 targetWriteCoverage 后更无引用）。

**否决 8 条误报**（怀疑者复核）：assertLinkWritable「任一侧在范围即可」（有意设计，受限角色单维度否则永远建不了关联）、党维无本人党组织兜底（防跨线放大的显式设计）、TargetPicker scope=all 非机关派发人（角色文档口径本身矛盾）、directory 丢邮箱子串搜索（通讯录级最小化，防邮箱 oracle）、党↔行政关联影响考核（只改本人党组织换算口径、有审计）、update null 判定（fail-closed 过拒、null 非法值）、写覆盖不要求读可见（HEAD 既有 REST 语义、无自建角色路径）、导入性能（走 CLI 直连脚本、非 HTTP）。

## 验证

- 门禁：backend 0 error / 0 warning / 0 cycle；react 0 error / 0 warning。
- **API 端到端 66/66**（真实库 塔运司/公司机关党委，含 9 缺陷修复回归段：认领抢人 403·悬空可认领·member 详情 403·管理范围详情 200·对口部门详情 403·锚点软删 403·两个 import 越权 403）：未登录 401 ×3；member 兜底本单位子树 + 提权堵洞 + directory 跨单位可搜 + lookup 不回归；org_admin custom 锚 A：列表=子树∪对口∪悬空、看/改 A 内 200·B 403、挂人进 A 200·进 B 403、配角色 403、对口机关部门成员可见·非对口 403、建组织 403；org_admin subtree 推导同口径；party_admin custom 锚党委 C：建/改/删本党委下支部、挪到他党委 403、他党委下建支部 403、建根级 403、删党委本体 403、行政树建组织 403（维度隔离）、党员挂支部/移出/改电话 200·改姓名 403·停用 403·建号 403·他党委党员 403。
- 浏览器：用户管理页正常（20842/417 页）、角色 tab 两新角色在列、ScopeOrgSelector 行政/党组织切换正确（切党组织→下拉变党委/支部树）、0 console error。

## 已知边界 / 后续候选

- 组织树**结构**对所有登录用户可见（只含名称/层级，不含成员/联系方式）——业务组件依赖，按决定 1 有意保留。
- directory / lookup 是通讯录级开放，与旧 lookup 一致；要更严可后续加「按范围收敛的选人」变体。
- 前端菜单仍按 `admin:*` 权限点显示；org_admin/party_admin 已含 `admin:menu` 故能进后台，页面数据由服务端裁剪。
- AdminLayout 菜单文案未区分「机构/党委管理员看到的是收敛后的数据」——纯提示层，可后续加范围横幅。
