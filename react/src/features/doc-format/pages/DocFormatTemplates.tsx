import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Loader2, Plus, RotateCcw, Star, Trash2 } from "lucide-react";
import {
  ALIGN_LABEL,
  docFormatApi,
  ELEMENT_TYPE_LABEL,
  ELEMENT_TYPE_OPTIONS,
  FONT_ROLE_LABEL,
  SIZE_OPTIONS,
  type Align,
  type DocFormatConfig,
  type DocTemplate,
  type ElementType,
  type FontRole,
} from "../api";

const FONT_ROLES: FontRole[] = ["title", "heading", "subheading", "body", "pageNumber"];

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="w-28 shrink-0">
        <span className="text-sm text-slate-600">{label}</span>
        {hint && <p className="text-[10px] leading-tight text-slate-400">{hint}</p>}
      </div>
      <div className="flex flex-1 items-center gap-2">{children}</div>
    </div>
  );
}

const inputCls = "w-24 rounded border border-slate-300 px-2 py-1 text-sm";
const selCls = "rounded border border-slate-300 bg-white px-2 py-1 text-sm";

function Num({
  value,
  onChange,
  step = 1,
  suffix,
}: {
  value: number;
  onChange: (n: number) => void;
  step?: number;
  suffix?: string;
}) {
  return (
    <span className="flex items-center gap-1">
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={inputCls}
      />
      {suffix && <span className="text-xs text-slate-400">{suffix}</span>}
    </span>
  );
}

