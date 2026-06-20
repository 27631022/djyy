import { useNavigate } from "react-router-dom";
import { FileTextIcon, FileStackIcon, ArrowRightIcon, CheckIcon } from "lucide-react";

/**
 * 发布报送 —— 统一入口,两个按钮切「单次 / 多次」。
 * 单次 = 现有任务系统(一对象一回执);多次 = 报送系统(一对象多发票,master-detail)。
 * 后端两套各司其职,前端在此收口,客户感知为一套。
 */
const OPTIONS = [
  {
    key: "single",
    title: "单次报送",
    icon: FileTextIcon,
    to: "/admin/tasks/new",
    desc: "一个单位填报一次即完成。",
    cases: ["数据 / 统计上报", "台账、名册报送", "一次性填表"],
    accent: "#1A6BC8",
    soft: "#EAF2FC",
  },
  {
    key: "multi",
    title: "多次报送",
    icon: FileStackIcon,
    to: "/admin/reports/new",
    desc: "一个单位可多次提交,每次一张「单据 + 明细子表」,点选清单自动带出。",
    cases: ["消费帮扶 / 采买发票录入", "逐笔 / 逐张记录的报送", "需要明细子表、附件逐单管理"],
    accent: "var(--party-primary)",
    soft: "var(--party-soft, #FBEAEC)",
  },
] as const;

export default function PublishChooser() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-4xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-[var(--party-primary)]">发布报送</h1>
        <p className="mt-1 text-sm text-gray-500">先选报送类型:单位只填一次选「单次」;需要逐张单据 / 逐笔多次提交选「多次」。</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {OPTIONS.map((o) => {
          const Icon = o.icon;
          return (
            <button
              key={o.key}
              onClick={() => navigate(o.to)}
              className="group flex flex-col rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-[var(--party-primary)] hover:shadow-md"
            >
              <div className="mb-3 flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ backgroundColor: o.soft, color: o.accent }}>
                  <Icon className="h-6 w-6" />
                </span>
                <span className="text-lg font-semibold text-gray-800">{o.title}</span>
              </div>
              <p className="mb-3 text-sm text-gray-600">{o.desc}</p>
              <ul className="mb-4 space-y-1">
                {o.cases.map((c) => (
                  <li key={c} className="flex items-center gap-1.5 text-xs text-gray-500">
                    <CheckIcon className="h-3.5 w-3.5 flex-shrink-0" style={{ color: o.accent }} />
                    {c}
                  </li>
                ))}
              </ul>
              <span
                className="mt-auto inline-flex items-center gap-1 text-sm font-medium"
                style={{ color: o.accent }}
              >
                去发布
                <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-5 text-xs text-gray-400">
        两种报送的「我的待办」「催办、审核」是同一套;选错了也可以重新发布,互不影响。
      </p>
    </div>
  );
}
