import type { ElementType } from "react";
import { PlusIcon, LockIcon, CheckIcon } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/shared/components/ui/popover";
import { CARD_META, PERSONAL_CATALOG, ADMIN_CATALOG, type WbCardType } from "./wbLayout";

/**
 * 卡片清单:按权限列出「我能看到的全部卡片」(个人卡全员 + 管理员卡仅管理员),
 * 已放在桌面上的标「已选」(点击移除),未放的标「添加」(点击加入)。每种卡单例。
 */
export function WbCatalog({
  isAdmin,
  present,
  onAdd,
  onRemove,
}: {
  isAdmin: boolean;
  present: (t: WbCardType) => boolean;
  onAdd: (t: WbCardType) => void;
  onRemove: (t: WbCardType) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[13px] border border-[#dce4ef] bg-white/80 hover:border-[var(--party-primary)] text-[#344054] font-bold"
        >
          <PlusIcon className="w-4 h-4" />
          添加卡片
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2 max-h-[70vh] overflow-auto">
        <div className="text-[11px] text-[#9CA3AF] px-1 pb-1">选择要显示的卡片 ·「已选」点击可移除</div>
        <Group title="个人卡片" types={PERSONAL_CATALOG} present={present} onAdd={onAdd} onRemove={onRemove} />
        {isAdmin && (
          <Group title="管理员卡片" admin types={ADMIN_CATALOG} present={present} onAdd={onAdd} onRemove={onRemove} />
        )}
      </PopoverContent>
    </Popover>
  );
}

function Group({
  title,
  types,
  present,
  onAdd,
  onRemove,
  admin,
}: {
  title: string;
  types: WbCardType[];
  present: (t: WbCardType) => boolean;
  onAdd: (t: WbCardType) => void;
  onRemove: (t: WbCardType) => void;
  admin?: boolean;
}) {
  return (
    <div className="mb-1">
      <div className="flex items-center gap-1 text-[12px] text-[#9CA3AF] px-1 pt-1 pb-1.5">
        {admin && <LockIcon className="w-3 h-3" />}
        {title}
      </div>
      <div className="space-y-0.5">
        {types.map((t) => {
          const m = CARD_META[t];
          const Icon: ElementType = m.icon;
          const selected = present(t);
          return (
            <button
              key={t}
              type="button"
              onClick={() => (selected ? onRemove(t) : onAdd(t))}
              className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left ${
                selected ? "bg-party-soft" : "hover:bg-[#F7F8FA]"
              }`}
            >
              <span
                className="w-7 h-7 rounded-md grid place-items-center bg-white border border-[#e2e8f0] flex-shrink-0"
                style={{ color: "var(--party-primary)" }}
              >
                <Icon className="w-4 h-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-[#172033]">{m.title}</div>
                <div className="text-[11px] text-[#9CA3AF] truncate">{m.desc}</div>
              </div>
              {selected ? (
                <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-[var(--party-primary)] flex-shrink-0">
                  <CheckIcon className="w-3.5 h-3.5" />
                  已选
                </span>
              ) : (
                <span className="inline-flex items-center gap-0.5 text-[11px] text-[#9CA3AF] flex-shrink-0">
                  <PlusIcon className="w-3.5 h-3.5" />
                  添加
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