/** 编辑器:key 重挂载读 props 起步,不用 effect 同步 */
function Editor({ tpl, onSaved }: { tpl: DocTemplate; onSaved: () => void }) {
  const [name, setName] = useState(tpl.name);
  const [description, setDescription] = useState(tpl.description ?? "");
  const [cfg, setCfg] = useState<DocFormatConfig>(tpl.config);
  const [tab, setTab] = useState<"page" | "fonts" | "elements" | "misc">("page");

  const dirty =
    name !== tpl.name ||
    description !== (tpl.description ?? "") ||
    JSON.stringify(cfg) !== JSON.stringify(tpl.config);

  const save = useMutation({
    mutationFn: () => docFormatApi.updateTemplate(tpl.id, { name, description, config: cfg }),
    onSuccess: onSaved,
  });
  const reset = useMutation({
    mutationFn: () => docFormatApi.resetTemplate(tpl.id),
    // 编辑器不再随保存重挂载(key 只用 id),所以「恢复默认」要自己把服务端还回来的值灌进本地态,
    // 否则界面还显示旧值、还是 dirty
    onSuccess: (t) => {
      setName(t.name);
      setDescription(t.description ?? "");
      setCfg(t.config);
      onSaved();
    },
  });
  const setDefault = useMutation({
    // 连 config 一起提交:否则用户改了参数没保存就点「设为默认」,改动被静默丢弃,
    // 而按钮还会因为重挂载变成「已保存」,等于谎报成功
    mutationFn: () => docFormatApi.updateTemplate(tpl.id, { name, description, config: cfg, isDefault: true }),
    onSuccess: onSaved,
  });

  const patch = (fn: (c: DocFormatConfig) => DocFormatConfig) => setCfg((c) => fn(structuredClone(c)));
  const patchEl = (t: ElementType, fn: (s: DocFormatConfig["elements"][ElementType]) => void) =>
    patch((c) => {
      fn(c.elements[t]);
      return c;
    });

  // 每页行数是算出来的,不是配的 —— 这里实时显示,让人知道改行距/边距的后果
  const textHeightMm = cfg.page.heightMm - cfg.page.marginTopMm - cfg.page.marginBottomMm;
  const linesPerPage = Math.floor(((textHeightMm / 25.4) * 72) / cfg.grid.lineSpacingPt);
  const textWidthPt = ((cfg.page.widthMm - cfg.page.marginLeftMm - cfg.page.marginRightMm) / 25.4) * 72;
  const charPitch = textWidthPt / cfg.grid.charsPerLine;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm font-medium"
        />
        {tpl.isDefault ? (
          <span className="flex items-center gap-1 rounded bg-party-soft px-2 py-1 text-xs text-[var(--party-primary)]">
            <Star className="h-3 w-3 fill-current" /> 默认
          </span>
        ) : (
          <button
            onClick={() => setDefault.mutate()}
            className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
          >
            设为默认
          </button>
        )}
        {tpl.builtinKey && (
          <button
            onClick={() => {
              if (confirm("恢复成内置默认值?当前改动会丢失。")) reset.mutate();
            }}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
          >
            <RotateCcw className="h-3 w-3" /> 恢复默认
          </button>
        )}
        <button
          onClick={() => save.mutate()}
          disabled={!dirty || save.isPending}
          className="flex items-center gap-1 rounded bg-[var(--party-primary)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          {save.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
          {dirty ? "保存" : "已保存"}
        </button>
      </div>

      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="说明(选填)"
        className="mx-4 mt-3 rounded border border-slate-200 px-2 py-1 text-xs text-slate-500"
      />

      <div className="mt-3 flex gap-1 border-b border-slate-100 px-4">
        {(
          [
            ["page", "版面"],
            ["fonts", "字体"],
            ["elements", "各级样式"],
            ["misc", "页码与提醒"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-3 py-2 text-sm ${
              tab === k
                ? "border-b-2 border-[var(--party-primary)] font-medium text-[var(--party-primary)]"
                : "text-slate-500"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {tab === "page" && (
          <>
            <Row label="页边距" hint="国标 上37 下35 左28 右26">
              {(
                [
                  ["marginTopMm", "上"],
                  ["marginBottomMm", "下"],
                  ["marginLeftMm", "左"],
                  ["marginRightMm", "右"],
                ] as const
              ).map(([k, l]) => (
                <span key={k} className="flex items-center gap-1">
                  <span className="text-xs text-slate-400">{l}</span>
                  <input
                    type="number"
                    step={0.5}
                    value={cfg.page[k]}
                    onChange={(e) =>
                      patch((c) => {
                        c.page[k] = Number(e.target.value);
                        return c;
                      })
                    }
                    className="w-16 rounded border border-slate-300 px-2 py-1 text-sm"
                  />
                </span>
              ))}
              <span className="text-xs text-slate-400">mm</span>
            </Row>
            <Row label="纸张">
              <Num
                value={cfg.page.widthMm}
                onChange={(n) => patch((c) => ((c.page.widthMm = n), c))}
                suffix="× 宽"
              />
              <Num
                value={cfg.page.heightMm}
                onChange={(n) => patch((c) => ((c.page.heightMm = n), c))}
                suffix="高 mm (A4 = 210 × 297)"
              />
            </Row>
            <Row label="每行字数" hint="国标 28,本单位 26">
              <Num
                value={cfg.grid.charsPerLine}
                onChange={(n) => patch((c) => ((c.grid.charsPerLine = n), c))}
                suffix="字"
              />
            </Row>
            <Row label="行距" hint="固定值">
              <Num
                value={cfg.grid.lineSpacingPt}
                onChange={(n) => patch((c) => ((c.grid.lineSpacingPt = n), c))}
                suffix="磅"
              />
            </Row>
            <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
              <p className="mb-1 font-medium text-slate-600">按当前参数算出来的:</p>
              <p>
                版心 {(cfg.page.widthMm - cfg.page.marginLeftMm - cfg.page.marginRightMm).toFixed(0)} ×{" "}
                {textHeightMm.toFixed(0)} mm · 每页{" "}
                <b className="text-slate-700">{linesPerPage}</b> 行 · 每字跨度{" "}
                <b className="text-slate-700">{charPitch.toFixed(2)}</b> 磅
              </p>
              <p className="mt-1 text-slate-400">
                每页行数不是参数,是 版心高 ÷ 行距 算出来的;每行字数靠文档网格实现。
              </p>
            </div>
          </>
        )}

        {tab === "fonts" && (
          <>
            <p className="mb-2 text-xs text-slate-400">
              各级样式里引用的是「角色」,改这里全篇跟着变。备选字体在目标字库没装时顶上。
            </p>
            {FONT_ROLES.map((r) => (
              <Row key={r} label={FONT_ROLE_LABEL[r]}>
                <input
                  value={cfg.fonts[r]}
                  onChange={(e) => patch((c) => ((c.fonts[r] = e.target.value), c))}
                  className="w-44 rounded border border-slate-300 px-2 py-1 text-sm"
                />
                <span className="text-xs text-slate-400">备选</span>
                <input
                  value={cfg.fontFallback[r] ?? ""}
                  placeholder="缺字库时用"
                  onChange={(e) => patch((c) => ((c.fontFallback[r] = e.target.value), c))}
                  className="w-36 rounded border border-slate-200 px-2 py-1 text-sm text-slate-500"
                />
              </Row>
            ))}
            <div className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              这里只写字体的<b>名字</b>。方正字库是商业授权,服务端不会、也不应该带字体文件 ——
              渲染由打开文档的电脑负责。
            </div>
          </>
        )}

        {tab === "elements" && (
          <div className="space-y-1">
            <div className="flex gap-2 border-b border-slate-100 pb-1 text-[10px] text-slate-400">
              <span className="w-32">元素</span>
              <span className="w-24">字体角色</span>
              <span className="w-20">字号</span>
              <span className="w-24">对齐</span>
              <span className="w-20">首行缩进</span>
              <span>输出</span>
            </div>
            {ELEMENT_TYPE_OPTIONS.filter((t) => t !== "skip").map((t) => {
              const s = cfg.elements[t];
              return (
                <div key={t} className="flex items-center gap-2 py-1 text-sm">
                  <span className="w-32 truncate text-slate-600">{ELEMENT_TYPE_LABEL[t]}</span>
                  <select
                    value={s.font}
                    onChange={(e) => patchEl(t, (x) => void (x.font = e.target.value as FontRole))}
                    className={`${selCls} w-24`}
                  >
                    {FONT_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {FONT_ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                  <select
                    value={s.sizePt}
                    onChange={(e) => patchEl(t, (x) => void (x.sizePt = Number(e.target.value)))}
                    className={`${selCls} w-20`}
                  >
                    {SIZE_OPTIONS.map((o) => (
                      <option key={o.pt} value={o.pt}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={s.align}
                    onChange={(e) => patchEl(t, (x) => void (x.align = e.target.value as Align))}
                    className={`${selCls} w-24`}
                  >
                    {(Object.keys(ALIGN_LABEL) as Align[]).map((a) => (
                      <option key={a} value={a}>
                        {ALIGN_LABEL[a]}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={s.firstLineChars / 100}
                    step={1}
                    onChange={(e) =>
                      patchEl(t, (x) => void (x.firstLineChars = Number(e.target.value) * 100))
                    }
                    className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
                  />
                  <label className="flex items-center gap-1 text-xs text-slate-500">
                    <input
                      type="checkbox"
                      checked={s.emit}
                      onChange={(e) => patchEl(t, (x) => void (x.emit = e.target.checked))}
                    />
                    输出
                  </label>
                </div>
              );
            })}
            <p className="pt-2 text-[10px] text-slate-400">
              首行缩进单位是「字符」。「条(第X条)」的序号恒用一级标题字体、序号后按有无句号自动定字体
              —— 那是行内条文与独立标题的区别,不在这张表里配。
            </p>
          </div>
        )}

        {tab === "misc" && (
          <>
            <div className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
              下面两条会<b>改动正文字符</b>,与本工具「一字不改」的默认立场是例外,所以单拎出来可关。
              改动在确认页都看得见。
            </div>
            <Row label="规范化引号" hint="直引号 → 弯引号">
              <input
                type="checkbox"
                checked={cfg.textRules.curlyQuotes}
                onChange={(e) => patch((c) => ((c.textRules.curlyQuotes = e.target.checked), c))}
              />
              <span className="text-xs text-slate-400">
                {'"这样"'} → “这样”。公文规范用弯引号,源文件里的直引号本来就是错的
              </span>
            </Row>
            <Row label="md 自动补序号" hint="只对 .md 生效">
              <input
                type="checkbox"
                checked={cfg.markdown.autoNumber}
                onChange={(e) => patch((c) => ((c.markdown.autoNumber = e.target.checked), c))}
              />
              <span className="text-xs text-slate-400">
                <code>## 总体要求</code> → 一、总体要求。关掉则只套字体、不加序号(输出就不像公文)
              </span>
            </Row>
            <hr className="my-3 border-slate-100" />
            <Row label="显示页码">
              <input
                type="checkbox"
                checked={cfg.pageNumber.enabled}
                onChange={(e) => patch((c) => ((c.pageNumber.enabled = e.target.checked), c))}
              />
            </Row>
            <Row label="页码样式" hint="国标 — 1 —">
              <input
                value={cfg.pageNumber.dash}
                onChange={(e) => patch((c) => ((c.pageNumber.dash = e.target.value), c))}
                className="w-12 rounded border border-slate-300 px-2 py-1 text-center text-sm"
              />
              <span className="text-xs text-slate-400">
                预览:{cfg.pageNumber.dash} 1 {cfg.pageNumber.dash}
              </span>
              <select
                value={cfg.pageNumber.sizePt}
                onChange={(e) => patch((c) => ((c.pageNumber.sizePt = Number(e.target.value)), c))}
                className={selCls}
              >
                {SIZE_OPTIONS.map((o) => (
                  <option key={o.pt} value={o.pt}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="奇/偶页对齐">
              {(["oddAlign", "evenAlign"] as const).map((k) => (
                <select
                  key={k}
                  value={cfg.pageNumber[k]}
                  onChange={(e) => patch((c) => ((c.pageNumber[k] = e.target.value as Align), c))}
                  className={selCls}
                >
                  {(Object.keys(ALIGN_LABEL) as Align[]).map((a) => (
                    <option key={a} value={a}>
                      {k === "oddAlign" ? "奇数页 " : "偶数页 "}
                      {ALIGN_LABEL[a]}
                    </option>
                  ))}
                </select>
              ))}
            </Row>
            <Row label="页脚距底" hint="国标:页码上距版心下边缘 7mm">
              <Num
                value={cfg.pageNumber.fromBottomMm}
                onChange={(n) => patch((c) => ((c.pageNumber.fromBottomMm = n), c))}
                suffix="mm"
              />
            </Row>
            <Row label="起始页码">
              <Num
                value={cfg.pageNumber.startAt}
                onChange={(n) => patch((c) => ((c.pageNumber.startAt = n), c))}
              />
            </Row>
            <hr className="my-3 border-slate-100" />
            <Row label="孤行控制" hint="交给 Word 自己避">
              <input
                type="checkbox"
                checked={cfg.widowControl}
                onChange={(e) => patch((c) => ((c.widowControl = e.target.checked), c))}
              />
              <span className="text-xs text-slate-400">
                打开后 Word/WPS 自动避免孤行/寡行/标题落单
              </span>
            </Row>
            <Row label="孤字提醒">
              <input
                type="checkbox"
                checked={cfg.orphanWarn.enabled}
                onChange={(e) => patch((c) => ((c.orphanWarn.enabled = e.target.checked), c))}
              />
              <span className="text-xs text-slate-400">末行不足</span>
              <Num
                value={cfg.orphanWarn.maxTailCells}
                step={0.5}
                onChange={(n) => patch((c) => ((c.orphanWarn.maxTailCells = n), c))}
                suffix="格即提醒"
              />
            </Row>
            <Row label="首页预留" hint="套红头会占掉的行数">
              <Num
                value={cfg.orphanWarn.firstPageOffsetLines}
                onChange={(n) => patch((c) => ((c.orphanWarn.firstPageOffsetLines = n), c))}
                suffix="行(填了分页更准)"
              />
            </Row>
            <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
              孤字检测是按网格推算的,与 Word 实际断行可能差一个字,所以只报「疑似」。
              孤行/寡行不用我们算 —— 打开孤行控制,Word 自己就避开了。
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** 公文排版模板(/admin/doc-format/templates):左列表右编辑,照提示词管理页范式 */
export default function DocFormatTemplatesPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["doc-format", "templates"], queryFn: docFormatApi.listTemplates });
  const [pickedId, setPickedId] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["doc-format"] });
  const create = useMutation({
    mutationFn: () => docFormatApi.createTemplate({ name: "新建模板" }),
    onSuccess: (t) => {
      setPickedId(t.id);
      invalidate();
    },
  });
  const dup = useMutation({ mutationFn: docFormatApi.duplicateTemplate, onSuccess: invalidate });
  const del = useMutation({ mutationFn: docFormatApi.removeTemplate, onSuccess: invalidate });

  const items = list.data ?? [];
  // 默认选中渲染期派生,不用 effect 同步
  const selected = items.find((t) => t.id === pickedId) ?? items[0] ?? null;

  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-slate-800">公文排版模板</h1>
        <p className="mt-1 text-sm text-slate-500">
          排版规则参数。可以有多套(如国标、本单位标准),前台排版时选用;设为默认的那套是新任务的初始选择。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        <div className="rounded-xl bg-white ring-1 ring-slate-200">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <span className="text-sm font-medium text-slate-600">模板</span>
            <button
              onClick={() => create.mutate()}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--party-primary)] hover:bg-party-soft"
            >
              <Plus className="h-3 w-3" /> 新建
            </button>
          </div>
          <div className="p-2">
            {items.map((t) => (
              <div
                key={t.id}
                onClick={() => setPickedId(t.id)}
                className={`group mb-1 cursor-pointer rounded-lg px-3 py-2 ${
                  selected?.id === t.id ? "bg-party-soft" : "hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center gap-1">
                  <span className="flex-1 truncate text-sm text-slate-700">{t.name}</span>
                  {t.isDefault && <Star className="h-3 w-3 fill-current text-[var(--party-primary)]" />}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      dup.mutate(t.id);
                    }}
                    title="复制一份"
                    className="hidden rounded p-1 text-slate-400 hover:bg-white group-hover:block"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                  {!t.builtinKey && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`删除模板「${t.name}」?`)) del.mutate(t.id);
                      }}
                      className="hidden rounded p-1 text-red-400 hover:bg-white group-hover:block"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <p className="mt-0.5 text-[10px] text-slate-400">
                  {t.builtinKey ? "内置" : "自建"} · 每行 {t.config.grid.charsPerLine} 字
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="min-h-[560px] rounded-xl bg-white ring-1 ring-slate-200">
          {selected ? (
            // key 只用 id:切模板时编辑态整体重置,不用 effect 同步。
            // ⚠ 别把 updatedAt 也放进 key —— 那样每次保存都会重挂载,把用户正看着的
            //    分页(字体/各级样式/页码)踢回「版面」。保存后的新值由 onSaved→invalidate 走 props。
            <Editor key={selected.id} tpl={selected} onSaved={invalidate} />
          ) : (
            <p className="p-10 text-center text-sm text-slate-400">还没有模板</p>
          )}
        </div>
      </div>
    </div>
  );
}
