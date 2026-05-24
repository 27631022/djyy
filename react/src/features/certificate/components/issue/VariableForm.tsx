import type { VariableField } from "../../lib/designerTypes";

interface VariableFormProps {
  variables: VariableField[];
  /** key → 用户填入的值 */
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  /** 自动填充时由 page 传入,本组件只渲染 */
  autoFilledKeys?: Set<string>;
}

/**
 * 根据模板的 variables 定义,渲染动态表单。
 * 用户填的值会被前端 jspdf 渲染时用,替换证书上的 {{label}} 占位符。
 *
 * 一些约定 key(name/certNo/issueDate)由发证页自动填,这里只显示,但仍允许编辑覆盖:
 *   - name:从 recipient 来
 *   - issueDate:发证当下
 *   - certNo:发证后才知道(发证时占位"待生成",发证后回写)
 */
export function VariableForm({
  variables,
  values,
  onChange,
  autoFilledKeys,
}: VariableFormProps) {
  if (variables.length === 0) {
    return (
      <div className="text-xs text-[#9CA3AF] py-3">
        模板未定义任何变量字段。发证时仅靠模板静态文本。
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {variables.map((v) => {
        const auto = autoFilledKeys?.has(v.key);
        return (
          <label key={v.key} className="block">
            <span className="block text-[10px] font-medium text-[#6B7280] mb-1 flex items-center gap-1">
              {v.label}
              {auto && (
                <span className="text-[9px] px-1 py-px rounded bg-blue-100 text-blue-700 font-normal">
                  自动
                </span>
              )}
            </span>
            <input
              type="text"
              value={values[v.key] ?? ""}
              onChange={(e) => onChange(v.key, e.target.value)}
              placeholder={v.sampleValue}
              className="w-full px-2 py-1.5 text-xs rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none"
            />
          </label>
        );
      })}
    </div>
  );
}
