import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Save, SlidersHorizontal, Wand2 } from "lucide-react";
import {
  assessmentApi,
  assessmentErrorMessage,
  parseGradeRules,
  parseIndicators,
  parseSettings,
  parseTargets,
  scoredChangeConflict,
  RELATION_LABELS,
  type AssessmentScheme,
  type AssessmentTarget,
  type AssessmentTrack,
  type GradeRules,
  type IndicatorNode,
  type SchemeSettings,
} from "../api";
import { useHistory } from "../hooks/useHistory";
import { findNode, isLeafNode, recodeTree, recomputeWeights, updateNode } from "../treeOps";
import { IndicatorTreeEditor } from "../components/IndicatorTreeEditor";
import { LeafConfigPanel } from "../components/LeafConfigPanel";
import { SubjectObjectsPanel } from "../components/SubjectObjectsPanel";
import { GradeRulesEditor } from "../components/GradeRulesEditor";
import { UserMultiPicker, NodeAdminField } from "../components/UserMultiPicker";

const INPUT =
  "px-2.5 py-1.5 text-sm border border-[#dce4ef] rounded-md bg-white focus:outline-none focus:border-[var(--party-primary)]";

export default function SchemeEditor() {
  const { id } = useParams<{ id: string }>();
  const { data: scheme, isLoading } = useQuery({
    queryKey: ["assessment", "scheme", id],
    queryFn: () => assessmentApi.getScheme(id as string),
    enabled: !!id,
  });

  if (isLoading || !scheme) {
    return <div className="p-12 text-center text-[#9CA3AF]">加载中…</div>;
  }
  return <SchemeEditorInner key={scheme.id} scheme={scheme} />;
}

