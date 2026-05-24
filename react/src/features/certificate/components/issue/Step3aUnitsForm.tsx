/**
 * 证书发证向导 V3 — Step 3a 录入被表彰集体。
 *
 * 仅渲染 records 里 honorType="collective" 的记录,
 * 为每条记录填一组「被表彰单位/集体名称」(自由文本,不关联组织表)。
 *
 * 数据模型:写入 record.collectives[]:CollectiveRow[]。
 * 同一条荣誉可以有多个集体一起获奖(如「先进党组织」颁给 3 个支部)。
 *
 * 不在此组件里:个人荣誉的录入(Step 3b,Phase 6)。
 */

import { useMemo, useState } from "react";
import {
  Building2Icon,
  PlusIcon,
  XIcon,
  UsersIcon,
  ClipboardListIcon,
} from "lucide-react";
import {
  newCollectiveRow,
  type CollectiveRow,
  type HonorRecord,
} from "../../lib/certificateDraft";
import type { CertificateTemplateDto } from "../../api";

interface Step3aUnitsFormProps {
  records: HonorRecord[];
  onRecordsChange: (records: HonorRecord[]) => void;
  templates: CertificateTemplateDto[];
}

export function Step3aUnitsForm({
  records,
  onRecordsChange,
  templates,
}: Step3aUnitsFormProps) {
  const collectiveRecords = useMemo(
    () => records.filter((r) => r.honorType === "collective"),
    [records],
  );

  /**
   * 用户点击过的 rid;为 null 时(初次进 / records 变后失效)走兜底「第 1 条」。
   * 不用 setState-in-effect 校正,以 derived effectiveRid 实时算出。
   */
  const [userPickedRid, setUserPickedRid] = useState<string | null>(null);

  const effectiveRid = useMemo<string | null>(() => {
    if (collectiveRecords.length === 0) return null;
    if (
      userPickedRid &&
      collectiveRecords.some((r) => r.rid === userPickedRid)
    ) {
      return userPickedRid;
    }
    return collectiveRecords[0].rid;
  }, [collectiveRecords, userPickedRid]);

  const selected = useMemo(
    () =>
      collectiveRecords.find((r) => r.rid === effectiveRid) ?? null,
    [collectiveRecords, effectiveRid],
  );

  function templateOf(record: HonorRecord): CertificateTemplateDto | undefined {
    return record.templateId
      ? templates.find((t) => t.id === record.templateId)
      : undefined;
  }

  function patchRecord(rid: string, patch: Partial<HonorRecord>) {
    onRecordsChange(
      records.map((r) => (r.rid === rid ? { ...r, ...patch } : r)),
    );
  }

  function patchCollective(crid: string, patch: Partial<CollectiveRow>) {
    if (!selected) return;
    patchRecord(selected.rid, {
      collectives: selected.collectives.map((c) =>
        c.rid === crid ? { ...c, ...patch } : c,
      ),
    });
  }

  function addCollective() {
    if (!selected) return;
    patchRecord(selected.rid, {
      collectives: [...selected.collectives, newCollectiveRow()],
    });
  }

  function removeCollective(crid: string) {
    if (!selected) return;
    patchRecord(selected.rid, {
      collectives: selected.collectives.filter((c) => c.rid !== crid),
    });
  }

  /* ─── 批量粘贴 ─── */
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");

  function applyBulk() {
    if (!selected) return;
    const lines = bulkText
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;
    patchRecord(selected.rid, {
      // 已有非空保留,粘贴的追加到末尾
      collectives: [
        ...selected.collectives.filter((c) => c.name.trim()),
        ...lines.map((name) => newCollectiveRow({ name })),
      ],
    });
    setBulkText("");
    setBulkOpen(false);
  }

  if (collectiveRecords.length === 0) {
    return (
      <div className="text-sm text-[#6B7280]">
        当前没有「集体类」表彰记录,本步骤跳过。
      </div>
    );
  }

  const bulkPreviewCount = bulkText.split(/\n/).filter((l) => l.trim()).length;

  return (
    <div>
      <h2 className="text-base font-bold text-[#1A1A1A] mb-1 flex items-center gap-2">
        <Building2Icon className="w-4 h-4 text-[var(--party-primary)]" />
        第三步(a)· 录入被表彰集体
      </h2>
      <p className="text-xs text-[#9CA3AF] mb-4">
        为每条「集体类」表彰记录填写被表彰单位/集体名称(每行 1 个,自由文本,
        不需关联组织库)。同一份荣誉可多个集体共获,每个集体单独发一张证书。
      </p>

      <div className="grid grid-cols-[260px_1fr] gap-4">
        {/* 左:集体 record 列表 */}
        <div className="space-y-2">
          {collectiveRecords.map((r, i) => {
            const t = templateOf(r);
            const validCount = r.collectives.filter((c) =>
              c.name.trim(),
            ).length;
            const ready = validCount > 0;
            const isActive = r.rid === effectiveRid;
            return (
              <button
                key={r.rid}
                type="button"
                onClick={() => setUserPickedRid(r.rid)}
                className={`w-full text-left p-2.5 rounded border transition-colors ${
                  isActive
                    ? "border-[var(--party-primary)] bg-party-soft"
                    : "border-[#E9E9E9] bg-white hover:border-[var(--party-primary)] hover:bg-[#FFF7F8]"
                }`}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[10px] font-mono text-[#9CA3AF]">
                    #{i + 1}
                  </span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded ${
                      ready
                        ? "bg-green-50 text-green-700 border border-green-200"
                        : "bg-red-50 text-red-700 border border-red-200"
                    }`}
                  >
                    {ready ? `${validCount} 个` : "未录"}
                  </span>
                </div>
                <div
                  className="text-sm font-semibold text-[#1A1A1A] truncate"
                  title={r.honorName || t?.name || "未命名"}
                >
                  {r.honorName || t?.name || "未命名"}
                </div>
                {t && (
                  <div
                    className="text-[10px] text-[#9CA3AF] mt-0.5 truncate"
                    title={t.name}
                  >
                    模板:{t.name}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* 右:集体名编辑表格 */}
        <div>
          {!selected ? (
            <div className="text-sm text-[#9CA3AF]">请在左侧选择一条记录</div>
          ) : (
            <>
              {/* 当前 record 头 */}
              <div className="mb-3 p-3 rounded-lg bg-[#FAFBFC] border border-[#E9E9E9]">
                <div className="flex items-center gap-2 mb-1">
                  <UsersIcon className="w-4 h-4 text-[var(--party-primary)]" />
                  <span className="text-sm font-semibold text-[#1A1A1A]">
                    {selected.honorName ||
                      templateOf(selected)?.name ||
                      "未命名"}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                    集体
                  </span>
                </div>
                {templateOf(selected) && (
                  <div className="text-[11px] text-[#6B7280]">
                    模板:{templateOf(selected)?.name}
                    {templateOf(selected)?.honorCode && (
                      <span className="ml-2 font-mono text-[#9CA3AF]">
                        [{templateOf(selected)?.honorCode}]
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* 表格 */}
              <div className="rounded-lg border border-[#E9E9E9] overflow-hidden bg-white">
                <table className="w-full text-xs">
                  <thead className="bg-[#F7F8FA]">
                    <tr className="text-[10px] text-[#6B7280] uppercase tracking-wide">
                      <th className="px-2 py-2 text-left w-12">#</th>
                      <th className="px-2 py-2 text-left">
                        被表彰单位 / 集体名称 *
                      </th>
                      <th className="px-2 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0F0F0]">
                    {selected.collectives.length === 0 && (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-2 py-6 text-center text-[#9CA3AF] text-xs"
                        >
                          还没有录入 —— 点底部「+ 添加一行」开始
                        </td>
                      </tr>
                    )}
                    {selected.collectives.map((c, i) => (
                      <tr key={c.rid}>
                        <td className="px-2 py-1 text-[#9CA3AF] font-mono">
                          {i + 1}
                        </td>
                        <td className="px-2 py-1">
                          <div className="flex items-center gap-1.5">
                            <Building2Icon className="w-3.5 h-3.5 text-[#9CA3AF] flex-shrink-0" />
                            <input
                              type="text"
                              value={c.name}
                              onChange={(e) =>
                                patchCollective(c.rid, { name: e.target.value })
                              }
                              placeholder="如「机关党支部」/「青年突击队」/「先进基层党组织(机关综合处)」"
                              className="flex-1 px-1.5 py-1 text-xs rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none"
                            />
                          </div>
                        </td>
                        <td className="px-2 py-1 text-center">
                          <button
                            type="button"
                            onClick={() => removeCollective(c.rid)}
                            className="p-1 rounded text-[#9CA3AF] hover:text-red-600"
                            title="删除此行"
                          >
                            <XIcon className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-2 py-2 border-t border-[#F0F0F0] bg-[#FAFAFB] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={addCollective}
                      className="flex items-center gap-1 text-[11px] text-[var(--party-primary)] hover:underline"
                    >
                      <PlusIcon className="w-3 h-3" />
                      添加一行
                    </button>
                    <span className="w-px h-3 bg-[#E9E9E9]" />
                    <button
                      type="button"
                      onClick={() => setBulkOpen((v) => !v)}
                      className="flex items-center gap-1 text-[11px] text-[#6B7280] hover:text-[var(--party-primary)] hover:underline"
                    >
                      <ClipboardListIcon className="w-3 h-3" />
                      {bulkOpen ? "收起批量粘贴" : "批量粘贴(每行 1 个)"}
                    </button>
                  </div>
                  <span className="text-[10px] text-[#9CA3AF]">
                    有效:
                    {
                      selected.collectives.filter((c) => c.name.trim()).length
                    }{" "}
                    / {selected.collectives.length}
                  </span>
                </div>
              </div>

              {/* 批量粘贴框 */}
              {bulkOpen && (
                <div className="mt-3 p-3 rounded-lg bg-white border border-[#E9E9E9]">
                  <div className="text-[11px] text-[#6B7280] mb-2">
                    把名单粘进来,每行 1 个(空行自动忽略)。会
                    <span className="font-semibold text-[#1A1A1A]">
                      追加
                    </span>
                    到已有列表后面,不覆盖。
                  </div>
                  <textarea
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    rows={5}
                    placeholder={
                      "机关党支部\n青年突击队\n第二联络部党支部\n后勤保障党小组"
                    }
                    className="w-full px-2 py-1.5 text-xs rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none font-mono"
                  />
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setBulkText("");
                        setBulkOpen(false);
                      }}
                      className="px-3 py-1 text-xs rounded border border-[#E9E9E9] hover:bg-[#F7F8FA]"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={applyBulk}
                      disabled={bulkPreviewCount === 0}
                      className="px-3 py-1 text-xs rounded text-white disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ backgroundColor: "var(--party-primary)" }}
                    >
                      追加 {bulkPreviewCount} 项
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
