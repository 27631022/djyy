import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  KeyIcon,
  PlusIcon,
  RefreshCwIcon,
  EyeIcon,
  EyeOffIcon,
  CopyIcon,
  CheckIcon,
  TrashIcon,
  EditIcon,
  PowerIcon,
  PowerOffIcon,
  AlertCircleIcon,
  CheckCircle2Icon,
  Loader2Icon,
  XIcon,
  ZapIcon,
  WalletIcon,
  ExternalLinkIcon,
  Share2Icon,
  ChevronDownIcon,
  AlertTriangleIcon,
  ServerIcon,
  CloudIcon,
  SparklesIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  externalApiApi,
  type ExternalApiDto,
  type ExternalApiTestResult,
  type ExternalApiBalance,
  type CreateExternalApiInput,
  type ResolvedConsumer,
} from "../api";
import { BrandMonogram } from "@/shared/components/AppIcon";
import {
  assetIconUrl,
  getBrand,
  matchBrand,
} from "@/shared/components/iconBrands";
import { LucideIcon } from "@/shared/components/IconPicker";
import { IconRefPicker } from "@/features/icon-library";

const PARTY = "var(--party-primary)";

export default function ExternalApisPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<ExternalApiDto | null>(null);
  const [creating, setCreating] = useState(false);

  const listQuery = useQuery({
    queryKey: ["external-apis"],
    queryFn: () => externalApiApi.list(),
  });

  const apis = listQuery.data ?? [];

  const toggleMut = useMutation({
    mutationFn: ({ provider, active }: { provider: string; active: boolean }) =>
      externalApiApi.update(provider, { active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["external-apis"] });
      toast.success("状态已更新");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "更新失败"),
  });

  const deleteMut = useMutation({
    mutationFn: (provider: string) => externalApiApi.delete(provider),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["external-apis"] });
      toast.success("已删除");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "删除失败"),
  });

  return (
    <div className="h-full flex flex-col bg-[#F7F8FA]">
      <header className="px-6 py-4 bg-white border-b border-[#E9E9E9] flex items-center gap-3">
        <SparklesIcon className="w-5 h-5" style={{ color: PARTY }} />
        <div className="flex-1">
          <h1 className="text-lg font-bold text-[#1A1A1A]">AI 接入管理</h1>
          <p className="text-xs text-[#9CA3AF] mt-0.5">
            接入大模型(及短信 / 邮件等)平台,配置 Key、Endpoint、模型与调用路由。设置后立即生效,无需重启。
          </p>
        </div>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ["external-apis"] })}
          className="p-2 rounded hover:bg-[#F7F8FA] text-[#6B7280]"
          title="刷新"
        >
          <RefreshCwIcon className="w-4 h-4" />
        </button>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-white"
          style={{ backgroundColor: PARTY }}
        >
          <PlusIcon className="w-4 h-4" />
          新增平台
        </button>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <RoutingOverview />

        <div className="text-sm font-bold text-[#1A1A1A] mb-3">已接入的模型 / 平台</div>
        {listQuery.isLoading ? (
          <div className="text-sm text-[#9CA3AF]">加载中…</div>
        ) : apis.length === 0 ? (
          <EmptyState onNew={() => setCreating(true)} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {apis.map((api) => (
              <ApiCard
                key={api.provider}
                api={api}
                onEdit={() => setEditing(api)}
                onToggle={() =>
                  toggleMut.mutate({ provider: api.provider, active: !api.active })
                }
                onDelete={() => {
                  if (
                    window.confirm(
                      `确定删除「${api.name}」?删除后业务会回退到 .env 兜底(若有)。`,
                    )
                  ) {
                    deleteMut.mutate(api.provider);
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>

      {editing && (
        <EditDialog
          api={editing}
          onCancel={() => setEditing(null)}
          onDone={() => setEditing(null)}
        />
      )}
      {creating && (
        <CreateDialog onCancel={() => setCreating(false)} onDone={() => setCreating(false)} />
      )}
    </div>
  );
}

/* ─── 模型路由总览(按应用功能 → 模型)─── */

function RoutingOverview() {
  const qc = useQueryClient();
  const { data: routes = [], isLoading } = useQuery({
    queryKey: ["external-apis", "routing"],
    queryFn: () => externalApiApi.routing(),
  });

  const bindMut = useMutation({
    mutationFn: ({ key, provider }: { key: string; provider: string | null }) =>
      externalApiApi.bindRoute(key, provider),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["external-apis", "routing"] });
      toast.success(
        r.mode === "pinned" ? `已指定:${r.resolved?.name ?? "—"}` : "已改为自动",
      );
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "更新失败"),
  });

  // 按应用分组展示
  const byApp = useMemo(() => {
    const m = new Map<string, ResolvedConsumer[]>();
    for (const r of routes) {
      const arr = m.get(r.app) ?? [];
      arr.push(r);
      m.set(r.app, arr);
    }
    return Array.from(m.entries());
  }, [routes]);

  return (
    <div className="mb-6 bg-white rounded-lg border border-[#E9E9E9] p-4">
      <div className="flex items-center gap-2 mb-0.5">
        <Share2Icon className="w-4 h-4" style={{ color: PARTY }} />
        <h2 className="text-sm font-bold text-[#1A1A1A]">模型路由</h2>
        <span className="text-[11px] text-[#9CA3AF]">
          哪个应用功能 → 调用哪个模型(可单独指定;默认按优先级自动选)
        </span>
      </div>
      {isLoading ? (
        <div className="text-xs text-[#9CA3AF] py-3">加载中…</div>
      ) : byApp.length === 0 ? (
        <div className="text-xs text-[#9CA3AF] py-3">暂无登记的 AI 消费功能</div>
      ) : (
        <div className="space-y-3 mt-2">
          {byApp.map(([app, items]) => (
            <div key={app}>
              <div className="text-[11px] font-semibold text-[#6B7280] mb-1.5">
                {app}
              </div>
              <div className="space-y-2">
                {items.map((r) => (
                  <ConsumerRow
                    key={r.consumerKey}
                    r={r}
                    binding={bindMut.isPending}
                    onBind={(provider) =>
                      bindMut.mutate({ key: r.consumerKey, provider })
                    }
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ConsumerRow({
  r,
  onBind,
  binding,
}: {
  r: ResolvedConsumer;
  onBind: (provider: string | null) => void;
  binding: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-[#F0F0F0] bg-[#FAFAFB] px-3 py-2">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className="text-xs font-medium text-[#1A1A1A] truncate"
              title={r.label}
            >
              {r.label}
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] ${capColor(r.capability)}`}
            >
              {capLabel(r.capability)}
            </span>
          </div>
          {r.description && (
            <div
              className="text-[10px] text-[#9CA3AF] mt-0.5 truncate"
              title={r.description}
            >
              {r.description}
            </div>
          )}
        </div>

        {/* 当前命中 */}
        <div className="text-xs flex items-center gap-1 flex-shrink-0">
          {r.resolved ? (
            <>
              <span className="text-[#9CA3AF]">命中</span>
              <KindBadge kind={r.resolved.kind} />
              <span className="font-medium text-[#1A1A1A]">
                {r.resolved.name}
              </span>
              {r.resolved.model && (
                <code className="text-[10px] text-[#6B7280]">
                  · {r.resolved.model}
                </code>
              )}
            </>
          ) : (
            <span className="text-red-600 font-medium">未配置可用模型</span>
          )}
        </div>

        {/* 绑定选择 */}
        <select
          value={r.pinnedProvider ?? ""}
          disabled={binding}
          onChange={(e) => onBind(e.target.value || null)}
          title="指定该功能调用的模型,或选自动(按优先级)"
          className="text-[11px] rounded border border-[#E9E9E9] px-1.5 py-1 bg-white focus:border-[var(--party-primary)] focus:outline-none max-w-[170px] disabled:opacity-50"
        >
          <option value="">⚡ 自动(优先级最高)</option>
          {r.candidates.map((c) => (
            <option key={c.provider} value={c.provider}>
              {c.name}
              {c.eligible ? "" : `(${c.reason})`}
            </option>
          ))}
        </select>

        <button
          onClick={() => setOpen((v) => !v)}
          className="p-1 rounded text-[#9CA3AF] hover:text-[var(--party-primary)]"
          title="展开备选链"
        >
          <ChevronDownIcon
            className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {r.warning && (
        <div className="mt-1.5 flex items-start gap-1 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-1">
          <AlertTriangleIcon className="w-3 h-3 flex-shrink-0 mt-px" />
          <span>{r.warning}</span>
        </div>
      )}

      {open && (
        <div className="mt-2 border-t border-[#F0F0F0] pt-2">
          <div className="text-[10px] text-[#9CA3AF] mb-1">
            备选链(按优先级降序,
            {r.mode === "pinned" ? "已指定" : "自动取最高可用"}):
          </div>
          {r.candidates.length === 0 ? (
            <div className="text-[10px] text-[#9CA3AF]">
              该能力({r.capability})下还没有任何模型 —— 去下方新增,或给某个模型的「能力标签」加上 {r.capability}
            </div>
          ) : (
            <ol className="space-y-1">
              {r.candidates.map((c) => {
                const isWinner = r.resolved?.provider === c.provider;
                return (
                  <li
                    key={c.provider}
                    className={`flex items-center gap-1.5 text-[11px] ${c.eligible ? "" : "opacity-60"}`}
                  >
                    <span className="font-mono text-[10px] text-[#9CA3AF] w-8">
                      p{c.priority}
                    </span>
                    <KindBadge kind={c.kind} />
                    <span className="font-medium text-[#1A1A1A]">{c.name}</span>
                    {c.model && (
                      <code className="text-[10px] text-[#6B7280]">
                        {c.model}
                      </code>
                    )}
                    {isWinner && (
                      <span className="text-[9px] px-1 rounded bg-green-100 text-green-700">
                        当前命中
                      </span>
                    )}
                    {r.pinnedProvider === c.provider && (
                      <span className="text-[9px] px-1 rounded bg-indigo-100 text-indigo-700">
                        已指定
                      </span>
                    )}
                    {!c.eligible && c.reason && (
                      <span className="text-[9px] px-1 rounded bg-gray-100 text-gray-500">
                        {c.reason}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

/** 云/内网 小徽章 */
function KindBadge({ kind }: { kind: string }) {
  if (kind === "internal") {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-teal-100 text-teal-700"
        title="内网自建模型"
      >
        <ServerIcon className="w-2.5 h-2.5" />
        内网
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-sky-100 text-sky-700"
      title="云平台"
    >
      <CloudIcon className="w-2.5 h-2.5" />云
    </span>
  );
}

/** 云平台 / 内部自建 切换 */
function KindToggle({
  value,
  onChange,
}: {
  value: "cloud" | "internal";
  onChange: (v: "cloud" | "internal") => void;
}) {
  return (
    <div>
      <span className="block text-[10px] font-medium text-[#6B7280] mb-1">
        类型
      </span>
      <div className="inline-flex rounded-md border border-[#E9E9E9] overflow-hidden text-xs">
        <button
          type="button"
          onClick={() => onChange("cloud")}
          className={`flex items-center gap-1 px-3 py-1.5 ${
            value === "cloud"
              ? "bg-[var(--party-primary)] text-white"
              : "bg-white text-[#6B7280] hover:bg-[#F7F8FA]"
          }`}
        >
          <CloudIcon className="w-3.5 h-3.5" />
          云平台
        </button>
        <button
          type="button"
          onClick={() => onChange("internal")}
          className={`flex items-center gap-1 px-3 py-1.5 border-l border-[#E9E9E9] ${
            value === "internal"
              ? "bg-[var(--party-primary)] text-white"
              : "bg-white text-[#6B7280] hover:bg-[#F7F8FA]"
          }`}
        >
          <ServerIcon className="w-3.5 h-3.5" />
          内部自建
        </button>
      </div>
      {value === "internal" && (
        <p className="mt-1 text-[10px] text-[#9CA3AF] leading-relaxed">
          内网自建(vLLM / Xinference / Ollama 等,OpenAI 兼容)。Endpoint 填内网地址如{" "}
          <code>http://10.x.x.x:8000/v1</code>;API Key 可留空(内网直连)。
        </p>
      )}
    </div>
  );
}

/* ─── Empty state ─── */

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center py-16">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
        style={{ backgroundColor: "rgb(255, 240, 242)" }}
      >
        <KeyIcon className="w-8 h-8" style={{ color: PARTY }} />
      </div>
      <h3 className="text-base font-bold text-[#1A1A1A] mb-1">还没接入任何外部 API</h3>
      <p className="text-xs text-[#9CA3AF] mb-4 max-w-md">
        新增 LLM/短信/邮件等平台配置,所有业务模块通过统一接口读取 key
      </p>
      <button
        onClick={onNew}
        className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white"
        style={{ backgroundColor: PARTY }}
      >
        <PlusIcon className="w-4 h-4" />
        新增平台
      </button>
    </div>
  );
}

/* ─── 每张卡片 ─── */

function ApiCard({
  api,
  onEdit,
  onToggle,
  onDelete,
}: {
  api: ExternalApiDto;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [keyVisible, setKeyVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [testResult, setTestResult] = useState<ExternalApiTestResult | null>(null);
  const [balance, setBalance] = useState<ExternalApiBalance | null>(null);

  function handleCopy() {
    if (!api.apiKeyMasked) return;
    // 仅复制脱敏值(实际 key 已经在服务端,不向前端暴露)
    navigator.clipboard.writeText(api.apiKeyMasked).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const testMut = useMutation({
    mutationFn: () => externalApiApi.test(api.provider, {}),
    onSuccess: (r) => {
      setTestResult(r);
      if (r.ok) toast.success(`测试通过 · ${r.latencyMs}ms`);
      else toast.error(`测试失败:${r.message}`);
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "测试失败"),
  });

  const balanceMut = useMutation({
    mutationFn: () => externalApiApi.balance(api.provider),
    onSuccess: (b) => {
      setBalance(b);
      if (b.status === 'supported') toast.success("余额已更新");
      else if (b.status === 'not_supported') toast.info(b.detail ?? "暂不支持");
      else toast.error(b.detail ?? "查询失败");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "查询失败"),
  });

  return (
    <div
      className={`bg-white rounded-lg border p-4 transition-all hover:shadow-md ${
        api.active ? "border-[#E9E9E9]" : "border-[#F0F0F0] opacity-70"
      }`}
    >
      <div className="flex items-start gap-2 mb-2">
        <ProviderAvatar provider={api.provider} kind={api.kind} iconRef={api.iconRef} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-[#1A1A1A] truncate" title={api.name}>
            {api.name}
          </div>
          <div className="text-[10px] text-[#9CA3AF] font-mono">{api.provider}</div>
        </div>
        {/* 状态标识:内网自建按「有无 endpoint」判就绪(无需 Key);云平台按「有无 Key」 */}
        {api.kind === "internal" ? (
          api.apiUrl ? (
            <span
              className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700"
              title="内网自建模型,无需 Key,已可调用"
            >
              <CheckCircle2Icon className="w-3 h-3" />
              内网就绪
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
              <AlertCircleIcon className="w-3 h-3" />
              缺 Endpoint
            </span>
          )
        ) : api.hasKey ? (
          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">
            <CheckCircle2Icon className="w-3 h-3" />
            已配置
          </span>
        ) : api.envFallback ? (
          <span
            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700"
            title=".env 中已设置兜底,可直接使用,但建议在此录入便于管理"
          >
            ENV
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
            <AlertCircleIcon className="w-3 h-3" />
            未配置
          </span>
        )}
      </div>

      {api.description && (
        <p className="text-xs text-[#6B7280] mt-1 line-clamp-2" title={api.description}>
          {api.description}
        </p>
      )}

      {/* kind + priority + capabilities chip 行 */}
      <div className="mt-2 flex items-center gap-1 flex-wrap">
        <KindBadge kind={api.kind} />
        <span
          className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#F0F4FF] text-[#4F46E5]"
          title="业务优先级 — 数字大的优先被选用"
        >
          prio {api.priority}
        </span>
        {api.capabilities
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((cap) => (
            <span
              key={cap}
              className={`px-1.5 py-0.5 rounded text-[10px] ${capColor(cap)}`}
              title={`英文标识:${cap}`}
            >
              {capLabel(cap)}
            </span>
          ))}
      </div>

      <div className="mt-3 space-y-1.5 text-[11px]">
        <Field label="API Key">
          {api.hasKey ? (
            <div className="flex items-center gap-1.5 min-w-0">
              <code className="text-[#1A1A1A] truncate flex-1">
                {keyVisible
                  ? api.apiKeyMasked
                  : (api.apiKeyMasked ?? "").replace(/[^*]/g, "•")}
              </code>
              <button
                onClick={() => setKeyVisible((v) => !v)}
                className="p-0.5 rounded text-[#9CA3AF] hover:text-[var(--party-primary)]"
                title={keyVisible ? "隐藏" : "查看"}
              >
                {keyVisible ? (
                  <EyeOffIcon className="w-3 h-3" />
                ) : (
                  <EyeIcon className="w-3 h-3" />
                )}
              </button>
              <button
                onClick={handleCopy}
                className="p-0.5 rounded text-[#9CA3AF] hover:text-[var(--party-primary)]"
                title="复制(脱敏值)"
              >
                {copied ? (
                  <CheckIcon className="w-3 h-3 text-green-600" />
                ) : (
                  <CopyIcon className="w-3 h-3" />
                )}
              </button>
            </div>
          ) : (
            <span className="text-[#9CA3AF]">— 未录入 —</span>
          )}
        </Field>
        {api.apiUrl && (
          <Field label="Endpoint">
            <code className="text-[#6B7280] truncate block" title={api.apiUrl}>
              {api.apiUrl}
            </code>
          </Field>
        )}
        {api.model && (
          <Field label="文本模型">
            <code className="text-[#6B7280] truncate block">{api.model}</code>
          </Field>
        )}
        {api.visionModel && (
          <Field label="视觉模型">
            <code className="text-[#6B7280] truncate block" title={api.visionModel}>
              {api.visionModel}
            </code>
          </Field>
        )}
      </div>

      {/* 测试 / 余额 结果 */}
      {(testResult || balance) && (
        <div className="mt-3 space-y-1.5">
          {testResult && (
            <div
              className={`rounded px-2 py-1.5 text-[11px] flex items-start gap-1.5 ${
                testResult.ok
                  ? "bg-green-50 text-green-800 border border-green-100"
                  : "bg-red-50 text-red-800 border border-red-100"
              }`}
            >
              {testResult.ok ? (
                <CheckCircle2Icon className="w-3.5 h-3.5 flex-shrink-0 mt-px text-green-600" />
              ) : (
                <AlertCircleIcon className="w-3.5 h-3.5 flex-shrink-0 mt-px text-red-600" />
              )}
              <span className="flex-1 min-w-0">
                {testResult.ok ? "测试通过" : "测试失败"} · {testResult.latencyMs}ms
                <br />
                <span className="opacity-75 break-all">{testResult.message}</span>
              </span>
            </div>
          )}
          {balance && (
            <BalanceLine balance={balance} />
          )}
        </div>
      )}

      {/* 操作行 1:测试 / 余额 / 充值 */}
      <div className="mt-3 pt-3 border-t border-[#F0F0F0] flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => testMut.mutate()}
          disabled={testMut.isPending}
          className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border border-[#E9E9E9] hover:border-[var(--party-primary)] hover:text-[var(--party-primary)] disabled:opacity-50"
          title="发一条最小 chat 请求验证连通性"
        >
          {testMut.isPending ? (
            <Loader2Icon className="w-3 h-3 animate-spin" />
          ) : (
            <ZapIcon className="w-3 h-3" />
          )}
          测试
        </button>
        <button
          onClick={() => balanceMut.mutate()}
          disabled={balanceMut.isPending}
          className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border border-[#E9E9E9] hover:border-[var(--party-primary)] hover:text-[var(--party-primary)] disabled:opacity-50"
          title="查询账户余额(部分平台支持)"
        >
          {balanceMut.isPending ? (
            <Loader2Icon className="w-3 h-3 animate-spin" />
          ) : (
            <WalletIcon className="w-3 h-3" />
          )}
          余额
        </button>
        {api.rechargeUrl && (
          <a
            href={api.rechargeUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border border-[#E9E9E9] text-[#6B7280] hover:text-[var(--party-primary)] hover:border-[var(--party-primary)]"
            title="到平台控制台查看用量 / 充值"
          >
            <ExternalLinkIcon className="w-3 h-3" />
            充值/管理
          </a>
        )}
      </div>

      {/* 操作行 2:编辑 / 启停 / 删除 */}
      <div className="mt-1.5 flex items-center gap-1.5">
        <button
          onClick={onEdit}
          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-xs font-medium border border-[#E9E9E9] hover:border-[var(--party-primary)] hover:text-[var(--party-primary)] hover:bg-[#FFF7F8] transition-colors"
        >
          <EditIcon className="w-3 h-3" />
          编辑
        </button>
        <button
          onClick={onToggle}
          className="p-1.5 rounded text-[#6B7280] hover:bg-[#F7F8FA]"
          title={api.active ? "禁用" : "启用"}
        >
          {api.active ? (
            <PowerIcon className="w-3.5 h-3.5" />
          ) : (
            <PowerOffIcon className="w-3.5 h-3.5" />
          )}
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 rounded text-[#9CA3AF] hover:text-[#EF4444] hover:bg-[#FEE2E2]"
          title="删除"
        >
          <TrashIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function BalanceLine({ balance }: { balance: ExternalApiBalance }) {
  if (balance.status === 'supported' && balance.balance !== undefined) {
    return (
      <div className="rounded px-2 py-1.5 text-[11px] bg-blue-50 text-blue-800 border border-blue-100 flex items-center gap-1.5">
        <WalletIcon className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
        <span className="flex-1">
          余额 <span className="font-bold text-base align-middle">{balance.balance}</span>{" "}
          {balance.unit}
          {balance.detail && (
            <span className="ml-2 opacity-75">· {balance.detail}</span>
          )}
        </span>
      </div>
    );
  }
  return (
    <div className="rounded px-2 py-1.5 text-[11px] bg-amber-50 text-amber-800 border border-amber-100 flex items-start gap-1.5">
      <AlertCircleIcon className="w-3.5 h-3.5 flex-shrink-0 text-amber-600 mt-px" />
      <span className="flex-1">{balance.detail ?? "无法查询"}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-[#9CA3AF] flex-shrink-0 w-14">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

/* ─── 编辑 dialog ─── */

/**
 * TTS 播报风格控制指令默认值(与后端 exhibition-narration.service.ts 的
 * DEFAULT_TTS_CONTROL_INSTRUCTION 保持一致;改一处两处同步)。
 */
const DEFAULT_TTS_CONTROL_INSTRUCTION =
  "国企展厅专职讲解员,面向参观者娓娓道来。整体放慢语速、沉稳舒缓:短语之间短促停顿,长句在自然换气处停顿,段落结尾留长停顿;核心关键词重读突出,朗读富于起伏顿挫、层次分明,每处分层都留出思考的间隙,咬字放慢、气息松弛。切忌语速过快、机械匀速、一口气念完长句或赶稿式速读——宁可慢一点、稳一点,也不要平铺直叙、通篇赶语速。";

function EditDialog({
  api,
  onCancel,
  onDone,
}: {
  api: ExternalApiDto;
  onCancel: () => void;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(api.name);
  const [description, setDescription] = useState(api.description ?? "");
  const [kind, setKind] = useState<"cloud" | "internal">(
    api.kind === "internal" ? "internal" : "cloud",
  );
  const [iconRef, setIconRef] = useState(api.iconRef ?? "");
  const [apiKeyDraft, setApiKeyDraft] = useState(""); // 空白 = 不动 key
  const [clearKey, setClearKey] = useState(false);
  const [apiUrl, setApiUrl] = useState(api.apiUrl ?? "");
  const [model, setModel] = useState(api.model ?? "");
  const [visionModel, setVisionModel] = useState(api.visionModel ?? "");
  const [imageModel, setImageModel] = useState(api.imageModel ?? "");
  const [ttsModel, setTtsModel] = useState(api.ttsModel ?? "");
  const [ttsVoice, setTtsVoice] = useState(api.ttsVoice ?? "");
  const [ttsControlInstruction, setTtsControlInstruction] = useState(
    api.ttsControlInstruction || DEFAULT_TTS_CONTROL_INSTRUCTION,
  );
  const [rechargeUrl, setRechargeUrl] = useState(api.rechargeUrl ?? "");
  const [priority, setPriority] = useState(api.priority);
  const [capabilities, setCapabilities] = useState(api.capabilities);
  const [webSearch, setWebSearch] = useState(api.webSearch);
  const [active, setActive] = useState(api.active);
  const [testResult, setTestResult] = useState<ExternalApiTestResult | null>(null);

  const testMut = useMutation({
    // 编辑时的「测试」用当前 draft 值,允许在保存前先验
    mutationFn: () =>
      externalApiApi.test(api.provider, {
        apiKey: apiKeyDraft || undefined,
        apiUrl: apiUrl || undefined,
        model: model || undefined,
      }),
    onSuccess: (r) => {
      setTestResult(r);
      if (r.ok) toast.success(`测试通过 · ${r.latencyMs}ms`);
      else toast.error(`测试失败:${r.message}`);
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "测试失败"),
  });

  const mut = useMutation({
    mutationFn: () =>
      externalApiApi.update(api.provider, {
        kind,
        iconRef,
        name,
        description: description || undefined,
        apiKey: clearKey ? "" : apiKeyDraft || undefined,
        apiUrl: apiUrl || undefined,
        model: model || undefined,
        visionModel: visionModel || undefined,
        imageModel: imageModel || undefined,
        ttsModel: ttsModel || undefined,
        ttsVoice: ttsVoice || undefined,
        ttsControlInstruction: ttsControlInstruction.trim() || undefined,
        rechargeUrl: rechargeUrl || undefined,
        priority,
        capabilities,
        webSearch,
        active,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["external-apis"] });
      toast.success("已保存");
      onDone();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "保存失败"),
  });

  return (
    <Modal title={`编辑 · ${api.name}`} onCancel={onCancel}>
      <div className="space-y-3">
        <LabeledInput label="显示名 *" value={name} onChange={setName} />
        <LabeledInput label="描述" value={description} onChange={setDescription} multiline />
        <KindToggle value={kind} onChange={setKind} />
        <div>
          <span className="block text-[10px] font-medium text-[#6B7280] mb-1">
            图标(卡片左上角头像;留空按品牌名自动)
          </span>
          <IconRefPicker value={iconRef} onChange={setIconRef} />
        </div>
        <div>
          <div className="text-[10px] font-medium text-[#6B7280] mb-1">
            API Key{" "}
            {api.hasKey && (
              <span className="ml-1 text-[#9CA3AF] font-normal">
                当前:{api.apiKeyMasked}
              </span>
            )}
          </div>
          <input
            type="password"
            value={apiKeyDraft}
            onChange={(e) => {
              setApiKeyDraft(e.target.value);
              if (e.target.value) setClearKey(false);
            }}
            placeholder={api.hasKey ? "留空保持不变,或输入新值覆盖" : "粘贴你的 API Key"}
            className="w-full px-2 py-1.5 text-xs rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none font-mono"
          />
          {api.hasKey && (
            <label className="mt-2 flex items-center gap-1.5 text-[11px] text-[#6B7280] cursor-pointer">
              <input
                type="checkbox"
                checked={clearKey}
                onChange={(e) => {
                  setClearKey(e.target.checked);
                  if (e.target.checked) setApiKeyDraft("");
                }}
              />
              清空 Key(让业务回退到 .env 兜底)
            </label>
          )}
        </div>
        <LabeledInput
          label="Endpoint(可选,留空走平台默认)"
          value={apiUrl}
          onChange={setApiUrl}
          mono
        />
        <LabeledInput label="文本模型" value={model} onChange={setModel} mono />
        <LabeledInput
          label="视觉模型(图像/OCR 用,留空则用文本模型兜底)"
          value={visionModel}
          onChange={setVisionModel}
          placeholder="如 doubao-1.5-vision-pro-32k / qwen-vl-max / gpt-4o"
          mono
        />
        <LabeledInput
          label="图像生成模型(图生图 / AI 头像;出图,需平台开通,与文本/视觉不通用)"
          value={imageModel}
          onChange={setImageModel}
          placeholder="如 doubao-seededit-3-0-i2i-250628"
          mono
        />
        <LabeledInput
          label="语音合成模型(TTS;3D 展厅解说员配音,需勾选 tts 能力)"
          value={ttsModel}
          onChange={setTtsModel}
          placeholder="如 doubao-tts / 平台的语音合成模型名"
          mono
        />
        <LabeledInput
          label="语音音色(TTS voice;平台各自的音色标识,留空用默认)"
          value={ttsVoice}
          onChange={setTtsVoice}
          placeholder="如 zh_female_xxx / 平台音色名"
          mono
        />
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-medium text-[#6B7280]">
              播报风格控制指令(Control Instruction;语速/停顿/顿挫,VoxCPM 直接生效)
            </span>
            <button
              type="button"
              className="text-[10px] text-[var(--party-primary)] hover:underline"
              onClick={() => setTtsControlInstruction(DEFAULT_TTS_CONTROL_INSTRUCTION)}
            >
              恢复默认
            </button>
          </div>
          <textarea
            value={ttsControlInstruction}
            onChange={(e) => setTtsControlInstruction(e.target.value)}
            rows={5}
            placeholder="留空用内置默认(国企展厅讲解员:慢速、分层停顿、顿挫、不赶语速)"
            className="w-full px-2 py-1.5 text-xs rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none resize-y leading-relaxed"
          />
          <p className="text-[10px] text-[#9CA3AF] mt-1 leading-relaxed">
            控制解说员配音的语速与停顿节奏。VoxCPM 走 control_instruction、云 OpenAI 兼容 TTS 走 instructions(gpt-4o-mini-tts 等)、IndexTTS2 作情感描述文本。留空则用内置默认。
          </p>
        </div>
        <LabeledInput
          label="充值/管理页 URL(可选)"
          value={rechargeUrl}
          onChange={setRechargeUrl}
          placeholder="如 https://platform.deepseek.com/top_up"
        />

        {/* 优先级 */}
        <label className="block">
          <span className="block text-[10px] font-medium text-[#6B7280] mb-1">
            业务优先级 0-100(数字大的优先被选用;仅"自动"路由时生效)
          </span>
          <input
            type="number"
            min={0}
            max={100}
            value={priority}
            onChange={(e) => setPriority(Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)))}
            className="w-full px-2 py-1.5 text-xs font-mono rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none"
          />
        </label>
        {/* 能力标签(点选) */}
        <CapabilitiesPicker value={capabilities} onChange={setCapabilities} />

        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={webSearch}
            onChange={(e) => setWebSearch(e.target.checked)}
          />
          联网搜索(千问 enable_search;知识库「AI 联网检索归档」据此显隐)
        </label>

        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          启用(禁用后业务回退到下一个优先级的 provider)
        </label>

        {/* 测试连接 — 在保存前验证当前编辑值 */}
        <div className="pt-2 border-t border-[#F0F0F0]">
          <button
            type="button"
            onClick={() => testMut.mutate()}
            disabled={testMut.isPending}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium border border-[#E9E9E9] hover:border-[var(--party-primary)] hover:text-[var(--party-primary)] disabled:opacity-50"
          >
            {testMut.isPending ? (
              <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ZapIcon className="w-3.5 h-3.5" />
            )}
            测试当前值(可未保存)
          </button>
          {testResult && (
            <div
              className={`mt-2 rounded px-2 py-1.5 text-[11px] flex items-start gap-1.5 ${
                testResult.ok
                  ? "bg-green-50 text-green-800 border border-green-100"
                  : "bg-red-50 text-red-800 border border-red-100"
              }`}
            >
              {testResult.ok ? (
                <CheckCircle2Icon className="w-3.5 h-3.5 flex-shrink-0 mt-px text-green-600" />
              ) : (
                <AlertCircleIcon className="w-3.5 h-3.5 flex-shrink-0 mt-px text-red-600" />
              )}
              <span className="flex-1 break-all">
                {testResult.ok ? "通过" : "失败"} · {testResult.latencyMs}ms ·{" "}
                {testResult.message}
              </span>
            </div>
          )}
        </div>
      </div>
      <DialogFooter
        onCancel={onCancel}
        onConfirm={() => mut.mutate()}
        loading={mut.isPending}
        confirmText="保存"
      />
    </Modal>
  );
}

/* ─── 新增 dialog ─── */

function CreateDialog({
  onCancel,
  onDone,
}: {
  onCancel: () => void;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<CreateExternalApiInput>({
    provider: "",
    kind: "cloud",
    iconRef: "",
    name: "",
    description: "",
    apiKey: "",
    apiUrl: "",
    model: "",
    visionModel: "",
    rechargeUrl: "",
    capabilities: "chat",
    priority: 50,
    active: true,
  });

  const mut = useMutation({
    mutationFn: () =>
      externalApiApi.create({
        ...draft,
        provider: draft.provider.trim().toLowerCase(),
        description: draft.description || undefined,
        apiKey: draft.apiKey || undefined,
        apiUrl: draft.apiUrl || undefined,
        model: draft.model || undefined,
        iconRef: draft.iconRef || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["external-apis"] });
      toast.success("已新增");
      onDone();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "新增失败"),
  });

  function patch<K extends keyof CreateExternalApiInput>(
    k: K,
    v: CreateExternalApiInput[K],
  ) {
    setDraft((p) => ({ ...p, [k]: v }));
  }

  const canSave =
    /^[a-z0-9-]+$/.test(draft.provider) &&
    draft.provider.length > 0 &&
    draft.name.trim().length > 0;

  return (
    <Modal title="新增外部 API 接入" onCancel={onCancel}>
      <div className="space-y-3">
        <LabeledInput
          label="provider * (小写英文/数字/横线,如 anthropic / sms-aliyun)"
          value={draft.provider}
          onChange={(v) => patch("provider", v.toLowerCase())}
          mono
        />
        <LabeledInput
          label="显示名 *"
          value={draft.name}
          onChange={(v) => patch("name", v)}
          placeholder="如:Anthropic Claude"
        />
        <LabeledInput
          label="描述"
          value={draft.description ?? ""}
          onChange={(v) => patch("description", v)}
          multiline
        />
        <KindToggle
          value={draft.kind ?? "cloud"}
          onChange={(v) => patch("kind", v)}
        />
        <div>
          <span className="block text-[10px] font-medium text-[#6B7280] mb-1">
            图标(卡片左上角头像;留空按品牌名自动)
          </span>
          <IconRefPicker
            value={draft.iconRef ?? ""}
            onChange={(v) => patch("iconRef", v)}
          />
        </div>
        <div>
          <div className="text-[10px] font-medium text-[#6B7280] mb-1">
            API Key{draft.kind === "internal" ? "(内网可留空)" : ""}
          </div>
          <input
            type="password"
            value={draft.apiKey ?? ""}
            onChange={(e) => patch("apiKey", e.target.value)}
            placeholder="粘贴 Key(可留空稍后再填)"
            className="w-full px-2 py-1.5 text-xs rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none font-mono"
          />
        </div>
        <LabeledInput
          label="Endpoint"
          value={draft.apiUrl ?? ""}
          onChange={(v) => patch("apiUrl", v)}
          mono
        />
        <LabeledInput
          label="文本模型(对话/抽取用)"
          value={draft.model ?? ""}
          onChange={(v) => patch("model", v)}
          placeholder="如 Qwen3-32B / deepseek-chat"
          mono
        />
        <LabeledInput
          label="视觉模型(多模态/图片识别用,可留空)"
          value={draft.visionModel ?? ""}
          onChange={(v) => patch("visionModel", v)}
          placeholder="如 Qwen2.5-VL / doubao-vision / gpt-4o"
          mono
        />
        <LabeledInput
          label="图像生成模型(图生图 / AI 头像;出图,可留空)"
          value={draft.imageModel ?? ""}
          onChange={(v) => patch("imageModel", v)}
          placeholder="如 doubao-seededit-3-0-i2i-250628"
          mono
        />
        <CapabilitiesPicker
          value={draft.capabilities ?? "chat"}
          onChange={(v) => patch("capabilities", v)}
        />
        <label className="block">
          <span className="block text-[10px] font-medium text-[#6B7280] mb-1">
            优先级 0-100(大者优先;仅"自动"路由时生效)
          </span>
          <input
            type="number"
            min={0}
            max={100}
            value={draft.priority ?? 50}
            onChange={(e) =>
              patch(
                "priority",
                Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)),
              )
            }
            className="w-full px-2 py-1.5 text-xs font-mono rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none"
          />
        </label>
        <LabeledInput
          label="充值/管理页 URL"
          value={draft.rechargeUrl ?? ""}
          onChange={(v) => patch("rechargeUrl", v)}
          placeholder="平台官方控制台地址"
        />
      </div>
      <DialogFooter
        onCancel={onCancel}
        onConfirm={() => mut.mutate()}
        loading={mut.isPending}
        confirmText="新增"
        disabled={!canSave}
      />
    </Modal>
  );
}

/* ─── 通用 ─── */

function Modal({
  title,
  onCancel,
  children,
}: {
  title: string;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-lg w-[520px] max-h-[90vh] overflow-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-[#1A1A1A]">{title}</h3>
          <button
            onClick={onCancel}
            className="p-1 rounded text-[#9CA3AF] hover:text-red-600 hover:bg-red-50"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function DialogFooter({
  onCancel,
  onConfirm,
  loading,
  confirmText,
  disabled,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  loading: boolean;
  confirmText: string;
  disabled?: boolean;
}) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <button
        onClick={onCancel}
        disabled={loading}
        className="px-3 py-1.5 rounded text-sm border border-[#E9E9E9] hover:bg-[#F7F8FA]"
      >
        取消
      </button>
      <button
        onClick={onConfirm}
        disabled={loading || disabled}
        className="px-4 py-1.5 rounded text-sm font-medium text-white disabled:opacity-50"
        style={{ backgroundColor: "var(--party-primary)" }}
      >
        {loading ? (
          <span className="flex items-center gap-1.5">
            <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
            处理中
          </span>
        ) : (
          confirmText
        )}
      </button>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  mono?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] font-medium text-[#6B7280] mb-1">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className="w-full px-2 py-1.5 text-xs rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none resize-none"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full px-2 py-1.5 text-xs rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none ${
            mono ? "font-mono" : ""
          }`}
        />
      )}
    </label>
  );
}

/** 能力标签 → 中文显示名(底层 DB 仍存英文,这里仅 UI 翻译) */
const CAP_LABELS: Record<string, string> = {
  chat: "对话",
  vision: "视觉",
  reasoning: "推理",
  image: "图像生成",
  embedding: "向量",
  tts: "语音合成",
  asr: "语音识别",
};

function capLabel(cap: string): string {
  const k = cap.toLowerCase();
  return CAP_LABELS[k] ?? cap;
}

/** 能力标签颜色 */
function capColor(cap: string): string {
  switch (cap.toLowerCase()) {
    case "chat":
      return "bg-blue-100 text-blue-700";
    case "vision":
      return "bg-purple-100 text-purple-700";
    case "reasoning":
      return "bg-emerald-100 text-emerald-700";
    case "image":
      return "bg-rose-100 text-rose-700";
    case "embedding":
      return "bg-amber-100 text-amber-700";
    case "tts":
    case "asr":
      return "bg-pink-100 text-pink-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

/**
 * 大模型 / 平台头像。优先级:
 *   1. 显式 iconRef(asset 自定义图 / brand 品牌 / lucide)
 *   2. provider 名模糊匹配到品牌 → 品牌色简标
 *   3. 内网自建 → 服务器图标
 *   4. 其它 → 哈希字母标
 * 品牌表 / 自定义图标都来自中央图标库(shared/components/AppIcon + 后端 IconAsset)。
 */
function ProviderAvatar({
  provider,
  kind,
  iconRef,
}: {
  provider: string;
  kind: string;
  iconRef?: string | null;
}) {
  const box =
    "w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 overflow-hidden";
  if (iconRef) {
    if (iconRef.startsWith("asset:")) {
      return (
        <img
          src={assetIconUrl(iconRef.slice(6))}
          alt=""
          title={provider}
          className={`${box} object-contain bg-white border border-[#F0F0F0]`}
        />
      );
    }
    if (iconRef.startsWith("brand:")) {
      return (
        <BrandMonogram
          brand={getBrand(iconRef.slice(6))}
          fallback={iconRef.slice(6)}
          size={36}
        />
      );
    }
    const name = iconRef.startsWith("lucide:") ? iconRef.slice(7) : iconRef;
    return (
      <div
        className={box}
        style={{
          backgroundColor: "color-mix(in srgb, var(--party-primary) 10%, white)",
        }}
      >
        <LucideIcon
          name={name}
          className="w-4 h-4"
          style={{ color: "var(--party-primary)" }}
        />
      </div>
    );
  }
  const brand = matchBrand(provider);
  if (brand) return <BrandMonogram brand={brand} size={36} />;
  if (kind === "internal") {
    return (
      <div className={box} style={{ backgroundColor: "#0D9488" }} title="内网自建模型">
        <ServerIcon className="w-4 h-4 text-white" />
      </div>
    );
  }
  return (
    <div
      className={`${box} text-white font-bold text-[11px]`}
      style={{ backgroundColor: providerColor(provider) }}
      title={provider}
    >
      {provider.slice(0, 2).toUpperCase()}
    </div>
  );
}

/** 能力标签点选(多选 chip;value/onChange 用逗号分隔字符串,与后端契约一致) */
const ALL_CAPS = ["chat", "vision", "reasoning", "image", "embedding", "tts", "asr"];
function CapabilitiesPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const set = new Set(
    value
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  function toggle(cap: string) {
    const next = new Set(set);
    if (next.has(cap)) next.delete(cap);
    else next.add(cap);
    // 按固定顺序输出,避免顺序抖动
    onChange(ALL_CAPS.filter((c) => next.has(c)).join(","));
  }
  return (
    <div>
      <span className="block text-[10px] font-medium text-[#6B7280] mb-1">
        能力标签(点选,可多选 —— 决定该模型能被哪些功能调用)
      </span>
      <div className="flex flex-wrap gap-1.5">
        {ALL_CAPS.map((cap) => {
          const on = set.has(cap);
          return (
            <button
              key={cap}
              type="button"
              onClick={() => toggle(cap)}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] border transition-colors ${
                on
                  ? `${capColor(cap)} border-transparent font-medium`
                  : "bg-white text-[#9CA3AF] border-[#E9E9E9] hover:border-[var(--party-primary)] hover:text-[#6B7280]"
              }`}
            >
              {on && <CheckIcon className="w-3 h-3" />}
              {capLabel(cap)}
              <span className="opacity-50 font-mono text-[9px]">{cap}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 简单按字符串 hash 给 provider 分配一个稳定主题色 — 仅装饰 */
function providerColor(provider: string): string {
  const palette = ["#8B5CF6", "#06B6D4", "#10B981", "#F59E0B", "#EF4444", "#EC4899", "#3B82F6"];
  let h = 0;
  for (const c of provider) h = (h * 31 + c.charCodeAt(0)) | 0;
  return palette[Math.abs(h) % palette.length];
}
