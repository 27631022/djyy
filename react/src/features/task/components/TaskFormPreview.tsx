import { groupTaskFields, type TaskField } from "../api";
import { getFieldType } from "../fields";

/**
 * 任务表单「只读预览」—— 按分组聚合,按字段类型渲染示意控件。
 * 派发人用它确认「这个任务要填什么」;每个字段的样例控件由注册表的 Preview(variant="form")渲染。
 * 实际可输入的填报控件在 P2(FillInput)。
 */
export function TaskFormPreview({ fields }: { fields: TaskField[] }) {
  if (!fields.length) {
    return (
      <div className="text-xs text-[#9CA3AF] py-8 text-center border border-dashed border-[#E9E9E9] rounded-md">
        还没有字段 —— 添加字段后这里会实时预览填报表单
      </div>
    );
  }
  const groups = groupTaskFields(fields);
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.key} className="border border-[#EDEDED] rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-[#F7F8FA] text-[14px] font-semibold text-[#4B5563]">
            {g.label}
          </div>
          <div className="divide-y divide-[#F1F3F5]">
            {g.fields.map((f) => (
              <FieldPreview key={f.code} field={f} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** 一行 = 左:字段名(完整可见,长名换行)/ 中:填报控件(只读示意)/ 右:备注说明。紧凑表格式。 */
function FieldPreview({ field: f }: { field: TaskField }) {
  const def = getFieldType(f.type);
  const Icon = def.icon;
  const Preview = def.Preview;
  return (
    <div className="grid grid-cols-[150px_minmax(0,1fr)_140px] gap-3 items-start px-3 py-1.5">
      {/* 左:字段名 */}
      <div className="text-[14px] text-[#1A1A1A] leading-snug min-w-0 pt-1" title={f.label}>
        <Icon className="inline w-4 h-4 text-[#9CA3AF] mr-1 -mt-0.5 align-middle" />
        {f.label}
        {f.required && <span className="text-[var(--party-primary)] ml-0.5">*</span>}
        {f.unit && <span className="text-[12px] text-[#9CA3AF] ml-1">({f.unit})</span>}
      </div>
      {/* 中:填报控件(只读示意) */}
      <div className="min-w-0">
        <Preview field={f} variant="form" />
      </div>
      {/* 右:备注说明 */}
      <div className="text-[13px] text-[#9CA3AF] leading-snug pt-1 truncate" title={f.description || ""}>
        {f.description || <span className="text-[#D1D5DB]">—</span>}
      </div>
    </div>
  );
}
