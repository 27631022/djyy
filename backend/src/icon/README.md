# icon 模块

中央图标库的**自定义上传**部分。

## 拥有的表
- `IconAsset` —— 用户上传的自定义图标。**内联存 `dataUrl`**(`data:<mime>;base64,...`),不进 storage:图标小、且要在任意页面(含公开首页)用 `<img>` 渲染,内联最省事、零鉴权、无过期。

## 不在本表的
- **内置品牌图标**(deepseek / 豆包 / 通义 …)是**前端 monogram 注册表**(`shared/components/iconBrands.ts`),按品牌色 + 简标生成,不落库。
- **lucide 图标** 是前端按名渲染,不落库。

## 图标引用格式(全站统一,存在各业务字段里)
- `lucide:Award` 或裸 `Award`(兼容旧导航数据)→ lucide 图标
- `brand:deepseek` → 内置品牌 monogram
- `asset:<id>` → 本表上传的自定义图标

前端 `<AppIcon icon={ref} />` 统一解析渲染;asset 走 `<img src="/api/public/icons/:id">`。

## HTTP
| 路由 | 鉴权 | 说明 |
|---|---|---|
| `GET /icons` | 登录 | 列表(含 dataUrl,供选择器/管理页) |
| `POST /icons` | 登录 | multipart 上传(`file` + 可选 `name`),≤512KB,SVG/PNG/WebP/JPG/GIF |
| `DELETE /icons/:id` | 登录 | 删除 |
| `GET /public/icons/:id` | 公开 | 取字节给 `<img>`;带 `nosniff` + 严格 CSP(防 SVG 直开型 XSS) |

## 约束
- 渲染一律走 `<img>`(SVG 在 img 上下文不执行脚本),不要 inline `<svg dangerouslySetInnerHTML>`。
- 删除自定义图标后,引用了它的业务字段(如 `ExternalApi.iconRef='asset:xx'`)会在 `AppIcon` 里优雅回退(渲染失败 → 占位)。孤儿引用清理交由后续。
