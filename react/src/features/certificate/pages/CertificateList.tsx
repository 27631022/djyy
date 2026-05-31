import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AwardIcon,
  PlusIcon,
  RefreshCwIcon,
  DownloadIcon,
  CheckCircle2Icon,
  BanIcon,
  Loader2Icon,
  PackageIcon,
  TrashIcon,
  XIcon,
  SearchIcon,
  FilterIcon,
  UserIcon,
  UsersIcon,
  Building2Icon,
  TagIcon,
  ExternalLinkIcon,
  FileTextIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  certificateIssueApi,
  certificateTemplateApi,
  HONOR_LEVEL_LABEL,
  HONOR_TYPE_LABEL,
  type CertificateListItemDto,
} from "@/features/certificate";
import { dictionariesApi, DICT_CODES } from "@/features/dictionary";
import { useAuth } from "@/stores/auth";
import { buildPdfFileName } from "../lib/certificateNumber";
import { triggerDownload } from "../lib/certificatePdf";
import { PreviewCanvas } from "../components/issue/PreviewCanvas";
import type { DesignerState } from "../lib/designerTypes";

const PARTY = "var(--party-primary)";

type RevokedFilter = "all" | "active" | "revoked";
type TypeFilter = "all" | "individual" | "collective";

/** 个人/集体 标签(老数据 honorType=null 视为个人) */
function typeOf(c: { honorType: string | null }): "individual" | "collective" {
  return c.honorType === "collective" ? "collective" : "individual";
}

/** variableData(JSON 字符串)→ Record<string,string>;解析失败返回 {} */
function parseVariableValues(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = String(v ?? "");
    return out;
  } catch {
    return {};
  }
}

