import { useQuery } from "@tanstack/react-query";
import { AwardIcon, ImageOffIcon, AlertTriangleIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { certificateTemplateApi, type CertificateTemplateDto } from "../../api";

interface TemplatePickerProps {
  selectedId: string | null;
  onChange: (template: CertificateTemplateDto | null) => void;
}

/**
 * 发证第一步:选模板。
 *
 * 规则:
 *   - 只列 active 模板
 *   - 没填 honorCode 的模板灰显并禁用,提示去模板编辑页补填
 *     (因为没有 honorCode 就拼不出证书编号)
 */
export function TemplatePicker({ selectedId, onChange }: TemplatePickerProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["certificate-templates", { active: true }],
    queryFn: () => certificateTemplateApi.list(true),
  });

  const templates = data ?? [];

  if (isLoading) {
    return <div className="text-xs text-[#9CA3AF] py-6">加载模板中…</div>;
  }

  if (templates.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[#E9E9E9] p-6 text-center">
        <AwardIcon className="w-8 h-8 mx-auto text-[#9CA3AF] mb-2" />
        <p className="text-sm text-[#6B7280]">还没有可用模板</p>
        <Link
          to="/admin/certificate-templates"
          className="inline-block mt-2 text-xs text-[var(--party-primary)] hover:underline"
        >
          去创建模板 →
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {templates.map((t) => {
        const usable = Boolean(t.honorCode && t.honorCode.trim());
        const active = t.id === selectedId;
        return (
          <button
            key={t.id}
            type="button"
            disabled={!usable}
            onClick={() => onChange(active ? null : t)}
            className={`relative text-left rounded-lg overflow-hidden border-2 transition-all ${
              active
                ? "border-[var(--party-primary)] shadow-md"
                : usable
                ? "border-[#E9E9E9] hover:border-[var(--party-primary)] hover:shadow"
                : "border-[#F0F0F0] opacity-60 cursor-not-allowed"
            }`}
          >
            {/* 缩略图 */}
            <div
              className="relative bg-gradient-to-br from-[#F4F5F8] to-[#E9EBF0] overflow-hidden"
              style={{ aspectRatio: "4 / 3" }}
            >
              {t.thumbnail ? (
                <div className="absolute inset-0 flex items-center justify-center p-3">
                  <img
                    src={t.thumbnail}
                    alt={t.name}
                    className="max-w-full max-h-full object-contain bg-white shadow-sm"
                    style={{ aspectRatio: `${t.width} / ${t.height}` }}
                  />
                </div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-[#B5B9C0] gap-1">
                  <ImageOffIcon className="w-6 h-6" />
                  <span className="text-[10px]">暂无预览</span>
                </div>
              )}
              {usable && (
                <span
                  className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[var(--party-primary)] text-white"
                  title="荣誉首字母代码"
                >
                  {t.honorCode}
                </span>
              )}
              {!usable && (
                <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 flex items-center gap-1">
                  <AlertTriangleIcon className="w-3 h-3" />
                  缺 honorCode
                </span>
              )}
            </div>
            {/* 名称 */}
            <div className="px-2.5 py-2">
              <div className="text-xs font-medium text-[#1A1A1A] truncate" title={t.name}>
                {t.name}
              </div>
              {t.category && (
                <div className="text-[10px] text-[#9CA3AF] mt-0.5">{t.category}</div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
