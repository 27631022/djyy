import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2Icon,
  ChevronLeftIcon,
  FileTextIcon,
  GitBranchIcon,
  Loader2Icon,
  PaperclipIcon,
  SaveIcon,
  SendIcon,
  Trash2Icon,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import { useAuth } from "@/stores/auth";
import {
  knowledgeApi,
  knowledgeErrMsg,
  type ArticleAttachment,
  type ArticleDetail,
} from "../api";
import { MdEditor } from "../components/MdEditor";
import { CategoryPicker } from "../components/CategoryPicker";
import { TagsInput } from "../components/TagsInput";
import { VersionLinkPicker, type RevisionTarget } from "../components/VersionLinkPicker";

/** 外壳:编辑已有文章时取数 → key 重挂载内层;新建直接进内层 */
export default function KnowledgeEditorPage() {
  const { id } = useParams();
  const detail = useQuery({
    queryKey: ["knowledge", "edit", id],
    queryFn: () => knowledgeApi.getArticle(id!),
    enabled: !!id,
  });

  if (id) {
    if (detail.isLoading) {
      return <div className="min-h-screen flex items-center justify-center text-sm text-gray-400">加载中…</div>;
    }
    if (!detail.data) {
      return (
        <div className="min-h-screen flex items-center justify-center text-sm text-gray-400">
          文章不存在或无权编辑
        </div>
      );
    }
    return <EditorInner key={detail.data.id} article={detail.data} />;
  }
  return <EditorInner key="new" article={null} />;
}

