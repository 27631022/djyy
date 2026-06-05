import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  SettingsIcon, RefreshCwIcon, SaveIcon, RotateCcwIcon,
  TagIcon, ImageIcon, MegaphoneIcon, LinkIcon, PaletteIcon,
  PlusIcon, TrashIcon, GlobeIcon, MenuIcon, GripVerticalIcon,
} from "lucide-react";
import {
  siteSettingApi,
  FALLBACK_SITE_SETTINGS,
  type SiteSettingsData,
} from "@/features/site-setting";

const PARTY = "var(--party-primary)";

type TabId = "brand" | "hero" | "topNav" | "footer" | "theme";

const TABS: { id: TabId; label: string; icon: React.ElementType; desc: string }[] = [
  { id: "brand", label: "基础品牌", icon: TagIcon, desc: "决定前台头部的站点身份呈现" },
  { id: "hero", label: "首页文案", icon: MegaphoneIcon, desc: "首页 Hero 区(红色横幅)的主副标语" },
  { id: "topNav", label: "首页顶端", icon: MenuIcon, desc: "头部 logo 右侧的 N 个文字链接(党务公开 / 学习园地 等)" },
  { id: "footer", label: "页脚信息", icon: LinkIcon, desc: "底部备案、版权与友情链接" },
  { id: "theme", label: "主题配色", icon: PaletteIcon, desc: "影响前台头部、按钮、Hero 等关键视觉" },
];

