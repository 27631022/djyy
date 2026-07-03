// POC 冒烟:验证应用在 PostgreSQL 10 上的核心链路(读/写/事务/审计/JSON列)
const BASE = process.env.SMOKE_BASE || 'http://localhost:3001/api';
const results = [];
let token = '';

async function step(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
    console.log(`PASS  ${name}${detail ? '  → ' + detail : ''}`);
  } catch (e) {
    results.push({ name, ok: false, detail: String(e.message || e) });
    console.log(`FAIL  ${name}  → ${e.message || e}`);
  }
}
const j = async (r) => {
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
};
const get = (p) => fetch(BASE + p, { headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(j);
const send = (m, p, body) => fetch(BASE + p, {
  method: m,
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
}).then(j);

await step('健康检查 GET /health', async () => { const r = await get('/health'); return JSON.stringify(r).slice(0, 60); });
await step('登录 POST /auth/dev-login (写审计日志=INSERT)', async () => {
  const r = await send('POST', '/auth/dev-login', { username: 'admin' });
  token = r.token; if (!token) throw new Error('no token');
  return `token ${token.slice(0, 16)}…`;
});
await step('用户画像 GET /auth/me (多表 join:组织归属+角色)', async () => {
  const r = await get('/me' in {} ? '/me' : '/auth/me');
  return `${r.name ?? r.username}, roles=${(r.roles || []).length}, memberships=${(r.memberships || r.orgs || []).length}`;
});
await step('站点设置 GET /site-settings (单行 JSON 列读取)', async () => {
  const r = await get('/site-settings'); return `title=${r.siteTitle ?? r.title ?? 'ok'}`;
});
await step('组织树 GET /organizations/tree?kind=admin (递归树组装)', async () => {
  const r = await get('/organizations/tree?kind=admin');
  const count = (nodes) => nodes.reduce((n, x) => n + 1 + count(x.children || []), 0);
  return `admin 树节点=${Array.isArray(r) ? count(r) : 'obj'}`;
});
await step('用户列表 GET /users (分页/关联查询)', async () => {
  const r = await get('/users');
  const list = Array.isArray(r) ? r : r.items || r.list || [];
  return `users=${list.length}`;
});
await step('字典读取 GET /dictionaries', async () => {
  const r = await get('/dictionaries'); return `dicts=${(Array.isArray(r) ? r : []).length}`;
});

// 写事务链路:新建字典 → 加两个字典项 → 改名 → 删除(INSERT/UPDATE/DELETE + 审计)
let dictId = null;
await step('写入 POST /dictionaries (INSERT+审计)', async () => {
  const r = await send('POST', '/dictionaries', { code: 'poc_smoke', name: 'POC冒烟字典' });
  dictId = r.id; return `id=${dictId}`;
});
await step('子项 POST /dictionaries/:id/items ×2', async () => {
  await send('POST', `/dictionaries/${dictId}/items`, { code: 'opt_a', label: '选项甲' });
  await send('POST', `/dictionaries/${dictId}/items`, { code: 'opt_b', label: '选项乙' });
  const r = await get(`/dictionaries/${dictId}`);
  const n = (r.items || []).length; if (n !== 2) throw new Error(`items=${n}, 期望 2`);
  return 'items=2';
});
await step('更新 PATCH /dictionaries/:id (UPDATE)', async () => {
  const r = await send('PATCH', `/dictionaries/${dictId}`, { name: 'POC冒烟字典·改' });
  return r.name;
});
await step('删除 DELETE /dictionaries/:id (级联 DELETE)', async () => {
  await send('DELETE', `/dictionaries/${dictId}`);
  try { await get(`/dictionaries/${dictId}`); throw new Error('删除后仍可读到'); }
  catch (e) { if (!String(e.message).includes('404')) throw e; }
  return '已删,回读 404';
});
await step('考核计分引擎 POST /assessment/scoring/trial (业务计算)', async () => {
  const r = await send('POST', '/assessment/scoring/trial', {
    scoringType: 'manual', fullScore: 6, raw: 4.5,
  });
  return JSON.stringify(r).slice(0, 80);
});

const pass = results.filter((x) => x.ok).length;
console.log(`\n==== SMOKE ${pass}/${results.length} PASS ====`);
process.exit(pass === results.length ? 0 : 1);