function EditorInner({ article }: { article: ArticleDetail | null }) {
  const navigate = useNavigate();
  const { me } = useAuth();

  const [title, setTitle] = useState(article?.title ?? "");
  const [categoryId, setCategoryId] = useState(article?.categoryId ?? "");
  const [typeCode, setTypeCode] = useState(article?.typeCode ?? "");
  const [contentMd, setContentMd] = useState(article?.contentMd ?? "");
  const [summary, setSummary] = useState(article?.summary ?? "");
  const [tags, setTags] = useState<string[]>(article?.tags ?? []);
  const [versionLabel, setVersionLabel] = useState(article?.versionLabel ?? "");
  const [revisionOf, setRevisionOf] = useState<RevisionTarget | null>(null);
  const [attachments, setAttachments] = useState<ArticleAttachment[]>(article?.attachments ?? []);
  const [uploadingAtt, setUploadingAtt] = useState(false);
  // 已落库的文章 id:新建首次保存后置为服务器返回的 id。之后 save/submit 都走 update,
  // 且**不再 navigate 触发外壳重挂载** —— 避免丢失编辑中的输入、避免重试重复建文、避免读到陈旧缓存。
  const [articleId, setArticleId] = useState<string | null>(article?.id ?? null);
  const [savedAt, setSavedAt] = useState<string | null>(article?.updatedAt ?? null);
  const status = article?.status ?? "draft"; // 编辑期间状态不变(保存不改状态)

  const types = useQuery({ queryKey: ["knowledge", "types"], queryFn: knowledgeApi.listTypes });
  const canManage = !!me?.isPlatformAdmin || (me?.permissions ?? []).includes("knowledge:manage");
  const selectedType = (types.data ?? []).find((t) => t.code === typeCode);
  const inVersionChain = !!article?.versionGroupId || !!revisionOf;
  // 已发布/待审核 → 编辑即「保存」直接生效(不再走提交,避免「仅草稿或被驳回可提交」报错);
  // 新建/草稿/被驳回 → 「保存草稿 + 提交」两步。
  const liveEdit = status === "published" || status === "pending";

  function payload() {
    return {
      title: title.trim(),
      categoryId,
      typeCode,
      contentMd,
      summary: summary.trim() || undefined,
      tags,
      versionLabel: versionLabel.trim() || undefined,
    };
  }

  function validate(): string | null {
    if (!title.trim()) return "请填写标题";
    if (!categoryId) return "请选择领域分类";
    if (!typeCode) return "请选择内容类型";
    return null;
  }

  /** 保存并返回落库 id(articleId 有值走 update,否则 create 并记住 id;幂等,重试不重复建文) */
  async function persist(): Promise<string> {
    if (articleId) {
      const a = await knowledgeApi.updateArticle(articleId, payload());
      return a.id;
    }
    const a = await knowledgeApi.createArticle({ ...payload(), revisionOfId: revisionOf?.id });
    setArticleId(a.id);
    // 更新地址栏为编辑该文章的 URL,但不经 router navigate(不重挂载、不丢输入)
    window.history.replaceState(null, "", `/knowledge/edit/${a.id}`);
    return a.id;
  }

  const save = useMutation({
    mutationFn: persist,
    onSuccess: () => {
      toast.success(liveEdit ? "已保存" : "草稿已保存");
      setSavedAt(new Date().toISOString());
      lastSavedSigRef.current = sig();
    },
    onError: (e) => toast.error(knowledgeErrMsg(e, "保存失败")),
  });

  /* ─── 实时自动保存(已落库后:articleId 存在)——防抖 1.5s,内容变了且校验通过就静默 update(不弹 toast)─── */
  const lastSavedSigRef = useRef<string>("");
  const [autoSaving, setAutoSaving] = useState(false);
  function sig() {
    return JSON.stringify(payload());
  }
  useEffect(() => {
    if (!articleId) return; // 新建未保存不自动建文(避免手一抖就产出草稿);首存后开始自动保存
    if (validate() !== null) return;
    const current = sig();
    if (current === lastSavedSigRef.current) return;
    const t = setTimeout(() => {
      setAutoSaving(true);
      persist()
        .then(() => {
          lastSavedSigRef.current = current;
          setSavedAt(new Date().toISOString());
        })
        .catch(() => {})
        .finally(() => setAutoSaving(false));
    }, 1500);
    return () => clearTimeout(t);
    // 防抖自动保存:只需监听表单字段变化重排定时器;validate/sig/persist 是稳定读取当下 state 的闭包,
    // 不放进 deps(否则每渲染重建函数会误触发);这是「表单变化→防抖副作用」的合法用法。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId, title, categoryId, typeCode, contentMd, summary, tags, versionLabel]);

  const submit = useMutation({
    mutationFn: async () => {
      const id = await persist(); // 先保存(幂等)再提交
      return knowledgeApi.submitArticle(id);
    },
    onSuccess: (a) => {
      if (a.status === "published") {
        toast.success("已发布");
        navigate(`/knowledge/articles/${a.id}`, { replace: true });
      } else {
        toast.success("已提交,等待管理员审核");
        navigate("/knowledge/mine", { replace: true });
      }
    },
    onError: (e) => toast.error(knowledgeErrMsg(e, "提交失败")),
  });

  function onSubmit() {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    if (!contentMd.trim()) {
      toast.error("正文为空,不能提交");
      return;
    }
    const needReview = (selectedType?.requireReview ?? false) && !canManage;
    const lines = [
      needReview ? "该类型需管理员审核,提交后待审核通过才会公开。" : "提交后将立即发布。",
      ...(inVersionChain ? ["同一制度的旧版本将自动归档(仍可在新版详情页「历史版本」查看)。"] : []),
      "确认提交?",
    ];
    if (window.confirm(lines.join("\n"))) submit.mutate();
  }

  async function uploadAttachments(files: File[]) {
    if (!articleId) return;
    setUploadingAtt(true);
    try {
      for (const f of files) {
        const up = await knowledgeApi.uploadResource(articleId, f);
        // 展示名用原始文件名(友好下载名);storage 落盘名是规范的「标题-序号」
        const att = await knowledgeApi.addAttachment(articleId, { fileId: up.fileId, name: f.name });
        setAttachments((cur) => [...cur, att]);
      }
      toast.success("附件已添加");
    } catch (e) {
      toast.error(knowledgeErrMsg(e, "附件上传失败"));
    } finally {
      setUploadingAtt(false);
    }
  }

  async function removeAttachment(att: ArticleAttachment) {
    try {
      await knowledgeApi.removeAttachment(att.id);
      setAttachments((cur) => cur.filter((x) => x.id !== att.id));
    } catch (e) {
      toast.error(knowledgeErrMsg(e, "删除附件失败"));
    }
  }

  const busy = save.isPending || submit.isPending;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FBF7F2] via-[#FDFCFA] to-white pb-24">
      <header className="sticky top-0 z-20 bg-white/85 backdrop-blur border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(articleId ? "/knowledge/mine" : "/knowledge")}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-[var(--party-primary)]"
          >
            <ChevronLeftIcon className="w-4 h-4" /> 返回
          </button>
          <div className="font-bold text-gray-900">{article ? "编辑知识" : "发布知识"}</div>
          {/* 自动保存指示 */}
          {autoSaving ? (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Loader2Icon className="w-3 h-3 animate-spin" /> 自动保存中…
            </span>
          ) : savedAt ? (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <CheckCircle2Icon className="w-3 h-3 text-emerald-500" /> 已保存 {new Date(savedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            {liveEdit ? (
              // 已发布/待审核:编辑即保存直接生效(无「提交」这一步)
              <Button
                size="sm"
                className="bg-[var(--party-primary)] hover:opacity-90 text-white"
                disabled={busy}
                onClick={() => {
                  const err = validate();
                  if (err) { toast.error(err); return; }
                  save.mutate();
                }}
              >
                {save.isPending ? <Loader2Icon className="w-4 h-4 mr-1 animate-spin" /> : <SaveIcon className="w-4 h-4 mr-1" />}
                保存
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => {
                  const err = validate();
                  if (err) { toast.error(err); return; }
                  save.mutate();
                }}>
                  {save.isPending ? <Loader2Icon className="w-4 h-4 mr-1 animate-spin" /> : <SaveIcon className="w-4 h-4 mr-1" />}
                  保存草稿
                </Button>
                <Button
                  size="sm"
                  className="bg-[var(--party-primary)] hover:opacity-90 text-white"
                  disabled={busy}
                  onClick={onSubmit}
                >
                  {submit.isPending ? <Loader2Icon className="w-4 h-4 mr-1 animate-spin" /> : <SendIcon className="w-4 h-4 mr-1" />}
                  提交
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 pt-6 space-y-4">
        {/* 基本信息 */}
        <div className="rounded-xl border border-gray-100 bg-white/90 shadow-sm p-5 space-y-4">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="标题,如:XX 公司安全生产管理制度"
            className="h-11 text-lg font-medium border-0 border-b border-gray-100 rounded-none shadow-none focus-visible:ring-0 px-1"
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <div className="text-xs text-gray-400 mb-1">领域分类 *</div>
              <CategoryPicker value={categoryId} onChange={setCategoryId} />
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">内容类型 *</div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {(types.data ?? []).map((t) => (
                  <button
                    key={t.code}
                    type="button"
                    onClick={() => setTypeCode(t.code)}
                    className={`px-3 py-1.5 rounded-lg text-[13px] border transition-colors ${
                      typeCode === t.code
                        ? "border-[var(--party-primary)] bg-party-soft text-[var(--party-primary)] font-medium"
                        : "border-gray-200 text-gray-500 hover:border-gray-300"
                    }`}
                  >
                    {t.name}
                    {t.requireReview && <span className="ml-0.5 text-[10px] text-amber-500">审</span>}
                  </button>
                ))}
              </div>
              {selectedType?.requireReview && !canManage && (
                <div className="mt-1 text-[11px] text-amber-600">该类型提交后需管理员审核</div>
              )}
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">标签(可选,回车添加)</div>
              <TagsInput value={tags} onChange={setTags} />
            </div>
          </div>

          {/* 版本链 */}
          <div className="flex items-center gap-3 flex-wrap">
            {article?.versionGroupId ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
                <GitBranchIcon className="w-3.5 h-3.5" />
                本文属于一个版本链,发布时同链旧版将自动归档
              </span>
            ) : !article ? (
              <VersionLinkPicker value={revisionOf} onChange={setRevisionOf} />
            ) : null}
            {inVersionChain && (
              <Input
                value={versionLabel}
                onChange={(e) => setVersionLabel(e.target.value)}
                placeholder="版本说明,如:2026年修订"
                className="w-56 h-8 text-sm"
              />
            )}
          </div>
        </div>

        {/* 导读(可选,P4 可 AI 生成) */}
        <div className="rounded-xl border border-gray-100 bg-white/90 shadow-sm p-5">
          <div className="text-xs text-gray-400 mb-1.5">导读(可选 —— 一段话让读者快速了解本文;后续版本支持 AI 生成)</div>
          <Textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={2}
            placeholder="例:本制度适用于全体在岗员工,明确了……"
            className="text-sm"
          />
        </div>

        {/* 正文 */}
        <MdEditor
          value={contentMd}
          onChange={setContentMd}
          uploadFile={articleId ? (f) => knowledgeApi.uploadResource(articleId, f) : undefined}
        />

        {/* 附件 */}
        <div className="rounded-xl border border-gray-100 bg-white/90 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <PaperclipIcon className="w-4 h-4 text-[var(--party-primary)]" />
            <span className="font-medium text-sm text-gray-800">附件与模板下载</span>
            {articleId ? (
              <label className="ml-auto">
                <span
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-[13px] text-gray-600 hover:border-gray-300 cursor-pointer ${
                    uploadingAtt ? "opacity-50 pointer-events-none" : ""
                  }`}
                >
                  {uploadingAtt ? <Loader2Icon className="w-3.5 h-3.5 animate-spin" /> : <PaperclipIcon className="w-3.5 h-3.5" />}
                  添加附件
                </span>
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    e.target.value = "";
                    void uploadAttachments(files);
                  }}
                />
              </label>
            ) : (
              <span className="ml-auto text-xs text-gray-400">先「保存草稿」后即可添加附件</span>
            )}
          </div>
          {attachments.length === 0 ? (
            <div className="py-4 text-center text-xs text-gray-300">暂无附件(Word/Excel/PDF 模板等)</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {attachments.map((att) => (
                <div key={att.id} className="flex items-center gap-3 py-2">
                  <FileTextIcon className="w-4 h-4 text-gray-300 shrink-0" />
                  <span className="flex-1 truncate text-sm text-gray-700">{att.name}</span>
                  <button
                    type="button"
                    onClick={() => void removeAttachment(att)}
                    className="text-gray-300 hover:text-red-500"
                    aria-label={`删除附件 ${att.name}`}
                  >
                    <Trash2Icon className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