export default function CertificateListPage() {
  const qc = useQueryClient();
  const { me } = useAuth();
  const isAdmin = !!me?.roles.some((r) => r.code === "platform_admin");

  const [params, setParams] = useSearchParams();
  const highlightId = params.get("highlight");
  const templateId = params.get("templateId") || undefined;

  const [filterRevoked, setFilterRevoked] = useState<RevokedFilter>("all");
  /* ── 综合搜索(左栏,客户端过滤)── */
  const [searchText, setSearchText] = useState("");
  const [fType, setFType] = useState<TypeFilter>("all");
  const [fLevel, setFLevel] = useState<string>("all"); // all | <code> | _unset
  const [fDept, setFDept] = useState<string>("all"); // all | <dept> | _none

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmRevoke, setConfirmRevoke] = useState<CertificateListItemDto | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CertificateListItemDto | null>(null);
  const [detailCert, setDetailCert] = useState<CertificateListItemDto | null>(null);

  const listQuery = useQuery({
    queryKey: ["certificates", { revoked: filterRevoked, templateId }],
    queryFn: () =>
      certificateIssueApi.list({
        ...(templateId ? { templateId } : {}),
        ...(filterRevoked === "all" ? {} : { revoked: filterRevoked === "revoked" }),
      }),
  });

  /* 荣誉等级字典 — 左栏分类 + 列/详情 label */
  const levelDictQuery = useQuery({
    queryKey: ["dictionary", DICT_CODES.CERT_HONOR_LEVEL],
    queryFn: () => dictionariesApi.get(DICT_CODES.CERT_HONOR_LEVEL),
    staleTime: 5 * 60 * 1000,
  });
  const levelOptions = useMemo(
    () => (levelDictQuery.data?.items ?? []).filter((i) => i.active),
    [levelDictQuery.data],
  );
  const levelLabel = useMemo(() => {
    const map = new Map(levelOptions.map((o) => [o.code, o.label]));
    return (code: string | null | undefined) =>
      code ? map.get(code) ?? HONOR_LEVEL_LABEL[code] ?? code : null;
  }, [levelOptions]);

  const certs = listQuery.data ?? [];

  /** templateId 过滤时,顶部 banner 用 */
  const templateName = templateId
    ? certs.find((c) => c.templateId === templateId)?.template?.name ?? null
    : null;

  /** 部门集合(综合搜索「单位」点选项) */
  const deptOptions = useMemo(() => {
    const s = new Set<string>();
    for (const c of certs) if (c.recipientDept) s.add(c.recipientDept);
    return Array.from(s).sort();
  }, [certs]);

  const filtered = useMemo(() => {
    const kw = searchText.trim().toLowerCase();
    return certs.filter((c) => {
      if (fType !== "all" && typeOf(c) !== fType) return false;
      if (fLevel === "_unset") {
        if (c.template?.honorLevel) return false;
      } else if (fLevel !== "all") {
        if (c.template?.honorLevel !== fLevel) return false;
      }
      if (fDept === "_none") {
        if (c.recipientDept) return false;
      } else if (fDept !== "all") {
        if (c.recipientDept !== fDept) return false;
      }
      if (kw) {
        const hay = `${c.recipientName} ${c.recipientEmpNo ?? ""} ${c.certNo} ${
          c.recipientDept ?? ""
        }`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [certs, fType, fLevel, fDept, searchText]);

  const filteredIds = useMemo(() => filtered.map((c) => c.id), [filtered]);
  const selectedActive = useMemo(
    () => filtered.filter((c) => selectedIds.has(c.id)),
    [filtered, selectedIds],
  );

  const bulkMut = useMutation({
    mutationFn: (ids: string[]) => certificateIssueApi.bulkDownload(ids),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const now = new Date();
      const stamp =
        `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}` +
        `${String(now.getDate()).padStart(2, "0")}-` +
        `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
      triggerDownload(url, `djyy-certificates-${stamp}.zip`);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setSelectedIds(new Set());
      toast.success(`已打包 ${selectedActive.length} 张证书`);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "批量下载失败"),
  });

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));
    setSelectedIds(allSelected ? new Set() : new Set(filteredIds));
  }
  function clearTemplateFilter() {
    const next = new URLSearchParams(params);
    next.delete("templateId");
    setParams(next, { replace: true });
  }
  function resetSearch() {
    setSearchText("");
    setFType("all");
    setFLevel("all");
    setFDept("all");
  }

  const allChecked = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));
  const someChecked = selectedIds.size > 0 && !allChecked;
  const searchActive =
    !!searchText.trim() || fType !== "all" || fLevel !== "all" || fDept !== "all";

  return (
    <div className="h-full flex flex-col bg-[#F7F8FA]">
      {/* Header */}
      <header className="px-6 py-4 bg-white border-b border-[#E9E9E9] flex items-center gap-3">
        <AwardIcon className="w-5 h-5" style={{ color: PARTY }} />
        <div className="flex-1">
          <h1 className="text-lg font-bold text-[#1A1A1A]">已发证书</h1>
          <p className="text-xs text-[#9CA3AF] mt-0.5">
            共 {certs.length} 张
            {searchActive && filtered.length !== certs.length && (
              <> · 命中 {filtered.length}</>
            )}
            {selectedIds.size > 0 && (
              <>
                {" · "}
                <span className="text-[var(--party-primary)] font-medium">
                  已选 {selectedIds.size}
                </span>
              </>
            )}
          </p>
        </div>

        {selectedIds.size > 0 && (
          <button
            type="button"
            onClick={() => bulkMut.mutate(selectedActive.map((c) => c.id))}
            disabled={bulkMut.isPending}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium border border-[var(--party-primary)] text-[var(--party-primary)] hover:bg-party-soft disabled:opacity-50"
          >
            {bulkMut.isPending ? (
              <Loader2Icon className="w-4 h-4 animate-spin" />
            ) : (
              <PackageIcon className="w-4 h-4" />
            )}
            批量下载 ({selectedIds.size})
          </button>
        )}

        <div className="inline-flex rounded-md border border-[#E9E9E9] overflow-hidden text-xs">
          {(["all", "active", "revoked"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setFilterRevoked(k);
                setSelectedIds(new Set());
              }}
              className={`px-3 py-1.5 ${
                filterRevoked === k
                  ? "bg-[var(--party-primary)] text-white"
                  : "bg-white text-[#6B7280] hover:bg-[#F7F8FA]"
              } ${k !== "all" ? "border-l border-[#E9E9E9]" : ""}`}
            >
              {k === "all" ? "全部" : k === "active" ? "有效" : "已撤销"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => qc.invalidateQueries({ queryKey: ["certificates"] })}
          className="p-2 rounded hover:bg-[#F7F8FA] text-[#6B7280]"
          title="刷新"
        >
          <RefreshCwIcon className="w-4 h-4" />
        </button>
        <Link
          to="/admin/certificates/issue"
          className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-white"
          style={{ backgroundColor: PARTY }}
        >
          <PlusIcon className="w-4 h-4" />
          发证
        </Link>
      </header>

      {/* Body:左侧综合搜索 + 右侧列表 */}
      <div className="flex-1 min-h-0 overflow-hidden grid grid-cols-[230px_1fr]">
        <SearchPanel
          certs={certs}
          levelOptions={levelOptions}
          deptOptions={deptOptions}
          searchText={searchText}
          setSearchText={setSearchText}
          fType={fType}
          setFType={setFType}
          fLevel={fLevel}
          setFLevel={setFLevel}
          fDept={fDept}
          setFDept={setFDept}
          searchActive={searchActive}
          onReset={resetSearch}
        />

        <div className="overflow-auto p-6 flex flex-col gap-3">
          {templateId && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-party-soft border border-[var(--party-primary)] text-xs text-[var(--party-primary)]">
              <FileTextIcon className="w-3.5 h-3.5" />
              正在查看模板「{templateName ?? templateId}」的关联证书
              <button
                type="button"
                onClick={clearTemplateFilter}
                className="ml-auto inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-white/60"
              >
                <XIcon className="w-3 h-3" />
                清除
              </button>
            </div>
          )}

          {listQuery.isLoading ? (
            <div className="text-sm text-[#9CA3AF]">加载中…</div>
          ) : certs.length === 0 ? (
            <EmptyState />
          ) : filtered.length === 0 ? (
            <div className="text-sm text-[#9CA3AF] py-10 text-center bg-white rounded-lg border border-[#E9E9E9]">
              没有符合条件的证书
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-[#E9E9E9] overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[#F7F8FA] border-b border-[#E9E9E9]">
                  <tr className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide">
                    <th className="px-3 py-2.5 w-10">
                      <input
                        type="checkbox"
                        checked={allChecked}
                        ref={(el) => {
                          if (el) el.indeterminate = someChecked;
                        }}
                        onChange={toggleAll}
                        className="cursor-pointer"
                      />
                    </th>
                    <th className="text-left px-4 py-2.5">证书编号</th>
                    <th className="text-left px-4 py-2.5">持证人/集体</th>
                    <th className="text-left px-4 py-2.5">模板</th>
                    <th className="text-left px-4 py-2.5">荣誉级别</th>
                    <th className="text-left px-4 py-2.5">颁证单位</th>
                    <th className="text-left px-4 py-2.5">颁发日期</th>
                    <th className="text-left px-4 py-2.5">状态</th>
                    <th className="text-right px-4 py-2.5">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F0F0]">
                  {filtered.map((c) => (
                    <CertRow
                      key={c.id}
                      cert={c}
                      selected={selectedIds.has(c.id)}
                      onToggle={() => toggleOne(c.id)}
                      onRevoke={() => setConfirmRevoke(c)}
                      onDelete={() => setConfirmDelete(c)}
                      onOpen={() => setDetailCert(c)}
                      highlighted={c.id === highlightId}
                      levelText={levelLabel(c.template?.honorLevel)}
                      isAdmin={isAdmin}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {detailCert && (
        <CertDetailDrawer
          cert={detailCert}
          onClose={() => setDetailCert(null)}
          levelLabel={levelLabel}
          isAdmin={isAdmin}
          onRevoke={(c) => setConfirmRevoke(c)}
          onDelete={(c) => setConfirmDelete(c)}
        />
      )}

      {confirmRevoke && (
        <RevokeDialog
          cert={confirmRevoke}
          onCancel={() => setConfirmRevoke(null)}
          onDone={() => setConfirmRevoke(null)}
        />
      )}

      {confirmDelete && (
        <DeleteDialog
          cert={confirmDelete}
          onCancel={() => setConfirmDelete(null)}
          onDone={() => {
            setConfirmDelete(null);
            setDetailCert(null);
          }}
        />
      )}
    </div>
  );
}

/* ═══════════ 左侧综合搜索栏 ═══════════ */

function SearchPanel({
  certs,
  levelOptions,
  deptOptions,
  searchText,
  setSearchText,
  fType,
  setFType,
  fLevel,
  setFLevel,
  fDept,
  setFDept,
  searchActive,
  onReset,
}: {
  certs: CertificateListItemDto[];
  levelOptions: { code: string; label: string }[];
  deptOptions: string[];
  searchText: string;
  setSearchText: (v: string) => void;
  fType: TypeFilter;
  setFType: (v: TypeFilter) => void;
  fLevel: string;
  setFLevel: (v: string) => void;
  fDept: string;
  setFDept: (v: string) => void;
  searchActive: boolean;
  onReset: () => void;
}) {
  const typeCounts = useMemo(() => {
    let ind = 0;
    let col = 0;
    for (const c of certs) (typeOf(c) === "collective" ? (col += 1) : (ind += 1));
    return { ind, col };
  }, [certs]);

  const levelCounts = useMemo(() => {
    const m = new Map<string, number>();
    let unset = 0;
    for (const c of certs) {
      const lv = c.template?.honorLevel;
      if (!lv) unset += 1;
      else m.set(lv, (m.get(lv) ?? 0) + 1);
    }
    return { m, unset };
  }, [certs]);

  const deptCounts = useMemo(() => {
    const m = new Map<string, number>();
    let none = 0;
    for (const c of certs) {
      if (c.recipientDept) m.set(c.recipientDept, (m.get(c.recipientDept) ?? 0) + 1);
      else none += 1;
    }
    return { m, none };
  }, [certs]);

  return (
    <aside className="bg-white border-r border-[#E9E9E9] p-3 overflow-auto flex flex-col gap-4">
      <div className="flex items-center gap-1.5 px-1">
        <FilterIcon className="w-3.5 h-3.5 text-[var(--party-primary)]" />
        <span className="text-xs font-bold text-[#1A1A1A]">综合搜索</span>
        {searchActive && (
          <button
            type="button"
            onClick={onReset}
            className="ml-auto text-[10px] text-[#9CA3AF] hover:text-[var(--party-primary)]"
          >
            重置
          </button>
        )}
      </div>

      {/* 关键词:姓名 / 员工编号 / 证书编号 */}
      <div className="relative">
        <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF]" />
        <input
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="姓名 / 员工编号 / 编号"
          className="w-full pl-7 pr-2 py-1.5 text-xs rounded-md border border-[#E9E9E9] focus:outline-none focus:border-[var(--party-primary)]"
        />
        {searchText && (
          <button
            type="button"
            onClick={() => setSearchText("")}
            className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-[#F7F8FA]"
          >
            <XIcon className="w-3 h-3 text-[#9CA3AF]" />
          </button>
        )}
      </div>

      {/* 个人 / 集体 */}
      <PanelSection icon={UsersIcon} title="个人 / 集体">
        <ChipRow
          label="全部"
          count={certs.length}
          active={fType === "all"}
          onClick={() => setFType("all")}
        />
        <ChipRow
          label="个人"
          icon={UserIcon}
          count={typeCounts.ind}
          active={fType === "individual"}
          onClick={() => setFType("individual")}
        />
        <ChipRow
          label="集体"
          icon={UsersIcon}
          count={typeCounts.col}
          active={fType === "collective"}
          onClick={() => setFType("collective")}
        />
      </PanelSection>

      {/* 荣誉级别 */}
      <PanelSection icon={TagIcon} title="荣誉级别">
        <ChipRow
          label="全部"
          count={certs.length}
          active={fLevel === "all"}
          onClick={() => setFLevel("all")}
        />
        {levelOptions.map((o) => (
          <ChipRow
            key={o.code}
            label={o.label}
            count={levelCounts.m.get(o.code) ?? 0}
            active={fLevel === o.code}
            onClick={() => setFLevel(o.code)}
          />
        ))}
        {levelCounts.unset > 0 && (
          <ChipRow
            label="(未设级别)"
            count={levelCounts.unset}
            active={fLevel === "_unset"}
            onClick={() => setFLevel("_unset")}
            muted
          />
        )}
      </PanelSection>

      {/* 单位(部门) */}
      <PanelSection icon={Building2Icon} title="单位">
        <ChipRow
          label="全部"
          count={certs.length}
          active={fDept === "all"}
          onClick={() => setFDept("all")}
        />
        {deptOptions.map((d) => (
          <ChipRow
            key={d}
            label={d}
            count={deptCounts.m.get(d) ?? 0}
            active={fDept === d}
            onClick={() => setFDept(d)}
          />
        ))}
        {deptCounts.none > 0 && (
          <ChipRow
            label="(无单位)"
            count={deptCounts.none}
            active={fDept === "_none"}
            onClick={() => setFDept("_none")}
            muted
          />
        )}
      </PanelSection>
    </aside>
  );
}

function PanelSection({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 px-1 mb-1.5 text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wide">
        <Icon className="w-3 h-3" />
        {title}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function ChipRow({
  label,
  count,
  active,
  muted,
  icon: Icon,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  muted?: boolean;
  icon?: React.ElementType;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs transition-colors ${
        active
          ? "bg-party-soft text-[var(--party-primary)] font-semibold"
          : muted
            ? "text-[#9CA3AF] hover:bg-[#F7F8FA]"
            : "text-[#374151] hover:bg-[#F7F8FA]"
      }`}
    >
      {Icon && <Icon className="w-3 h-3 flex-shrink-0" />}
      <span className="truncate flex-1 text-left">{label}</span>
      <span
        className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
          active ? "bg-[var(--party-primary)] text-white" : "bg-[#F0F0F0] text-[#9CA3AF]"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

/* ═══════════ 类型徽章 ═══════════ */
function TypeBadge({ honorType }: { honorType: string | null }) {
  const collective = honorType === "collective";
  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1 py-px rounded text-[9px] font-medium border ${
        collective
          ? "bg-purple-50 text-purple-700 border-purple-200"
          : "bg-blue-50 text-blue-700 border-blue-200"
      }`}
    >
      {collective ? <UsersIcon className="w-2.5 h-2.5" /> : <UserIcon className="w-2.5 h-2.5" />}
      {collective ? HONOR_TYPE_LABEL.collective : HONOR_TYPE_LABEL.individual}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center py-16">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
        style={{ backgroundColor: "rgb(255, 240, 242)" }}
      >
        <AwardIcon className="w-8 h-8" style={{ color: PARTY }} />
      </div>
      <h3 className="text-base font-bold text-[#1A1A1A] mb-1">还没发过证书</h3>
      <p className="text-xs text-[#9CA3AF] mb-4 max-w-md">
        点击右上「发证」选模板 → 填变量 → 一键生成并下载证书 PDF
      </p>
      <Link
        to="/admin/certificates/issue"
        className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white"
        style={{ backgroundColor: PARTY }}
      >
        <PlusIcon className="w-4 h-4" />
        去发证
      </Link>
    </div>
  );
}

/* ═══════════ 列表行 ═══════════ */
function CertRow({
  cert,
  selected,
  highlighted,
  levelText,
  isAdmin,
  onToggle,
  onRevoke,
  onDelete,
  onOpen,
}: {
  cert: CertificateListItemDto;
  selected: boolean;
  highlighted: boolean;
  levelText: string | null;
  isAdmin: boolean;
  onToggle: () => void;
  onRevoke: () => void;
  onDelete: () => void;
  onOpen: () => void;
}) {
  const qc = useQueryClient();
  const downloadMut = useMutation({
    mutationFn: () => certificateIssueApi.get(cert.id),
    onSuccess: (full) => {
      const pdfData = full.pdfData ?? full.externalFileData;
      if (!pdfData) {
        toast.error("证书 PDF 文件缺失");
        return;
      }
      const filename = buildPdfFileName({
        honorName: cert.template?.name ?? cert.honorCode,
        honorCode: cert.honorCode,
        recipientName: cert.recipientName,
        recipientEmpNo: cert.recipientEmpNo,
      });
      triggerDownload(pdfData, filename);
      qc.invalidateQueries({ queryKey: ["certificate-detail", cert.id] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "下载失败"),
  });

  return (
    <tr
      onClick={onOpen}
      className={`cursor-pointer transition-colors ${
        highlighted
          ? "bg-amber-50"
          : cert.revoked
            ? "bg-[#FAFAFA]"
            : selected
              ? "bg-party-soft"
              : "hover:bg-[#F7F8FA]"
      }`}
    >
      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={selected} onChange={onToggle} className="cursor-pointer" />
      </td>
      <td className="px-4 py-2.5">
        <div className="font-mono text-xs text-[#1A1A1A]">{cert.certNo}</div>
        <div className="text-[10px] text-[#9CA3AF] mt-0.5">
          批 {cert.batchSeq}/{cert.batchTotal}
        </div>
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-[#1A1A1A]">{cert.recipientName}</span>
          <TypeBadge honorType={cert.honorType} />
        </div>
        {cert.recipientEmpNo && (
          <div className="text-[10px] text-[#9CA3AF] font-mono">{cert.recipientEmpNo}</div>
        )}
      </td>
      <td className="px-4 py-2.5">
        <div className="text-xs text-[#1A1A1A]">{cert.template?.name ?? "—"}</div>
        {cert.source === "external" && (
          <span className="inline-block mt-0.5 text-[9px] px-1 py-px rounded bg-blue-100 text-blue-700">
            外部证书
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 text-xs text-[#374151]">
        {levelText ? (
          <span className="px-1.5 py-0.5 rounded bg-[#F7F8FA] border border-[#E9E9E9]">
            {levelText}
          </span>
        ) : (
          <span className="text-[#D1D5DB]">—</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-xs text-[#374151] max-w-[180px]">
        <span className="line-clamp-2">{cert.issuingOrgName || "—"}</span>
      </td>
      <td className="px-4 py-2.5 text-xs text-[#6B7280]">
        {new Date(cert.issueDate).toLocaleDateString("zh-CN")}
      </td>
      <td className="px-4 py-2.5">
        {cert.revoked ? (
          <span
            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700"
            title={cert.revokedReason ?? undefined}
          >
            <BanIcon className="w-3 h-3" />
            已撤销
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">
            <CheckCircle2Icon className="w-3 h-3" />
            有效
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => downloadMut.mutate()}
            disabled={downloadMut.isPending}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-[#6B7280] hover:text-[var(--party-primary)] hover:bg-party-soft disabled:opacity-50"
          >
            {downloadMut.isPending ? (
              <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <DownloadIcon className="w-3.5 h-3.5" />
            )}
            下载
          </button>
          {!cert.revoked && (
            <button
              type="button"
              onClick={onRevoke}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-[#9CA3AF] hover:text-red-600 hover:bg-red-50"
            >
              <BanIcon className="w-3.5 h-3.5" />
              撤销
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={onDelete}
              title="删除证书(管理员)"
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-[#9CA3AF] hover:text-red-700 hover:bg-red-50"
            >
              <TrashIcon className="w-3.5 h-3.5" />
              删除
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

/* ═══════════ 详情抽屉 ═══════════ */
function CertDetailDrawer({
  cert,
  onClose,
  levelLabel,
  isAdmin,
  onRevoke,
  onDelete,
}: {
  cert: CertificateListItemDto;
  onClose: () => void;
  levelLabel: (code: string | null | undefined) => string | null;
  isAdmin: boolean;
  onRevoke: (c: CertificateListItemDto) => void;
  onDelete: (c: CertificateListItemDto) => void;
}) {
  // 信息直接用列表项 → 抽屉秒开,不必再请求详情。
  const c = cert;
  const isExternal = c.source === "external" || !c.templateId;

  // 打开详情即自动渲染预览:内部证书拉模板 designJson + cert.variableData 现场渲染(轻量),
  // 并注入真实 certNo 让编号正确。外部证书无模板 → 不内联预览(原件走「下载」按需拉)。
  const templateQuery = useQuery({
    queryKey: ["certificate-template-design", c.templateId],
    queryFn: () => certificateTemplateApi.get(c.templateId as string),
    enabled: !isExternal && !!c.templateId,
    staleTime: 5 * 60 * 1000,
  });
  const previewState = useMemo<DesignerState | null>(() => {
    if (!templateQuery.data) return null;
    try {
      return JSON.parse(templateQuery.data.designJson) as DesignerState;
    } catch {
      return null;
    }
  }, [templateQuery.data]);
  const previewValues = useMemo<Record<string, string>>(() => {
    const base = parseVariableValues(c.variableData);
    // 用真实编号覆盖发证时存的占位编号 —— 让预览显示正确证号
    return { ...base, certNo: c.certNo };
  }, [c.variableData, c.certNo]);

  const downloadMut = useMutation({
    mutationFn: () => certificateIssueApi.get(c.id),
    onSuccess: (full) => {
      const data = full.pdfData ?? full.externalFileData;
      if (!data) {
        toast.error("证书 PDF 文件缺失");
        return;
      }
      triggerDownload(
        data,
        buildPdfFileName({
          honorName: full.template?.name ?? full.honorCode,
          honorCode: full.honorCode,
          recipientName: full.recipientName,
          recipientEmpNo: full.recipientEmpNo,
        }),
      );
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "下载失败"),
  });

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <aside className="fixed top-0 right-0 h-screen w-[560px] max-w-[92vw] bg-white shadow-2xl z-50 flex flex-col">
        <div className="flex-shrink-0 px-5 py-4 border-b border-[#E9E9E9] flex items-center gap-3">
          <AwardIcon className="w-5 h-5" style={{ color: PARTY }} />
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-[#1A1A1A]">证书详情</h2>
            <div className="text-[11px] text-[#9CA3AF] font-mono truncate">{c.certNo}</div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#F7F8FA] text-[#9CA3AF]">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-5 space-y-5">
          {/* 状态 */}
          <div className="flex items-center gap-2">
            {c.revoked ? (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-red-100 text-red-700">
                <BanIcon className="w-3.5 h-3.5" />
                已撤销
                {c.revokedReason ? ` · ${c.revokedReason}` : ""}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-green-100 text-green-700">
                <CheckCircle2Icon className="w-3.5 h-3.5" />
                有效
              </span>
            )}
            <TypeBadge honorType={c.honorType} />
            {c.source === "external" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                外部证书
              </span>
            )}
          </div>

          {/* 信息表 */}
          <div className="rounded-lg border border-[#E9E9E9] divide-y divide-[#F0F0F0]">
            <InfoRow label="证书编号" value={c.certNo} mono />
            <InfoRow label="持证人/集体" value={c.recipientName} />
            <InfoRow label="员工编号" value={c.recipientEmpNo || "—"} mono />
            <InfoRow label="单位/部门" value={c.recipientDept || "—"} />
            <InfoRow label="模板" value={c.template?.name || "(外部证书,无模板)"} />
            <InfoRow label="荣誉代码" value={c.honorCode} mono />
            <InfoRow label="荣誉级别" value={levelLabel(c.template?.honorLevel) || "—"} />
            <InfoRow label="颁证单位" value={c.issuingOrgName || "—"} />
            <InfoRow
              label="颁发日期"
              value={new Date(c.issueDate).toLocaleDateString("zh-CN")}
            />
            <InfoRow
              label="有效期"
              value={
                c.validUntil
                  ? new Date(c.validUntil).toLocaleDateString("zh-CN")
                  : "永久有效"
              }
            />
            <InfoRow label="发证人" value={c.issuerName || "—"} />
            <InfoRow label="批次序号" value={`${c.batchSeq} / ${c.batchTotal}`} mono />
          </div>

          {/* 公开验证 */}
          <a
            href={`/verify/${c.publicToken}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-[var(--party-primary)] hover:underline"
          >
            <ExternalLinkIcon className="w-3.5 h-3.5" />
            打开公开验证页
          </a>

          {/* 证书预览 — 打开详情即自动渲染(内部证书现场渲染;外部证书提示下载) */}
          <div>
            <div className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wide mb-1.5">
              证书预览
            </div>
            {!isExternal ? (
              templateQuery.isLoading ? (
                <PreviewLoading />
              ) : previewState ? (
                <div className="space-y-1">
                  <div className="rounded-lg border border-[#E9E9E9] overflow-hidden">
                    <PreviewCanvas
                      state={previewState}
                      variableValues={previewValues}
                      maxWidth={520}
                      maxHeight={420}
                    />
                  </div>
                  <div className="text-[10px] text-[#9CA3AF] text-right">
                    按发证模板实时渲染 · 点「下载」获取高清 PDF 原件
                  </div>
                </div>
              ) : (
                <div className="text-xs text-[#9CA3AF] py-6 text-center rounded-lg border border-[#E9E9E9]">
                  模板已删除或无法解析,无法预览。可点「下载」获取已发 PDF。
                </div>
              )
            ) : (
              <div className="text-xs text-[#9CA3AF] py-6 text-center rounded-lg border border-dashed border-[#E9E9E9]">
                外部上传证书,点下方「下载」查看原件
              </div>
            )}
          </div>
        </div>

        {/* 底部操作 */}
        <div className="flex-shrink-0 px-5 py-3 border-t border-[#E9E9E9] flex items-center gap-2">
          <button
            type="button"
            onClick={() => downloadMut.mutate()}
            disabled={downloadMut.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: PARTY }}
          >
            {downloadMut.isPending ? (
              <Loader2Icon className="w-4 h-4 animate-spin" />
            ) : (
              <DownloadIcon className="w-4 h-4" />
            )}
            下载
          </button>
          {!c.revoked && (
            <button
              type="button"
              onClick={() => onRevoke(c)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border border-[#E9E9E9] text-[#6B7280] hover:text-red-600 hover:border-red-200"
            >
              <BanIcon className="w-4 h-4" />
              撤销
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={() => onDelete(c)}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border border-red-200 text-red-600 hover:bg-red-50"
            >
              <TrashIcon className="w-4 h-4" />
              删除
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

function InfoRow({
  label,
  value,
  mono,
  small,
}: {
  label: string;
  value: string;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 px-3 py-2">
      <span
        className={`flex-shrink-0 text-[#9CA3AF] ${small ? "text-[10px] w-24" : "text-xs w-20"}`}
      >
        {label}
      </span>
      <span
        className={`flex-1 text-[#1A1A1A] break-words ${small ? "text-[11px]" : "text-xs"} ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function PreviewLoading() {
  return (
    <div className="flex items-center justify-center gap-2 py-10 rounded-lg border border-[#E9E9E9] text-xs text-[#9CA3AF]">
      <Loader2Icon className="w-4 h-4 animate-spin" />
      加载中…
    </div>
  );
}

/* ═══════════ 撤销弹窗 ═══════════ */
function RevokeDialog({
  cert,
  onCancel,
  onDone,
}: {
  cert: CertificateListItemDto;
  onCancel: () => void;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const mut = useMutation({
    mutationFn: () => certificateIssueApi.revoke(cert.id, reason || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["certificates"] });
      qc.invalidateQueries({ queryKey: ["certificate-detail", cert.id] });
      toast.success("已撤销");
      onDone();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "撤销失败"),
  });
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30" onClick={onCancel}>
      <div className="bg-white rounded-lg w-[420px] p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold text-[#1A1A1A] mb-2 flex items-center gap-2">
          <BanIcon className="w-4 h-4 text-red-600" />
          撤销证书?
        </h3>
        <p className="text-sm text-[#6B7280] mb-3">
          证书 <span className="font-mono text-[#1A1A1A]">{cert.certNo}</span>
          (持证人:<span className="font-medium">{cert.recipientName}</span>)
          将被标记为<span className="text-red-600 font-medium">已撤销</span>,
          公开验证页将显示撤销状态,数据本身保留。
        </p>
        <label className="block">
          <span className="block text-xs text-[#6B7280] mb-1">撤销原因(可选)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="如:个人申请取消 / 证书信息有误 / ..."
            className="w-full px-2 py-1.5 text-xs rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none resize-none"
          />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={mut.isPending}
            className="px-3 py-1.5 rounded text-sm border border-[#E9E9E9] hover:bg-[#F7F8FA]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
            className="px-3 py-1.5 rounded text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
          >
            {mut.isPending ? "撤销中…" : "确认撤销"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════ 删除弹窗(管理员) ═══════════ */
function DeleteDialog({
  cert,
  onCancel,
  onDone,
}: {
  cert: CertificateListItemDto;
  onCancel: () => void;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => certificateIssueApi.remove(cert.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["certificates"] });
      toast.success("证书已删除");
      onDone();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "删除失败"),
  });
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30" onClick={onCancel}>
      <div className="bg-white rounded-lg w-[420px] p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold text-[#1A1A1A] mb-2 flex items-center gap-2">
          <TrashIcon className="w-4 h-4 text-red-600" />
          删除证书?
        </h3>
        <p className="text-sm text-[#6B7280] mb-2">
          证书 <span className="font-mono text-[#1A1A1A]">{cert.certNo}</span>
          (持证人/集体:<span className="font-medium">{cert.recipientName}</span>)
          将被<span className="text-red-600 font-medium">物理删除,不可恢复</span>。
        </p>
        <p className="text-xs text-[#9CA3AF] mb-4">
          如只想让其失效但保留记录,请改用「撤销」。删除为管理员专用操作。
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={mut.isPending}
            className="px-3 py-1.5 rounded text-sm border border-[#E9E9E9] hover:bg-[#F7F8FA]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
            className="px-3 py-1.5 rounded text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
          >
            {mut.isPending ? "删除中…" : "确认删除"}
          </button>
        </div>
      </div>
    </div>
  );
}
