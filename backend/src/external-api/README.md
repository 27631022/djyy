# external-api 模块

## owns

- `ExternalApi` 表(@module: external-api)

## 对外 API

### REST(`@UseGuards(AuthGuard)`)

- `GET    /api/external-apis` 列表(apiKey 脱敏)
- `GET    /api/external-apis/:provider`
- `POST   /api/external-apis` 新增
- `PATCH  /api/external-apis/:provider` 编辑(apiKey 传空串 = 清空,不传 = 保持)
- `DELETE /api/external-apis/:provider`

### NestJS DI

- `ExternalApiService.getKeyForProvider(provider)` —
  其它模块拉真实 key,返回 `{ apiKey, apiUrl, model, source: 'db' | 'env' | 'none' }`

## 设计要点

- DB.apiKey 优先,未配置时回退 `process.env.<UPPER>_API_KEY`,详见
  `ENV_FALLBACK_KEYS` 表。
- API 响应中 `apiKey` 永远脱敏(前 4 + 后 4)。`apiKeyMasked` + `hasKey` 字段给前端 UI 用。
- provider 命名:小写英文/数字/横线(`deepseek` / `sms-aliyun`)。
- 模块标 `@Global()`,业务模块 inject `ExternalApiService` 无需 import 本模块。

## 审计

- `api.create` / `api.update` / `api.delete`
- key 内容不入审计 detail,只记 `apiKeyChanged: true`。
