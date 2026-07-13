import { useState } from "react";
import { toast } from "sonner";
import { storageApi } from "@/features/storage";
import { interactiveFileUrl } from "../api";
import {
  newId,
  type Checkpoint,
  type CheckpointEditorProps,
  type CheckpointPlayProps,
  type CheckpointUiDef,
  type QuizQuestion,
} from "./types";

function newQuestion(): QuizQuestion {
  return { id: newId(), text: "", options: ["", ""], correctIdx: 0 };
}

/** 编辑器右栏:多题增删 + 题干/2-6 选项/单选正确项/可选题图(答错时轮换下一题) */
function QuizEditor({ value, onChange, designId }: CheckpointEditorProps) {
  const questions = value.quiz?.questions ?? [];
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const setQuestions = (qs: QuizQuestion[]) => onChange({ ...value, quiz: { questions: qs } });
  const patchQ = (id: string, patch: Partial<QuizQuestion>) =>
    setQuestions(questions.map((q) => (q.id === id ? { ...q, ...patch } : q)));

  const uploadImage = async (q: QuizQuestion, file: File) => {
    setUploadingId(q.id);
    try {
      const meta = await storageApi.upload(file, { ownerModule: "interactive", folder: `design-${designId}` });
      patchQ(q.id, { imageFileId: meta.id });
    } catch {
      toast.error("题图上传失败");
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <div className="space-y-3">
      {questions.map((q, qi) => (
        <div key={q.id} className="rounded-md border border-gray-200 p-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 shrink-0">第 {qi + 1} 题</span>
            <div className="flex-1" />
            <label className="text-xs text-gray-500 cursor-pointer hover:text-[var(--party-primary)]">
              {uploadingId === q.id ? "上传中…" : q.imageFileId ? "换题图" : "+题图"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadImage(q, f);
                  e.target.value = "";
                }}
              />
            </label>
            {q.imageFileId && (
              <button type="button" onClick={() => patchQ(q.id, { imageFileId: undefined })} className="text-xs text-gray-400 hover:text-red-500">
                去图
              </button>
            )}
            <button
              type="button"
              onClick={() => setQuestions(questions.filter((x) => x.id !== q.id))}
              className="text-xs text-gray-400 hover:text-red-500"
            >
              删题
            </button>
          </div>
          <textarea
            value={q.text}
            onChange={(e) => patchQ(q.id, { text: e.target.value })}
            placeholder="题干(必填)"
            maxLength={200}
            rows={2}
            className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
          {q.imageFileId && <img src={interactiveFileUrl(q.imageFileId)} alt="" className="max-h-24 rounded" />}
          <div className="space-y-1">
            {q.options.map((opt, oi) => (
              <div key={oi} className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name={`correct-${q.id}`}
                  checked={q.correctIdx === oi}
                  onChange={() => patchQ(q.id, { correctIdx: oi })}
                  title="设为正确答案"
                />
                <input
                  value={opt}
                  onChange={(e) => patchQ(q.id, { options: q.options.map((o, i) => (i === oi ? e.target.value : o)) })}
                  placeholder={`选项 ${String.fromCharCode(65 + oi)}`}
                  maxLength={80}
                  className={`flex-1 rounded-md border px-2 py-0.5 text-sm ${q.correctIdx === oi ? "border-green-500 bg-green-50" : "border-gray-300"}`}
                />
                {q.options.length > 2 && (
                  <button
                    type="button"
                    onClick={() =>
                      patchQ(q.id, {
                        options: q.options.filter((_, i) => i !== oi),
                        correctIdx: q.correctIdx === oi ? 0 : q.correctIdx > oi ? q.correctIdx - 1 : q.correctIdx,
                      })
                    }
                    className="text-gray-400 hover:text-red-500 text-xs px-1"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          {q.options.length < 6 && (
            <button type="button" onClick={() => patchQ(q.id, { options: [...q.options, ""] })} className="text-xs text-[var(--party-primary)] hover:underline">
              + 加选项
            </button>
          )}
          <div className="text-[11px] text-gray-400">选中的圆点 = 正确答案</div>
        </div>
      ))}
      {questions.length < 20 && (
        <button
          type="button"
          onClick={() => setQuestions([...questions, newQuestion()])}
          className="w-full rounded-md border border-dashed border-gray-300 py-1.5 text-sm text-gray-500 hover:border-[var(--party-primary)] hover:text-[var(--party-primary)]"
        >
          + 添加题目(答错自动换下一题,最多 20 题)
        </button>
      )}
    </div>
  );
}

/** 手机作答卡:题干 + 可选题图 + 选项按钮 */
function QuizPlay({ challenge, submit, disabled }: CheckpointPlayProps) {
  const q = challenge.quiz;
  if (!q) return null;
  return (
    <div className="w-full space-y-3">
      <div className="text-white text-lg font-bold leading-snug">{q.text}</div>
      {q.imageFileId && <img src={interactiveFileUrl(q.imageFileId)} alt="" className="w-full rounded-lg" />}
      <div className="space-y-2">
        {q.options.map((opt, i) => (
          <button
            key={i}
            type="button"
            disabled={disabled}
            onClick={() => submit({ choice: i })}
            className="w-full rounded-xl bg-white/90 px-4 py-3 text-left text-gray-800 font-semibold active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            <span className="text-[var(--party-primary)] font-black mr-2">{String.fromCharCode(65 + i)}</span>
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

export const quizCheckpoint: CheckpointUiDef = {
  kind: "quiz",
  label: "答题关",
  icon: "❓",
  makeDefault(t: number): Checkpoint {
    return { id: newId(), kind: "quiz", t, penaltySteps: 10, quiz: { questions: [newQuestion()] } };
  },
  EditorPanel: QuizEditor,
  Play: QuizPlay,
  validate(cp) {
    // 与后端 normalize 同口径:题干非空 + ≥2 非空选项 + 正确项指向非空选项(否则该题被剔除)
    const all = cp.quiz?.questions ?? [];
    const valid = all.filter(
      (q) => q.text.trim() && q.options.filter((o) => o.trim()).length >= 2 && !!q.options[q.correctIdx]?.trim(),
    );
    if (!valid.length) return "没有有效题目(需题干 + 至少 2 个选项 + 正确答案不指向空选项),保存后该关将被忽略";
    const bad = all.length - valid.length;
    if (bad > 0) return `有 ${bad} 道题不完整(缺题干/选项不足/正确答案指向空选项),保存后这些题将被忽略`;
    return null;
  },
};
