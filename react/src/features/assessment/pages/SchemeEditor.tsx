import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Plus, Save, SlidersHorizontal, Wand2, X } from "lucide-react";
import {
  assessmentApi,
  assessmentErrorMessage,
  parseGradeRules,
  parseIndicators,
  parseSettings,
  parseTargets,
  RELATION_LABELS,
  type AssessmentScheme,
  type AssessmentTarget,
  type AssessmentTrack,
  type GradeRules,
  type GradeThreshold,
  type IndicatorNode,
  type SchemeSettings,
} from "../api";
import { useHistory } from "../hooks/useHistory";
import { findNode, isLeafNode, updateNode } from "../treeOps";
import { IndicatorTreeEditor } from "../components/IndicatorTreeEditor";
import { LeafConfigPanel } from "../components/LeafConfigPanel";
import { SubjectObjectsPanel } from "../components/SubjectObjectsPanel";

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

  const tree = useHistory<IndicatorNode[]>(parseIndicators(scheme));
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

  const baseFullScore = settings.baseFullScore ?? 100;
  const selectedNode = selectedCode ? findNode(tree.state, selectedCode) : null;
  const selectedLeaf = selectedNode && isLeafNode(selectedNode) ? selectedNode : null;

  const save = useMutation({
    mutationFn: () =>
      assessmentApi.updateScheme(scheme.id, {
        name: name.trim() || scheme.name,
        year,
        track,
        status,
        indicators: tree.state,
        targets,
        gradeRules: grade,
        settings,
      }),
    onSuccess: () => {
      toast.success("已保存");
      qc.invalidateQueries({ queryKey: ["assessment"] });
    },
    onError: (e) => toast.error(assessmentErrorMessage(e, "保存失败")),
  });

  // AI 生成指标(导入考核办法文件)—— 预留接口,需配 AI 模型
  const fileRef = useRef<HTMLInputElement>(null);
  const aiExtract = useMutation({
    mutationFn: (file: File) => assessmentApi.extractIndicators(file),
    onSuccess: (res) => {
      tree.record();
      tree.setState(res.indicators);
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
          onClick={() => save.mutate()}
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
              <LeafConfigPanel node={selectedLeaf} onChange={patchLeaf} scopeOrgId={settings.scopeOrgId} />
            </>
          ) : selectedNode ? (
            <div className="text-[13px] text-[#475467] space-y-2">
              <div className="font-medium text-[#172033]">分支:{selectedNode.label}</div>
              <p className="text-[#9CA3AF]">
                这是一个分支节点(含子指标)。它的分值应等于其「计权」子项之和。给它加子指标,或在叶子上配置数据源与计分工具。
              </p>
              <p className="text-[#9CA3AF]">特殊块:把 kind 设为「加分项 / 减分项」,该块不计入计权合计。</p>
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
}) {
  const thresholds = grade.thresholds ?? [];
  const setThreshold = (i: number, patch: Partial<GradeThreshold>) =>
    onGrade({ ...grade, thresholds: thresholds.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const addThreshold = () => onGrade({ ...grade, thresholds: [...thresholds, { grade: "", min: 0 }] });
  const delThreshold = (i: number) => onGrade({ ...grade, thresholds: thresholds.filter((_, j) => j !== i) });

  return (
    <div className="space-y-4">
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

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[13px] font-semibold text-[#172033]">定级规则</div>
          <button
            type="button"
            onClick={addThreshold}
            className="flex items-center gap-1 text-[12px] text-[var(--party-primary)] hover:underline"
          >
            <Plus className="w-3.5 h-3.5" /> 加一档
          </button>
        </div>
        <div className="flex gap-1.5 mb-1">
          <span className="flex-1 text-[10px] text-[#9CA3AF]">等级名</span>
          <span className="w-24 text-[10px] text-[#9CA3AF]">总分 ≥</span>
          <span className="w-6" />
        </div>
        {thresholds.map((t, i) => (
          <div key={i} className="flex items-center gap-1.5 mb-1.5">
            <input
              value={t.grade}
              placeholder="优秀"
              onChange={(e) => setThreshold(i, { grade: e.target.value })}
              className={`${INPUT} flex-1 !py-1`}
            />
            <input
              type="number"
              value={t.min}
              onChange={(e) => setThreshold(i, { min: Number(e.target.value) || 0 })}
              className={`${INPUT} w-24 !py-1`}
            />
            <button type="button" onClick={() => delThreshold(i)} className="p-1 rounded text-[#9CA3AF] hover:text-red-600 hover:bg-red-50">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {thresholds.length === 0 && <div className="text-[12px] text-[#9CA3AF]">未设定级阈值(如:优秀≥90、良好≥80、合格≥60)</div>}
      </div>

    </div>
  );
}
