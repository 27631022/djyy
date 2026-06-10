import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  EyeIcon,
  LandmarkIcon,
  PencilRulerIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { hallApi } from "../api";
import type { HallSummary, HallThemePreset } from "../lib/hallTypes";
import { defaultHallState } from "../lib/hallUtils";

const PRESETS: { value: HallThemePreset; label: string; desc: string }[] = [
  { value: "modern_light", label: "现代展馆·浅色", desc: "白墙反光地面,党建红点缀(默认)" },
  { value: "party_red", label: "党建红馆", desc: "红主题墙,金色点缀" },
  { value: "dark_tech", label: "深色科技馆", desc: "深灰蓝,冷光灯带" },
];

/** 展厅库:卡片列表 + 新建 → 进 2D 搭建器布展;发布后 3D 客户端可漫游 */
export default function HallsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPreset, setNewPreset] = useState<HallThemePreset>("modern_light");

  const hallsQuery = useQuery({ queryKey: ["exhibition", "halls"], queryFn: () => hallApi.list() });

  const createMut = useMutation({
    mutationFn: () => {
      const init = defaultHallState(newPreset);
      return hallApi.create({
        name: newName.trim() || "新建展厅",
        meta: init.meta,
        walls: init.walls,
        fixtures: init.fixtures,
        published: false,
      });
    },
    onSuccess: (hall) => {
      qc.invalidateQueries({ queryKey: ["exhibition"] });
      setCreateOpen(false);
      setNewName("");
      toast.success("展厅已创建,开始布展");
      navigate(`/admin/halls/${hall.id}/design`);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "创建失败"),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => hallApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exhibition"] });
      toast.success("已删除");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "删除失败"),
  });

  const halls = hallsQuery.data ?? [];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-[#1A1A1A] flex items-center gap-2">
            <LandmarkIcon className="w-5 h-5 text-[var(--party-primary)]" />
            展厅管理
          </h1>
          <p className="text-sm text-[#6B7280] mt-1">
            2D 画布布展 → 保存 → 3D 虚拟展厅漫游。发布后局域网用户开网址即进。
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium text-white"
          style={{ backgroundColor: "var(--party-primary)" }}
        >
          <PlusIcon className="w-4 h-4" />
          新建展厅
        </button>
      </div>

      {hallsQuery.isLoading ? (
        <div className="py-20 text-center text-sm text-[#9CA3AF]">加载中…</div>
      ) : halls.length === 0 ? (
        <div className="py-20 text-center text-sm text-[#9CA3AF]">还没有展厅,点右上角「新建展厅」开始。</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {halls.map((h) => (
            <HallCard
              key={h.id}
              hall={h}
              onDesign={() => navigate(`/admin/halls/${h.id}/design`)}
              onPreview={() => window.open(`/exhibition/?hall=${h.id}`, "_blank", "noopener")}
              onRemove={() => {
                if (window.confirm(`确定删除展厅「${h.name}」?此操作不可恢复。`)) {
                  removeMut.mutate(h.id);
                }
              }}
            />
          ))}
        </div>
      )}

      {/* 新建对话框 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新建展厅</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <label className="text-xs text-[#6B7280] mb-1 block">展厅名称</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="如:企业文化展厅"
                autoFocus
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#E5E5E5] focus:border-[var(--party-primary)] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-[#6B7280] mb-1.5 block">主题风格(后续可改)</label>
              <div className="space-y-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setNewPreset(p.value)}
                    className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                      newPreset === p.value
                        ? "border-[var(--party-primary)] bg-[var(--party-primary)]/5"
                        : "border-[#E9E9E9] hover:border-[#D4D4D4]"
                    }`}
                  >
                    <span className={newPreset === p.value ? "text-[var(--party-primary)] font-medium" : "text-[#1A1A1A]"}>{p.label}</span>
                    <span className="block text-[11px] text-[#9CA3AF] mt-0.5">{p.desc}</span>
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-[#9CA3AF]">初始为 16×10m 矩形空间,进搭建器后可随意画墙改造。</p>
          </div>
          <DialogFooter>
            <button onClick={() => setCreateOpen(false)} className="px-3 py-1.5 text-sm rounded-lg border border-[#E5E5E5] text-[#6B7280] hover:bg-[#F7F8FA]">
              取消
            </button>
            <button
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending}
              className="px-3.5 py-1.5 text-sm rounded-lg text-white disabled:opacity-60"
              style={{ backgroundColor: "var(--party-primary)" }}
            >
              {createMut.isPending ? "创建中…" : "创建并布展"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HallCard({
  hall,
  onDesign,
  onPreview,
  onRemove,
}: {
  hall: HallSummary;
  onDesign: () => void;
  onPreview: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-[#E9E9E9] overflow-hidden hover:shadow-md transition-shadow">
      <button type="button" onClick={onDesign} className="block w-full aspect-[3/2] bg-[#F5F5F4] relative">
        {hall.thumbnail ? (
          <img src={hall.thumbnail} alt={hall.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#D4D4D4]">
            <LandmarkIcon className="w-10 h-10" />
          </div>
        )}
        <span
          className={`absolute top-2 right-2 text-[11px] px-2 py-0.5 rounded-full ${
            hall.published ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
          }`}
        >
          {hall.published ? "已发布" : "未发布"}
        </span>
      </button>
      <div className="p-3">
        <div className="font-medium text-sm text-[#1A1A1A] truncate">{hall.name}</div>
        <div className="flex items-center gap-1.5 mt-2.5">
          <button
            onClick={onDesign}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium rounded-lg text-white"
            style={{ backgroundColor: "var(--party-primary)" }}
          >
            <PencilRulerIcon className="w-3.5 h-3.5" />
            布展
          </button>
          <button
            onClick={onPreview}
            title="新窗口打开 3D 展厅"
            className="flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded-lg border border-[#E9E9E9] text-[#6B7280] hover:bg-[#F7F8FA]"
          >
            <EyeIcon className="w-3.5 h-3.5" />
            3D
          </button>
          <button
            onClick={onRemove}
            title="删除展厅"
            className="flex items-center justify-center px-2 py-1.5 text-xs rounded-lg border border-[#E9E9E9] text-[#9CA3AF] hover:text-red-500 hover:border-red-200"
          >
            <Trash2Icon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