function SchemeEditorInner({ scheme }: { scheme: AssessmentScheme }) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  // 载入即按规则重算分值:计权/加分块「下层累加」自动滚上来(老数据里加分块可能存的是手填值)
  const tree = useHistory<IndicatorNode[]>(recomputeWeights(parseIndicators(scheme)));
  const [name, setName] = useState(scheme.name);
  const [year, setYear] = useState(scheme.year);
  const [status, setStatus] = useState(scheme.status);
  const [grade, setGrade] = useState<GradeRules>(() => parseGradeRules(scheme));
  const [targets, setTargets] = useState<AssessmentTarget[]>(() => parseTargets(scheme));
  const [settings, setSettings] = useState<SchemeSettings>(() => {
    const s = parseSettings(scheme);
    return { baseFullScore: s.baseFullScore ?? 100, ...s };
  });
  const [track, setTrack] = useState<AssessmentTrack>(scheme.track);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  // 人员 id→姓名 映射(总管理员/协同人/节点管理员展示;选人时回灌新姓名)
  const [nameMap, setNameMap] = useState<Record<string, string>>(() => scheme.userNames ?? {});
  const rememberNames = (e: Record<string, string>) => setNameMap((m) => ({ ...m, ...e }));

  const baseFullScore = settings.baseFullScore ?? 100;
  const selectedNode = selectedCode ? findNode(tree.state, selectedCode) : null;
  const selectedLeaf = selectedNode && isLeafNode(selectedNode) ? selectedNode : null;

  const save = useMutation({
    mutationFn: (confirmDataLoss: boolean) =>
      assessmentApi.updateScheme(scheme.id, {
        name: name.trim() || scheme.name,
        year,
        track,
        status,
        indicators: tree.state,
        targets,
        gradeRules: grade,
        settings,
        confirmDataLoss,
      }),
    onSuccess: () => {
      toast.success("已保存");
      qc.invalidateQueries({ queryKey: ["assessment"] });
    },
    onError: (e) => {
      // B6 防丢分:删/换工具的指标已有录入 → 后端 409 带明细,弹确认后带 confirmDataLoss 重试
      const conflict = scoredChangeConflict(e);
      if (conflict) {
        if (
          window.confirm(
            `以下指标已有录入数据:\n${conflict}。\n\n确认保存将同时删除这些指标的已录入(相关单位需重新录入)。确定继续吗?`,
          )
        ) {
          save.mutate(true);
        }
        return;
      }
      toast.error(assessmentErrorMessage(e, "保存失败"));
    },
  });

  // AI 生成指标(导入考核办法文件)—— 预留接口,需配 AI 模型
  const fileRef = useRef<HTMLInputElement>(null);
  const aiExtract = useMutation({
    mutationFn: (file: File) => assessmentApi.extractIndicators(file),
    onSuccess: (res) => {
      tree.record();
      // 重发全局唯一 code:AI 每次生成都是 n1、n2…,两次生成互相撞 code,已有录入会错套在新指标上
      tree.setState(recodeTree(res.indicators));
      setSelectedCode(null);
      toast.success(`AI 已生成 ${res.source.leafCount} 项末端指标,请核对分值与计分工具后保存`);
    },
    onError: (e) => toast.error(assessmentErrorMessage(e, "AI 生成指标失败")),
  });

  function patchLeaf(patch: Partial<IndicatorNode>) {
    if (!selectedCode) return;
    tree.record();
    tree.setState(updateNode(tree.state, selectedCode, patch));
  }

  return (
    <div className="p-4 md:p-6 max-w-[1280px] mx-auto">
      {/* 头部 */}
      <div className="flex items-center gap-3 mb-4">
        <button
          type="button"
          onClick={() => navigate("/admin/assessment/schemes")}
          className="p-1.5 rounded-md text-[#475467] hover:bg-[#eef2f7]"
          title="返回列表"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="text-lg font-semibold text-[#172033] bg-transparent border-b border-transparent focus:border-[var(--party-primary)] focus:outline-none px-1 flex-1 min-w-0"
        />
        <span className="px-2 py-0.5 rounded-full text-[12px] bg-party-soft text-[var(--party-primary)] font-medium flex-shrink-0">
          {settings.relationKey ? (RELATION_LABELS[settings.relationKey] ?? "考核关系") : "未设考核主体"}
          {settings.subjectName ? ` · ${settings.subjectName}` : ""}
        </span>
        <span className="px-2 py-0.5 rounded-full text-[12px] bg-[#f1f5f9] text-[#475467] flex-shrink-0" title="考核对象数(快照)">
          考核对象 {targets.length}
        </span>
        <input
          type="number"
          value={year}
          onChange={(e) => setYear(Number(e.target.value) || year)}
          className={`${INPUT} w-24 flex-shrink-0`}
          title="考核年份"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${INPUT} flex-shrink-0`} title="状态">
          <option value="draft">草稿</option>
          <option value="active">启用</option>
          <option value="archived">归档</option>
        </select>
        <input
          ref={fileRef}
          type="file"
          accept=".docx,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) aiExtract.mutate(f);
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={aiExtract.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-[var(--party-primary)] text-[var(--party-primary)] bg-white hover:bg-party-soft disabled:opacity-60 flex-shrink-0"
          title="上传考核办法 Word/PDF,AI 自动生成指标树并配好数据源/计分工具(预留接口,需配 AI 模型)"
        >
          <Wand2 className="w-4 h-4" /> {aiExtract.isPending ? "AI 解析中…" : "AI 生成指标"}
        </button>
        <button
          type="button"
          onClick={() => save.mutate(false)}
          disabled={save.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white text-sm font-medium disabled:opacity-60 flex-shrink-0"
          style={{ backgroundColor: "var(--party-primary)" }}
        >
          <Save className="w-4 h-4" /> {save.isPending ? "保存中…" : "保存"}
        </button>
      </div>

      {/* 主体:左树 / 右配置 */}
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
            baseFullScore={baseFullScore}
          />
        </div>

        <div className="rounded-xl border border-[#eef2f7] bg-white overflow-auto p-4 min-h-0">
          <button
            type="button"
            onClick={() => setSelectedCode(null)}
            className={`mb-3 w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[13px] font-medium transition-colors ${
              selectedCode
                ? "text-[#475467] bg-[#f1f5f9] hover:bg-[#e6ebf2]"
                : "text-[var(--party-primary)] bg-party-soft"
            }`}
            title="考核主体 / 考核对象 / 基础满分 / 定级规则(点指标树空白处也可返回)"
          >
            <SlidersHorizontal className="w-4 h-4" /> 考核表设置(主体 / 对象 / 定级)
          </button>
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
                <p className="text-[#9CA3AF]">
                  这是一个分支节点(含子指标)。它的分值应等于其「计权」子项之和。给它加子指标,或在叶子上配置数据源与计分工具。
                </p>
                <p className="text-[#9CA3AF]">特殊块:把 kind 设为「加分项 / 减分项」,该块不计入计权合计。</p>
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
            <SettingsPanel
              settings={settings}
              onSubject={(p) => {
                setTrack(p.track);
                setSettings((s) => ({
                  ...s,
                  relationKey: p.relationKey,
                  subjectOrgId: p.subjectOrgId || undefined,
                  subjectName: p.subjectName || undefined,
                  scopeOrgId: p.deptScopeOrgId,
                }));
              }}
              targets={targets}
              onTargets={setTargets}
              baseFullScore={baseFullScore}
              onBaseFullScore={(v) => setSettings((s) => ({ ...s, baseFullScore: v }))}
              grade={grade}
              onGrade={setGrade}
              createdByName={scheme.createdByName ?? null}
              managerUserIds={settings.managerUserIds ?? []}
              onManagers={(ids) => setSettings((s) => ({ ...s, managerUserIds: ids.length ? ids : undefined }))}
              nameMap={nameMap}
              onResolveNames={rememberNames}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SettingsPanel({
  settings,
  onSubject,
  targets,
  onTargets,
  baseFullScore,
  onBaseFullScore,
  grade,
  onGrade,
  createdByName,
  managerUserIds,
  onManagers,
  nameMap,
  onResolveNames,
}: {
  settings: SchemeSettings;
  onSubject: (p: {
    relationKey: string;
    subjectOrgId: string;
    subjectName: string;
    deptScopeOrgId?: string;
    track: AssessmentTrack;
  }) => void;
  targets: AssessmentTarget[];
  onTargets: (v: AssessmentTarget[]) => void;
  baseFullScore: number;
  onBaseFullScore: (v: number) => void;
  grade: GradeRules;
  onGrade: (g: GradeRules) => void;
  createdByName: string | null;
  managerUserIds: string[];
  onManagers: (ids: string[]) => void;
  nameMap: Record<string, string>;
  onResolveNames: (entries: Record<string, string>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[#eef2f7] bg-[#FBFBFC] p-3 space-y-2.5">
        <div className="text-[13px] font-semibold text-[#172033]">维护人员</div>
        <div className="text-[12px] text-[#475467]">
          总管理员:<span className="font-medium text-[#172033]">{createdByName || "—"}</span>
          <span className="text-[#9CA3AF]">(新建者,可配置全部指标)</span>
        </div>
        <div>
          <div className="text-[12px] text-[#475467] mb-1.5">协同维护人(与总管理员一起维护本表)</div>
          <UserMultiPicker
            value={managerUserIds}
            onChange={onManagers}
            nameMap={nameMap}
            onResolveNames={onResolveNames}
            placeholder="搜索姓名 / 员工编号 添加协同维护人…"
          />
        </div>
      </div>

      <SubjectObjectsPanel
        relationKey={settings.relationKey}
        subjectOrgId={settings.subjectOrgId}
        onSubject={onSubject}
        targets={targets}
        onTargets={onTargets}
      />

      <label className="block">
        <div className="text-[13px] font-semibold text-[#172033] mb-1">基础满分</div>
        <input
          type="number"
          value={baseFullScore}
          onChange={(e) => onBaseFullScore(Number(e.target.value) || 0)}
          className={`${INPUT} w-32`}
        />
        <div className="text-[11px] text-[#9CA3AF] mt-1">顶层「计权」指标分值之和应等于此值(默认 100)</div>
      </label>

      <GradeRulesEditor grade={grade} onGrade={onGrade} relationKey={settings.relationKey} />
    </div>
  );
}
