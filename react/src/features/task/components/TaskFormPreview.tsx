import { groupTaskFields, type TaskField } from "../api";
import { FIELD_TYPE_ICONS } from "./fieldTypeIcons";

/**
 * 任务表单「只读预览」—— 按分组聚合,按字段类型渲染示意控件。
 * 派发人用它确认「这个任务要填什么」;实际可输入的填报控件在 P2(FieldRenderer)。
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
          <div className="px-3 py-1.5 bg-[#F7F8FA] text-[12px] font-semibold text-[#4B5563]">
            {g.label}
          </div>
          <div className="p-3 space-y-2.5">
            {g.fields.map((f) => (
              <FieldPreview key={f.code} field={f} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FieldPreview({ field: f }: { field: TaskField }) {
  const Icon = FIELD_TYPE_ICONS[f.type];
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3 h-3 text-[#9CA3AF]" />
        <span className="text-[12px] text-[#1A1A1A]">{f.label}</span>
        {f.required && <span className="text-[var(--party-primary)] text-xs">*</span>}
        {f.unit && <span className="text-[10px] text-[#9CA3AF]">({f.unit})</span>}
      </div>
      <SampleControl field={f} />
      {f.description && <p className="text-[10px] text-[#9CA3AF] mt-0.5">{f.description}</p>}
    </div>
  );
}

const boxCls =
  "w-full px-2.5 py-1.5 text-xs border border-[#E9E9E9] rounded-md bg-[#FCFCFC] text-[#9CA3AF]";

function SampleControl({ field: f }: { field: TaskField }) {
  switch (f.type) {
    case "textarea":
    case "richtext":
      return (
        <div className={`${boxCls} h-12`}>
          {f.placeholder || (f.type === "richtext" ? "富文本编辑器…" : "多行文本…")}
        </div>
      );
    case "select":
      return (
        <div className={`${boxCls} flex items-center justify-between`}>
          <span>{f.placeholder || "请选择"}</span>
          <span className="text-[10px]">字典:{f.dictCode}</span>
        </div>
      );
    case "file":
    case "image":
      return (
        <div className="w-full py-3 border border-dashed border-[#E9E9E9] rounded-md text-center text-[11px] text-[#9CA3AF]">
          点击上传{f.type === "image" ? "图片" : "文件"}
          {f.maxFiles ? `(最多 ${f.maxFiles} 个)` : ""}
        </div>
      );
    case "doclink":
      return (
        <div className="w-full py-2 border border-dashed border-[#E9E9E9] rounded-md text-center text-[11px] text-[#9CA3AF]">
          在线文档(群晖,P4 接入)
        </div>
      );
    case "date":
      return <div className={boxCls}>{f.placeholder || "YYYY-MM-DD"}</div>;
    default:
      return <div className={boxCls}>{f.placeholder || "请输入"}</div>;
  }
}
