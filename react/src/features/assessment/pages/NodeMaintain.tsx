import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Save } from "lucide-react";
import {
  assessmentApi,
  assessmentErrorMessage,
  parseIndicators,
  parseSettings,
  parseTargets,
  type AssessmentScheme,
  type IndicatorNode,
  type SchemeSettings,
} from "../api";
import { useHistory } from "../hooks/useHistory";
import { findNode, isLeafNode, recomputeWeights, updateNode } from "../treeOps";
import { IndicatorTreeEditor } from "../components/IndicatorTreeEditor";
import { LeafConfigPanel } from "../components/LeafConfigPanel";
import { NodeAdminField } from "../components/UserMultiPicker";

/** 节点管理员「维护本节点子树」:范围限定的指标编辑器(只动自己管的那一块)。 */
export default function NodeMaintain() {
  const { id, code } = useParams<{ id: string; code: string }>();
  const navigate = useNavigate();
  const { data: scheme, isLoading } = useQuery({
    queryKey: ["assessment", "scheme", id],
    queryFn: () => assessmentApi.getScheme(id as string),
    enabled: !!id,
  });

  if (isLoading || !scheme) return <div className="p-12 text-center text-[#9CA3AF]">加载中…</div>;
  const subtree = code ? findNode(recomputeWeights(parseIndicators(scheme)), code) : null;
  if (!subtree) {
    return (
      <div className="p-6 max-w-[900px] mx-auto">
        <button type="button" onClick={() => navigate("/admin/assessment/managed")} className="p-1.5 rounded-md text-[#475467] hover:bg-[#eef2f7]" title="返回">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="mt-6 text-center text-[#9CA3AF]">该节点不存在或已被移除(可能考核表结构有调整)。</div>
      </div>
    );
  }
  return <NodeMaintainInner key={scheme.id + ":" + code} scheme={scheme} nodeCode={code as string} subtree={subtree} />;
}

function NodeMaintainInner({ scheme, nodeCode, subtree }: { scheme: AssessmentScheme; nodeCode: string; subtree: IndicatorNode }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const tree = useHistory<IndicatorNode[]>([subtree]); // 单根树 = 我管的子树
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  // 叶子配置上下文(只读取,不在此页改表级设置):考核对象 + 主体设置(责任人 picker / 报送取数 / 难易系数用)
  const targets = parseTargets(scheme);
  const [settings, setSettings] = useState<SchemeSettings>(() => parseSettings(scheme));
  const [nameMap, setNameMap] = useState<Record<string, string>>(() => scheme.userNames ?? {});
  const rememberNames = (e: Record<string, string>) => setNameMap((m) => ({ ...m, ...e }));

  const selectedNode = selectedCode ? findNode(tree.state, selectedCode) : null;
  const selectedLeaf = selectedNode && isLeafNode(selectedNode) ? selectedNode : null;

  function patchLeaf(patch: Partial<IndicatorNode>) {
    if (!selectedCode) return;
    tree.record();
    tree.setState(updateNode(tree.state, selectedCode, patch));
  }

  const save = useMutation({
    mutationFn: () => assessmentApi.updateSubtree(scheme.id, nodeCode, tree.state[0]),
    onSuccess: () => {
      toast.success("已保存本节点");
      qc.invalidateQueries({ queryKey: ["assessment"] });
    },
    onError: (e) => toast.error(assessmentErrorMessage(e, "保存失败")),
  });

  return (
    <div className="p-4 md:p-6 max-w-[1280px] mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <button type="button" onClick={() => navigate("/admin/assessment/managed")} className="p-1.5 rounded-md text-[#475467] hover:bg-[#eef2f7]" title="返回">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-semibold text-[#172033] truncate">维护:{subtree.label}</div>
          <div className="text-[12px] text-[#6B7280] truncate">
            {scheme.name} · {scheme.year} 年 · 你是本节点的管理员,可维护本节点及其下全部子指标
          </div>
        </div>
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white text-sm font-medium disabled:opacity-60 flex-shrink-0"
          style={{ backgroundColor: "var(--party-primary)" }}
        >
          <Save className="w-4 h-4" /> {save.isPending ? "保存中…" : "保存"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 h-[74vh]">
        <div className="rounded-xl border border-[#eef2f7] bg-white overflow-hidden flex flex-col min-h-0">
          <IndicatorTreeEditor
            nodes={tree.state}
            setNodes={tree.setState}
            record={tree.record}
            selectedCode={selectedCode}
            onSelect={setSelectedCode}
            onUndo={tree.undo}
            onRedo={tree.redo}
            canUndo={tree.canUndo}
            canRedo={tree.canRedo}
            baseFullScore={0}
            scoped
          />
        </div>

        <div className="rounded-xl border border-[#eef2f7] bg-white overflow-auto p-4 min-h-0">
          {selectedLeaf ? (
            <>
              <div className="text-[13px] text-[#9CA3AF] mb-3">
                叶子指标 · <span className="text-[#172033] font-medium">{selectedLeaf.label}</span>(满分 {selectedLeaf.weight || 0})
              </div>
              <LeafConfigPanel
                node={selectedLeaf}
                onChange={patchLeaf}
                scopeOrgId={settings.scopeOrgId}
                targets={targets}
                settings={settings}
                onSettings={(patch) => setSettings((s) => ({ ...s, ...patch }))}
                nameMap={nameMap}
                onResolveNames={rememberNames}
              />
            </>
          ) : selectedNode ? (
            <div className="space-y-4">
              <div className="text-[13px] text-[#475467] space-y-2">
                <div className="font-medium text-[#172033]">分支:{selectedNode.label}</div>
                <p className="text-[#9CA3AF]">含子指标的分支。给它加子指标,或在叶子上配置数据源与计分工具。</p>
              </div>
              <NodeAdminField
                value={selectedNode.adminUserIds}
                onChange={(ids) => patchLeaf({ adminUserIds: ids })}
                nameMap={nameMap}
                onResolveNames={rememberNames}
                hasChildren
              />
            </div>
          ) : (
            <div className="text-[13px] text-[#9CA3AF] py-8 text-center">点左侧指标查看/维护其配置。</div>
          )}
        </div>
      </div>
    </div>
  );
}