export default function SiteSettingsPage() {
  const qc = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ["site-settings"],
    queryFn: () => siteSettingApi.get(),
  });

  // 本地表单状态。注意:
  //   1. 不再用 useEffect 监听 settingsQuery.data 自动覆盖 form ——
  //      那会和用户输入打架(尤其 <input type="color"> 频繁触发 onChange 时),导致"改了没反应"
  //   2. form 的初始化只发生一次:第一次拿到 data 时(initializedRef 守门)
  //   3. dirty 用独立 boolean,每个 update* 显式 setDirty(true),
  //      save/reset 成功后显式 setDirty(false),不依赖 JSON.stringify 深比较
  const [form, setForm] = useState<SiteSettingsData>(FALLBACK_SITE_SETTINGS);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<TabId>("brand");
  const initializedRef = useRef(false);

  // 仅在第一次拿到后端数据时初始化 form。data 引用之后再变化(invalidate / mutation 等),
  // 由对应的 reset/save/refresh 显式处理,不会无脑覆盖用户当前的编辑。
  useEffect(() => {
    if (settingsQuery.data && !initializedRef.current) {
      setForm(settingsQuery.data);
      initializedRef.current = true;
    }
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (data: SiteSettingsData) => siteSettingApi.update(data),
    onSuccess: (data) => {
      qc.setQueryData(["site-settings"], data);
      setForm(data);          // 显式把表单同步到后端落库的值(以防后端做了规范化)
      setDirty(false);
      toast.success("站点设置已保存", { description: "刷新前台页面即可看到效果" });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "保存失败";
      toast.error(message);
    },
  });

  function refresh() {
    // 用户主动重新加载:重置初始化标记,让下一次拿到 data 时重新覆盖 form
    initializedRef.current = false;
    setDirty(false);
    qc.invalidateQueries({ queryKey: ["site-settings"] });
  }

  function reset() {
    if (settingsQuery.data) {
      setForm(settingsQuery.data);
      setDirty(false);
      toast.info("已撤销修改");
    }
  }

  function save() {
    saveMutation.mutate(form);
  }

  /* ─── 子表单更新工具(每个 update 都把 dirty 标 true) ─── */
  function updateBrand(patch: Partial<SiteSettingsData["brand"]>) {
    setForm((f) => ({ ...f, brand: { ...f.brand, ...patch } }));
    setDirty(true);
  }
  function updateHero(patch: Partial<SiteSettingsData["hero"]>) {
    setForm((f) => ({ ...f, hero: { ...f.hero, ...patch } }));
    setDirty(true);
  }
  function updateFooter(patch: Partial<SiteSettingsData["footer"]>) {
    setForm((f) => ({ ...f, footer: { ...f.footer, ...patch } }));
    setDirty(true);
  }
  function updateTopNav(patch: Partial<SiteSettingsData["topNav"]>) {
    setForm((f) => ({ ...f, topNav: { ...f.topNav, ...patch } }));
    setDirty(true);
  }
  function updateTheme(patch: Partial<SiteSettingsData["theme"]>) {
    setForm((f) => ({ ...f, theme: { ...f.theme, ...patch } }));
    setDirty(true);
  }

  const loading = settingsQuery.isLoading;
  const activeTabMeta = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <div className="h-full flex bg-white">
      {/* ════ 左侧:tab 列表(对齐数据字典左侧 list 风格) ════ */}
      <aside className="w-64 flex-shrink-0 border-r border-[#E9E9E9] flex flex-col">
        <div className="px-3 py-2.5 border-b border-[#F0F0F0] flex items-center gap-2">
          <SettingsIcon className="w-4 h-4 text-[var(--party-primary)]" />
          <span className="text-sm font-bold text-[#1A1A1A] flex-1">站点设置</span>
          {dirty && (
            <span
              className="text-[10px] text-[var(--party-accent)]"
              title="有未保存的修改"
            >
              ●
            </span>
          )}
        </div>
        <div className="px-3 py-2 border-b border-[#F0F0F0] text-[11px] text-[#9CA3AF]">
          前台首页的标题、LOGO、文案、配色等
        </div>
        <div className="flex-1 overflow-auto">
          {TABS.map((t) => {
            const TI = t.icon;
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="w-full px-3 py-2.5 text-left border-b border-[#F0F0F0] hover:bg-party-soft transition-colors flex items-center gap-2"
                style={{
                  backgroundColor: active ? "rgb(255, 240, 242)" : undefined,
                }}
              >
                <div
                  className="w-1 h-8 rounded-full flex-shrink-0 transition-colors"
                  style={{ backgroundColor: active ? PARTY : "transparent" }}
                />
                <TI
                  className="w-4 h-4 flex-shrink-0"
                  style={{ color: active ? PARTY : "#6B7280" }}
                />
                <div className="flex-1 min-w-0">
                  <div
                    className="text-[13px] font-medium"
                    style={{ color: active ? PARTY : "#1A1A1A" }}
                  >
                    {t.label}
                  </div>
                  <div className="text-[10px] text-[#9CA3AF] mt-0.5 truncate">
                    {t.desc}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ════ 右侧:当前 tab 详情 ════ */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* tab 标题栏 + 操作按钮(对齐数据字典右侧 detail 风格) */}
        <div className="flex-shrink-0 px-5 py-3 border-b border-[#E9E9E9] flex items-center gap-3 flex-wrap">
          <h2 className="text-base font-bold text-[#1A1A1A] flex items-center gap-2">
            <activeTabMeta.icon className="w-4 h-4 text-[var(--party-primary)]" />
            {activeTabMeta.label}
          </h2>
          <span className="text-xs text-[#9CA3AF]">{activeTabMeta.desc}</span>
          <div className="flex-1" />
          {dirty && (
            <span className="text-xs text-[var(--party-accent)] font-medium">
              ● 未保存的修改
            </span>
          )}
          <button
            onClick={refresh}
            className="p-1.5 rounded hover:bg-[#F7F8FA] text-[#6B7280]"
            title="重新加载"
            disabled={loading || saveMutation.isPending}
          >
            <RefreshCwIcon
              className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
            />
          </button>
          <button
            onClick={reset}
            disabled={!dirty || saveMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-[#E9E9E9] text-[#4B5563] hover:bg-[#F7F8FA] disabled:bg-[#FAFAFA] disabled:text-[#C0C6D0] disabled:cursor-not-allowed disabled:hover:bg-[#FAFAFA] transition-colors"
          >
            <RotateCcwIcon className="w-3.5 h-3.5" />
            撤销
          </button>
          {/* 保存按钮:disabled 时用明确的灰色,而非 opacity-40 ——
              否则在主题色为浅色时,红底+40%透明度会和白色背景融为一体,
              用户会以为"保存按钮消失了" */}
          <button
            onClick={save}
            disabled={!dirty || saveMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-white disabled:cursor-not-allowed transition-colors"
            style={{
              backgroundColor:
                !dirty || saveMutation.isPending ? "#C0C6D0" : PARTY,
            }}
          >
            <SaveIcon className="w-3.5 h-3.5" />
            {saveMutation.isPending ? "保存中..." : "保存"}
          </button>
        </div>

        {/* 表单内容 */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-2xl">
            {loading ? (
              <SkeletonForm />
            ) : tab === "brand" ? (
              <BrandForm value={form.brand} onChange={updateBrand} />
            ) : tab === "hero" ? (
              <HeroForm value={form.hero} onChange={updateHero} />
            ) : tab === "topNav" ? (
              <TopNavForm value={form.topNav} onChange={updateTopNav} />
            ) : tab === "footer" ? (
              <FooterForm value={form.footer} onChange={updateFooter} />
            ) : (
              <ThemeForm value={form.theme} onChange={updateTheme} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

/* ═══════════════════════════════
   Sub forms
   ═══════════════════════════════ */

function FieldLabel({ label, required, hint }: { label: string; required?: boolean; hint?: string }) {
  return (
    <div className="mb-1.5">
      <label className="text-sm font-medium text-[#1A1A1A]">
        {label}
        {required && <span className="text-[var(--party-primary)] ml-0.5">*</span>}
      </label>
      {hint && <p className="text-[11px] text-[#9CA3AF] mt-0.5">{hint}</p>}
    </div>
  );
}

function TextField({
  label, value, onChange, placeholder, hint, required, multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  multiline?: boolean;
}) {
  const baseClass = "w-full border border-[#E9E9E9] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[var(--party-primary)] focus:ring-1 focus:ring-party-primary-20 transition-colors";
  return (
    <div className="mb-5">
      <FieldLabel label={label} required={required} hint={hint} />
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className={baseClass}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={baseClass}
        />
      )}
    </div>
  );
}

/* ─── Brand ─── */
function BrandForm({ value, onChange }: { value: SiteSettingsData["brand"]; onChange: (p: Partial<SiteSettingsData["brand"]>) => void }) {
  return (
    <div>
      <TextField
        label="站点标题"
        value={value.title}
        onChange={(v) => onChange({ title: v })}
        placeholder="党建益友"
        required
        hint="显示在前台头部 LOGO 旁,以及浏览器标签页(后续)"
      />
      <TextField
        label="英文副标题"
        value={value.subtitle}
        onChange={(v) => onChange({ subtitle: v })}
        placeholder="PARTY BUILDING DIGITAL PORTAL"
        hint="显示在中文标题下方,字号较小"
      />
      <TextField
        label="LOGO 图片 URL"
        value={value.logoUrl}
        onChange={(v) => onChange({ logoUrl: v })}
        placeholder="留空使用内置 LOGO(/logo.svg)"
        hint="全站统一站标:此处设置,前台门户 / 后台 / 登录 / 工作台 / 桌面挂件同步生效。支持外链或站内静态资源 URL;留空显示内置 logo"
      />
      <div className="mb-5 p-3 bg-[#FAFAFA] rounded-md border border-[#E9E9E9]">
        <p className="text-[11px] text-[#9CA3AF] mb-2 flex items-center gap-1">
          <ImageIcon className="w-3 h-3" />
          当前站标预览{!value.logoUrl?.trim() && "(内置默认)"}
        </p>
        <img
          src={value.logoUrl?.trim() || "/logo.svg"}
          alt="LOGO 预览"
          className="w-12 h-12 rounded-md object-contain border border-[#E9E9E9] bg-white p-1"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
      </div>
    </div>
  );
}

/* ─── Hero ─── */
function HeroForm({ value, onChange }: { value: SiteSettingsData["hero"]; onChange: (p: Partial<SiteSettingsData["hero"]>) => void }) {
  return (
    <div>
      <TextField
        label="主标语"
        value={value.mainSlogan}
        onChange={(v) => onChange({ mainSlogan: v })}
        placeholder="不忘初心,牢记使命"
        required
        hint="Hero 区最大号字体显示"
      />
      <TextField
        label="副标语"
        value={value.subSlogan}
        onChange={(v) => onChange({ subSlogan: v })}
        placeholder="凝聚党员力量 · 服务党务工作 · 推进党建高质量发展"
        hint="主标语下方一行小字"
      />
      <TextField
        label="顶部英文小字"
        value={value.bannerLineEn}
        onChange={(v) => onChange({ bannerLineEn: v })}
        placeholder="Party Building Digital Portal"
        hint="Hero 区最顶部装饰性英文"
      />
    </div>
  );
}

/**
 * 列表拖拽排序 hook — 给 site setting 的纯本地 state 列表用。
 * 数据没有稳定 id,只能按 idx 跟踪;重排后调 reorder(next),
 * 父组件再 setDirty(true) 让顶栏「保存」按钮亮起。
 */
function useIndexDrag<T>(items: T[], reorder: (next: T[]) => void) {
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<{ idx: number; pos: "above" | "below" } | null>(null);

  function clear() {
    setDrag(null);
    setOver(null);
  }

  function rowProps(idx: number) {
    const isDragging = drag === idx;
    const isOver = over?.idx === idx;
    const dropIndicator =
      isOver && over?.pos === "above"
        ? "inset 0 2px 0 0 #3B82F6"
        : isOver && over?.pos === "below"
          ? "inset 0 -2px 0 0 #3B82F6"
          : undefined;
    return {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        setDrag(idx);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(idx));
      },
      onDragOver: (e: React.DragEvent) => {
        if (drag === null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const pos: "above" | "below" = e.clientY < midY ? "above" : "below";
        if (over?.idx !== idx || over?.pos !== pos) setOver({ idx, pos });
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        if (drag === null || !over || drag === over.idx) {
          clear();
          return;
        }
        const next = [...items];
        const [moved] = next.splice(drag, 1);
        const insertAt = over.pos === "above" ? over.idx : over.idx + 1;
        const adjusted = drag < insertAt ? insertAt - 1 : insertAt;
        next.splice(adjusted, 0, moved);
        clear();
        reorder(next);
      },
      onDragEnd: clear,
      style: {
        opacity: isDragging ? 0.4 : undefined,
        boxShadow: dropIndicator,
      } as React.CSSProperties,
    };
  }

  return { rowProps };
}

/* ─── TopNav(首页顶端导航条) ─── */
function TopNavForm({
  value,
  onChange,
}: {
  value: SiteSettingsData["topNav"];
  onChange: (p: Partial<SiteSettingsData["topNav"]>) => void;
}) {
  function updateItem(idx: number, patch: Partial<{ label: string; url: string }>) {
    const next = value.items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    onChange({ items: next });
  }
  function addItem() {
    onChange({ items: [...value.items, { label: "", url: "#" }] });
  }
  function removeItem(idx: number) {
    onChange({ items: value.items.filter((_, i) => i !== idx) });
  }
  const { rowProps } = useIndexDrag(value.items, (next) => onChange({ items: next }));

  return (
    <div>
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <FieldLabel
            label="顶端导航链接"
            hint="显示在前台头部 LOGO 右侧。拖拽行首 ⋮ 可重排顺序;URL 填 # 表示暂未启用"
          />
          <button
            onClick={addItem}
            type="button"
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-[var(--party-primary)] hover:bg-party-soft transition-colors"
          >
            <PlusIcon className="w-3 h-3" />
            添加链接
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {value.items.length === 0 && (
            <div className="text-center text-xs text-[#9CA3AF] py-6 border border-dashed border-[#E9E9E9] rounded-md">
              暂无顶端链接,点击右上角「添加链接」
            </div>
          )}
          {value.items.map((it, idx) => (
            <div
              key={idx}
              {...rowProps(idx)}
              className="flex items-center gap-2 p-2 border border-[#E9E9E9] rounded-md hover:border-[var(--party-primary)]/40 transition-colors"
            >
              <span
                className="flex items-center gap-1 w-10 flex-shrink-0 cursor-grab active:cursor-grabbing text-[#9CA3AF]"
                title="拖拽以重排序"
              >
                <GripVerticalIcon className="w-3 h-3" />
                <span className="text-[10px] font-mono">{idx + 1}</span>
              </span>
              <input
                value={it.label}
                onChange={(e) => updateItem(idx, { label: e.target.value })}
                placeholder="链接文字(如:党务公开)"
                className="w-36 border border-[#E9E9E9] rounded px-2 py-1 text-xs focus:outline-none focus:border-[var(--party-primary)]"
              />
              <input
                value={it.url}
                onChange={(e) => updateItem(idx, { url: e.target.value })}
                placeholder="/ 或 https://... 或 #"
                className="flex-1 border border-[#E9E9E9] rounded px-2 py-1 text-xs focus:outline-none focus:border-[var(--party-primary)] font-mono"
              />
              <button
                onClick={() => removeItem(idx)}
                type="button"
                className="p-1 rounded hover:bg-party-soft text-[#9CA3AF] hover:text-[var(--party-primary)] transition-colors flex-shrink-0"
                title="删除"
              >
                <TrashIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-[#9CA3AF] leading-relaxed">
        提示:URL 填「/」会跳到首页,「#」是占位(不跳转),也可以填「
        <span className="font-mono">/admin/news</span>
        」之类的站内路径,或外部链接「
        <span className="font-mono">https://...</span>
        」。前台头部会从左到右按顺序依次显示这些链接。
      </p>
    </div>
  );
}

/* ─── Footer ─── */
function FooterForm({ value, onChange }: { value: SiteSettingsData["footer"]; onChange: (p: Partial<SiteSettingsData["footer"]>) => void }) {
  function updateLink(idx: number, patch: Partial<{ label: string; url: string }>) {
    const next = value.friendLinks.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    onChange({ friendLinks: next });
  }
  function addLink() {
    onChange({ friendLinks: [...value.friendLinks, { label: "", url: "" }] });
  }
  function removeLink(idx: number) {
    onChange({ friendLinks: value.friendLinks.filter((_, i) => i !== idx) });
  }
  const { rowProps } = useIndexDrag(value.friendLinks, (next) => onChange({ friendLinks: next }));

  return (
    <div>
      <TextField
        label="ICP 备案号"
        value={value.icp}
        onChange={(v) => onChange({ icp: v })}
        placeholder="京ICP备XXXXXXXX号"
      />
      <TextField
        label="版权声明"
        value={value.copyright}
        onChange={(v) => onChange({ copyright: v })}
        placeholder="© 2025 党建益友门户 ..."
        multiline
      />

      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <FieldLabel label="友情链接" hint="显示在页脚顶部。拖拽行首 ⋮ 可重排顺序" />
          <button
            onClick={addLink}
            type="button"
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-[var(--party-primary)] hover:bg-party-soft transition-colors"
          >
            <PlusIcon className="w-3 h-3" />
            添加链接
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {value.friendLinks.length === 0 && (
            <div className="text-center text-xs text-[#9CA3AF] py-6 border border-dashed border-[#E9E9E9] rounded-md">
              暂无友情链接,点击右上角"添加链接"
            </div>
          )}
          {value.friendLinks.map((link, idx) => (
            <div
              key={idx}
              {...rowProps(idx)}
              className="flex items-center gap-2 p-2 border border-[#E9E9E9] rounded-md hover:border-[var(--party-primary)]/40 transition-colors"
            >
              <span
                className="flex items-center gap-1 w-10 flex-shrink-0 cursor-grab active:cursor-grabbing text-[#9CA3AF]"
                title="拖拽以重排序"
              >
                <GripVerticalIcon className="w-3 h-3" />
                <span className="text-[10px] font-mono">{idx + 1}</span>
              </span>
              <GlobeIcon className="w-4 h-4 text-[#9CA3AF] flex-shrink-0" />
              <input
                value={link.label}
                onChange={(e) => updateLink(idx, { label: e.target.value })}
                placeholder="链接名称"
                className="w-32 border border-[#E9E9E9] rounded px-2 py-1 text-xs focus:outline-none focus:border-[var(--party-primary)]"
              />
              <input
                value={link.url}
                onChange={(e) => updateLink(idx, { url: e.target.value })}
                placeholder="https://..."
                className="flex-1 border border-[#E9E9E9] rounded px-2 py-1 text-xs focus:outline-none focus:border-[var(--party-primary)]"
              />
              <button
                onClick={() => removeLink(idx)}
                type="button"
                className="p-1 rounded hover:bg-party-soft text-[#9CA3AF] hover:text-[var(--party-primary)] transition-colors"
                title="删除"
              >
                <TrashIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Theme ─── */
function ThemeForm({ value, onChange }: { value: SiteSettingsData["theme"]; onChange: (p: Partial<SiteSettingsData["theme"]>) => void }) {
  return (
    <div>
      <ColorField
        label="主色调(党建红)"
        value={value.primary}
        onChange={(v) => onChange({ primary: v })}
        hint="按钮、链接、Logo 底色等"
      />
      <ColorField
        label="强调色(金黄)"
        value={value.accent}
        onChange={(v) => onChange({ accent: v })}
        hint="装饰线、热门标签、五角星等点缀"
      />

      <div className="mt-6 p-4 bg-[#FAFAFA] rounded-md border border-[#E9E9E9]">
        <p className="text-[11px] text-[#9CA3AF] mb-3">预览</p>
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold"
            style={{ backgroundColor: value.primary }}
          >
            党
          </div>
          <button
            className="px-4 py-2 rounded-md text-white text-sm font-medium"
            style={{ backgroundColor: value.primary }}
          >
            主色按钮
          </button>
          <span
            className="px-3 py-1 rounded-full text-white text-xs"
            style={{ backgroundColor: value.accent }}
          >
            强调色标签
          </span>
        </div>
      </div>
    </div>
  );
}

function ColorField({
  label, value, onChange, hint,
}: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <div className="mb-5">
      <FieldLabel label={label} hint={hint} />
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-10 h-10 rounded border border-[#E9E9E9] cursor-pointer p-0.5"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="var(--party-primary)"
          className="flex-1 border border-[#E9E9E9] rounded-md px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:border-[var(--party-primary)]"
        />
      </div>
    </div>
  );
}


function SkeletonForm() {
  return (
    <div className="space-y-5">
      {[1, 2, 3, 4].map((i) => (
        <div key={i}>
          <div className="h-3 w-20 bg-[#F3F4F6] rounded animate-pulse mb-2" />
          <div className="h-9 bg-[#F3F4F6] rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}
