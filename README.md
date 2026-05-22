# 党建益友

企业内部"应用底座" + 党务/业务功能门户。

把分散的内部系统(党建、办公、培训、考核)统一接入,前台门户做导航 + 搜索 + 排行,后台做组织/用户/权限/插件治理。

---

## 技术栈

- **前端**:React 19 + Vite 7 + TypeScript + Tailwind CSS 4 + shadcn/ui
- **后端**:NestJS 10 + Prisma 5 + SQLite(开发)/ PostgreSQL(生产)
- **认证**:JWT(Mock)→ Casdoor(规划)
- **微前端**:wujie(规划)

---

## 启动

### 前置要求

- Node.js ≥ 18
- npm

### 第一次

```bash
# 安装依赖
cd D:\web\djyy
npm install                       # 装根目录的 husky

cd react
npm install                       # 装前端依赖

cd ../backend
npm install                       # 装后端依赖

# 初始化数据库 + 种子数据
npx prisma migrate dev            # 跑迁移
npm run db:seed                   # 灌默认数据(组织树、字典、演示用户、首页导航)
```

### 日常开发

需要开两个终端窗口:

```bash
# 终端 1:后端
cd backend
npm run start:dev
# → http://localhost:3001/api

# 终端 2:前端
cd react
npm run dev
# → http://localhost:5173
```

浏览器访问 [http://localhost:5173](http://localhost:5173)。

### 局域网另一台电脑访问

Vite 和 Nest 都已配 `0.0.0.0` 监听。在另一台电脑 Chrome 直接输:

```
http://<开发机IP>:5173
```

(注意是 `http://` 不是 `https://`;开发机如果开了代理软件需在该软件加局域网直连规则;Windows 防火墙需放行 5173/3001 端口)

---

## 默认账号(Mock 登录)

登录页用账号点击,无需密码:

| 用户名 | 显示名 | 角色 |
|---|---|---|
| `admin` | 系统管理员 | 平台管理员(全权) |
| `wang_zs` | 王总书记 | 集团党委书记 + 集团总经理 |
| `li_mgr` | 李经理 | 第二支部书记 + 财务审计处部门经理 |
| `zhang3` | 张三 | 第一支部 普通党员 + 综合处干事 |

---

## 主要功能

### 前台(`/`)
- 公共导航 + 搜索
- 6 大分类 24 项导航(后台可改)
- 党建考核排行榜
- 热点任务 + 资讯
- 未登录可访问,需登录的项灰显且点击跳登录

### 后台(`/admin`)
- **组织与权限**:党组织树 + 行政机构树、用户管理、角色与权限
- **系统设置**:数据字典、用户自定义字段、站点设置、首页导航
- **应用管理 / 数据统计**:规划中

---

## 开发约定

详见:
- [`claude.md`](./claude.md) — 项目宪法(Claude Code 自动加载)
- [`docs/conventions.md`](./docs/conventions.md) — 命名约定 + 添加新模块清单
- [`docs/roadmap.md`](./docs/roadmap.md) — 路线图 + 决策记录

### 提交代码

```bash
git status
git add .
git commit -m "..."     # husky 自动跑 npm run check,失败会阻止 commit
git push
```

紧急绕过(几乎不需要):`git commit --no-verify -m "..."`

---

## 质量门(自动)

| 防线 | 触发 |
|---|---|
| IDE 实时标红 | 写代码时 |
| Vite dev server 终端日志 | 实时(浏览器 overlay 已关) |
| `npm run check`(在 react/) | 手动 / commit 前自动 |
| husky pre-commit | `git commit` 时自动 |

每道防线都会跑 TypeScript + ESLint。任何 error 会阻断 commit。
