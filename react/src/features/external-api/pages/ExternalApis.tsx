import { useState } from "react";
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
} from "lucide-react";
import { toast } from "sonner";
import {
  externalApiApi,
  type ExternalApiDto,
  type ExternalApiTestResult,
  type ExternalApiBalance,
  type CreateExternalApiInput,
} from "../api";

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
        <KeyIcon className="w-5 h-5" style={{ color: PARTY }} />
        <div className="flex-1">
          <h1 className="text-lg font-bold text-[#1A1A1A]">外部 API 接入</h1>
          <p className="text-xs text-[#9CA3AF] mt-0.5">
            管理 LLM/短信/邮件等平台的 API Key、Endpoint、模型。设置后立即生效,无需重启服务。
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
        <div
          className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: providerColor(api.provider) + "20" }}
        >
          <KeyIcon
            className="w-4 h-4"
            style={{ color: providerColor(api.provider) }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-[#1A1A1A] truncate" title={api.name}>
            {api.name}
          </div>
          <div className="text-[10px] text-[#9CA3AF] font-mono">{api.provider}</div>
        </div>
        {/* 状态标识 */}
        {api.hasKey ? (
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
          <Field label="默认模型">
            <code className="text-[#6B7280] truncate block">{api.model}</code>
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
  const [apiKeyDraft, setApiKeyDraft] = useState(""); // 空白 = 不动 key
  const [clearKey, setClearKey] = useState(false);
  const [apiUrl, setApiUrl] = useState(api.apiUrl ?? "");
  const [model, setModel] = useState(api.model ?? "");
  const [rechargeUrl, setRechargeUrl] = useState(api.rechargeUrl ?? "");
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
        name,
        description: description || undefined,
        apiKey: clearKey ? "" : apiKeyDraft || undefined,
        apiUrl: apiUrl || undefined,
        model: model || undefined,
        rechargeUrl: rechargeUrl || undefined,
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
        <LabeledInput label="默认模型" value={model} onChange={setModel} mono />
        <LabeledInput
          label="充值/管理页 URL(可选)"
          value={rechargeUrl}
          onChange={setRechargeUrl}
          placeholder="如 https://platform.deepseek.com/top_up"
        />
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          启用(禁用后业务回退到 .env 兜底)
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
    name: "",
    description: "",
    apiKey: "",
    apiUrl: "",
    model: "",
    rechargeUrl: "",
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
        <div>
          <div className="text-[10px] font-medium text-[#6B7280] mb-1">API Key</div>
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
          label="默认模型"
          value={draft.model ?? ""}
          onChange={(v) => patch("model", v)}
          mono
        />
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

/** 简单按字符串 hash 给 provider 分配一个稳定主题色 — 仅装饰 */
function providerColor(provider: string): string {
  const palette = ["#8B5CF6", "#06B6D4", "#10B981", "#F59E0B", "#EF4444", "#EC4899", "#3B82F6"];
  let h = 0;
  for (const c of provider) h = (h * 31 + c.charCodeAt(0)) | 0;
  return palette[Math.abs(h) % palette.length];
}
