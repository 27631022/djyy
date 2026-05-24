import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { SearchIcon, UserIcon, KeyboardIcon, CheckIcon } from "lucide-react";
import { usersApi, type UserListItem } from "@/features/user";

export interface RecipientValue {
  /** 关联系统 User 时不为空 */
  recipientUserId?: string;
  recipientName: string;
  recipientEmpNo?: string;
  recipientDept?: string;
  recipientIdCard?: string;
  recipientPhone?: string;
}

interface RecipientPickerProps {
  value: RecipientValue;
  onChange: (v: RecipientValue) => void;
}

type Mode = "user" | "manual";

/**
 * 持证人选择器:从系统 User 列表选 / 手填外部人员 — 两种来源切换。
 *
 * 选 User 时:用 User.name 作为 recipientName,User.username 作为 empNo,
 *   主行政归属作为 dept。可在右侧补 idCard / phone。
 * 手填时:外部颁发场景(给外部嘉宾、合作单位人员等)。
 */
export function RecipientPicker({ value, onChange }: RecipientPickerProps) {
  const [mode, setMode] = useState<Mode>(value.recipientUserId ? "user" : "manual");

  return (
    <div className="space-y-3">
      {/* 来源切换 */}
      <div className="inline-flex rounded-md border border-[#E9E9E9] overflow-hidden text-xs">
        <button
          type="button"
          onClick={() => setMode("user")}
          className={`flex items-center gap-1 px-3 py-1.5 ${
            mode === "user"
              ? "bg-[var(--party-primary)] text-white"
              : "bg-white text-[#6B7280] hover:bg-[#F7F8FA]"
          }`}
        >
          <UserIcon className="w-3.5 h-3.5" />
          系统用户
        </button>
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`flex items-center gap-1 px-3 py-1.5 border-l border-[#E9E9E9] ${
            mode === "manual"
              ? "bg-[var(--party-primary)] text-white"
              : "bg-white text-[#6B7280] hover:bg-[#F7F8FA]"
          }`}
        >
          <KeyboardIcon className="w-3.5 h-3.5" />
          手填(外部)
        </button>
      </div>

      {mode === "user" ? (
        <UserMode value={value} onChange={onChange} />
      ) : (
        <ManualMode value={value} onChange={onChange} />
      )}
    </div>
  );
}

/* ─── 系统用户选择 ─── */

function UserMode({
  value,
  onChange,
}: {
  value: RecipientValue;
  onChange: (v: RecipientValue) => void;
}) {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["users", "issue-picker", search],
    queryFn: () =>
      usersApi.list({
        search: search || undefined,
        active: true,
        take: 50,
        sortBy: "name",
        sortDir: "asc",
      }),
  });

  const users = useMemo(() => data?.items ?? [], [data]);

  function pickUser(u: UserListItem) {
    onChange({
      recipientUserId: u.id,
      recipientName: u.name,
      recipientEmpNo: u.username,
      recipientDept: u.primaryAdmin?.orgName ?? undefined,
      recipientIdCard: value.recipientIdCard,
      recipientPhone: value.recipientPhone,
    });
  }

  return (
    <div>
      <div className="relative">
        <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF]" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索姓名 / 员工编号"
          className="w-full pl-7 pr-2 py-1.5 text-xs rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none"
        />
      </div>
      <div className="mt-2 max-h-60 overflow-auto rounded border border-[#E9E9E9] divide-y divide-[#F0F0F0] bg-white">
        {isLoading ? (
          <div className="px-3 py-4 text-xs text-[#9CA3AF] text-center">搜索中…</div>
        ) : users.length === 0 ? (
          <div className="px-3 py-4 text-xs text-[#9CA3AF] text-center">未找到用户</div>
        ) : (
          users.map((u) => {
            const active = u.id === value.recipientUserId;
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => pickUser(u)}
                className={`w-full flex items-center justify-between px-3 py-2 text-left text-xs ${
                  active ? "bg-party-soft" : "hover:bg-[#F7F8FA]"
                }`}
              >
                <div className="min-w-0">
                  <div className="font-medium text-[#1A1A1A] truncate">{u.name}</div>
                  <div className="text-[10px] text-[#9CA3AF] flex items-center gap-1.5 mt-0.5">
                    <span className="font-mono">{u.username}</span>
                    {u.primaryAdmin && <span>· {u.primaryAdmin.orgName}</span>}
                  </div>
                </div>
                {active && <CheckIcon className="w-4 h-4 text-[var(--party-primary)] flex-shrink-0" />}
              </button>
            );
          })
        )}
      </div>

      {/* 选中后可补的附加字段 */}
      {value.recipientUserId && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <LabeledInput
            label="身份证号(可选)"
            value={value.recipientIdCard ?? ""}
            onChange={(v) => onChange({ ...value, recipientIdCard: v || undefined })}
          />
          <LabeledInput
            label="电话(可选)"
            value={value.recipientPhone ?? ""}
            onChange={(v) => onChange({ ...value, recipientPhone: v || undefined })}
          />
        </div>
      )}
    </div>
  );
}

/* ─── 手填外部 ─── */

function ManualMode({
  value,
  onChange,
}: {
  value: RecipientValue;
  onChange: (v: RecipientValue) => void;
}) {
  function patch(p: Partial<RecipientValue>) {
    onChange({ ...value, recipientUserId: undefined, ...p });
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      <LabeledInput
        label="姓名 *"
        value={value.recipientName}
        onChange={(v) => patch({ recipientName: v })}
      />
      <LabeledInput
        label="员工编号(可选)"
        value={value.recipientEmpNo ?? ""}
        onChange={(v) => patch({ recipientEmpNo: v || undefined })}
      />
      <LabeledInput
        label="部门(可选)"
        value={value.recipientDept ?? ""}
        onChange={(v) => patch({ recipientDept: v || undefined })}
      />
      <LabeledInput
        label="身份证号(可选)"
        value={value.recipientIdCard ?? ""}
        onChange={(v) => patch({ recipientIdCard: v || undefined })}
      />
      <LabeledInput
        label="电话(可选)"
        value={value.recipientPhone ?? ""}
        onChange={(v) => patch({ recipientPhone: v || undefined })}
      />
    </div>
  );
}

/* ─── 通用输入 ─── */

function LabeledInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] font-medium text-[#6B7280] mb-1">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1.5 text-xs rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none"
      />
    </label>
  );
}
