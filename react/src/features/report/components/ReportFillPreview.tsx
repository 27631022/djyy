import { useState } from "react";
import {
  EyeIcon,
  SparklesIcon,
  RotateCcwIcon,
  ClockIcon,
  Building2Icon,
  PhoneIcon,
  CheckCircle2Icon,
} from "lucide-react";
import type { ReportField } from "../api";
import { getFieldType } from "../fields";

/**
 * 填报预览 —— 设计字段时,按当前字段定义渲染「基层单位录入时看到的真实表单」。
 * 用的就是各字段类型注册表里的 FillInput(与 ReportFill 录入页同一套控件),
 * 本地 throwaway 状态,可试填感受真实状态;不落库、不影响发布。
 */
export function ReportFillPreview({
  fields,
  title,
  notes,
  dueAt,
}: {
  fields: ReportField[];
  title?: string;
  notes?: string;
  dueAt?: string;
}) {
  const sorted = [...fields].sort((a, b) => a.sortOrder - b.sortOrder);
  // key 用于「清空重填」整体重挂载(各控件按 useState 初始化器起步)
  const [resetKey, setResetKey] = useState(0);
  const [formData, setFormData] = useState<Record<string, unknown>>({});

  function reset() {
    setFormData({});
    setResetKey((k) => k + 1);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-[#dce4ef] bg-[#F7F8FA]">
      <div className="flex items-center gap-2 border-b border-[#e6eefb] bg-party-soft/50 px-4 py-2 text-[13px] text-[var(--party-primary)]">
        <EyeIcon className="h-4 w-4" />
        <span className="font-medium">填报预览</span>
        <span className="text-[12px] text-gray-500">这是基层单位录入时看到的表单,可试填感受;内容不会保存</span>
        <button
          type="button"
          onClick={reset}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[12px] text-gray-500 hover:text-gray-700"
        >
          <RotateCcwIcon className="h-3.5 w-3.5" />
          清空重填
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-2xl space-y-4">
          {/* 任务头(模拟基层录入页) */}
          <header className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <h1 className="text-lg font-semibold text-gray-800">{title?.trim() || "(未命名报送任务)"}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1">
                <Building2Icon className="h-3.5 w-3.5" />
                示例基层单位
              </span>
              {dueAt && (
                <span className="inline-flex items-center gap-1">
                  <ClockIcon className="h-3.5 w-3.5" />
                  截止 {dueAt.replace("T", " ").slice(0, 16)}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                派发:示例派发部门
                <span className="inline-flex items-center gap-0.5 text-[#1A6BC8]">
                  <PhoneIcon className="h-3 w-3" />
                  示例电话
                </span>
              </span>
            </div>
            {notes?.trim() && (
              <p className="mt-2 whitespace-pre-wrap rounded-md bg-gray-50 p-2 text-sm text-gray-600">{notes}</p>
            )}
          </header>

          {/* 录入一张发票 */}
          <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-gray-800">录入一张发票</h2>
            {sorted.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 py-10 text-center text-sm text-gray-400">
                还没有字段。切到「设计字段」从左侧点选添加,或「用扶贫采买模板」。
              </div>
            ) : (
              <div key={resetKey} className="space-y-4">
                {sorted.map((f) => (
                  <PreviewField
                    key={f.code}
                    field={f}
                    value={formData[f.code]}
                    onChange={(v) => setFormData((p) => ({ ...p, [f.code]: v }))}
                  />
                ))}
              </div>
            )}
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                disabled
                title="预览模式不提交"
                className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg bg-[var(--party-primary)] px-5 py-2 text-sm text-white opacity-50"
              >
                <CheckCircle2Icon className="h-4 w-4" />
                提交本张发票(预览)
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function PreviewField({
  field,
  value,
  onChange,
}: {
  field: ReportField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const Def = getFieldType(field.type);
  return (
    <div>
      <div className="mb-1.5 text-sm font-medium text-gray-700">
        {field.label}
        {field.required && <span className="text-red-500"> *</span>}
        {field.description && <span className="ml-2 text-xs font-normal text-gray-400">{field.description}</span>}
      </div>
      {Def.FillInput ? (
        <Def.FillInput field={field} value={value} onChange={onChange} />
      ) : (
        <div className="text-xs text-gray-400">(该字段类型暂不支持填报)</div>
      )}
      {field.aiExtract && (
        <div className="mt-2">
          <button
            type="button"
            disabled
            title="发布后,基层上传发票即可一键识别"
            className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md border border-[var(--party-primary)] bg-party-soft px-3 py-1.5 text-[13px] font-medium text-[var(--party-primary)] opacity-60"
          >
            <SparklesIcon className="h-4 w-4" />
            AI 识别发票并自动填写(基层填报时可用)
          </button>
        </div>
      )}
    </div>
  );
}
