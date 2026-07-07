import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronLeftIcon,
  GlobeIcon,
  LinkIcon,
  Loader2Icon,
  SparklesIcon,
  WandSparklesIcon,
  ClipboardPasteIcon,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import { knowledgeAiApi, knowledgeApi, knowledgeErrMsg, type CleanResult } from "../api";
import { MarkdownView } from "../components/MarkdownView";

type Source = "search" | "url" | "paste";

/**
 * AI 归档向导:输入条例名称 → 联网检索(条件显示)/ 贴 URL(后端抓正文)/ 贴全文
 * → AI 清洗成规范全文 → 预览 → 建成草稿进编辑器。
 */
export default function KnowledgeArchive() {
  const navigate = useNavigate();
  const cap = useQuery({ queryKey: ["knowledge", "ai", "cap"], queryFn: knowledgeAiApi.capabilities });
  const [name, setName] = useState("");
  const [source, setSource] = useState<Source>("paste");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [result, setResult] = useState<CleanResult | null>(null);

  const canWebSearch = !!cap.data?.webSearch;

  const fetchUrl = useMutation({
    mutationFn: () => knowledgeAiApi.fetchUrl(url.trim()),
    onSuccess: (d) => {
      setText(d.text);
      setSource("paste");
      toast.success(`已抓取正文(${d.text.length} 字),可核对后清洗`);
    },
    onError: (e) => toast.error(knowledgeErrMsg(e, "抓取失败")),
  });

  const clean = useMutation({
    mutationFn: () => {
      if (source === "search") return knowledgeAiApi.search(name.trim());
      return knowledgeAiApi.clean(name.trim(), text.trim());
    },
    onSuccess: setResult,
    onError: (e) => toast.error(knowledgeErrMsg(e, "AI 清洗失败")),
  });

  const createDraft = useMutation({
    mutationFn: async () => {
      if (!result) throw new Error("no result");
      // 找一个可用的领域分类(优先匹配 categoryHint),内容类型默认「条例」
      const cats = await knowledgeApi.listCategories();
      const flat = cats.flatMap((c) => [c, ...c.children]);
      const hit = flat.find((c) => result.categoryHint && c.name.includes(result.categoryHint)) ?? flat[0];
      const types = await knowledgeApi.listTypes();
      const type = types.find((t) => t.code === "regulation") ?? types[0];
      if (!hit || !type) throw new Error("请先在「分类管理」建好领域分类与内容类型");
      return knowledgeApi.createArticle({
        title: result.title,
        categoryId: hit.id,
        typeCode: type.code,
        contentMd: result.contentMd,
      });
    },
    onSuccess: (a) => {
      toast.success("已建成草稿,去编辑器完善后发布");
      navigate(`/knowledge/edit/${a.id}`, { replace: true });
    },
    onError: (e) => toast.error(knowledgeErrMsg(e, "建草稿失败")),
  });

  const sourceBtn = (s: Source, disabled = false) =>
    `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
      source === s
        ? "border-[var(--party-primary)] bg-party-soft text-[var(--party-primary)]"
        : "border-gray-200 text-gray-500 hover:border-gray-300"
    } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FBF7F2] via-[#FDFCFA] to-white pb-16">
      <header className="sticky top-0 z-20 bg-white/85 backdrop-blur border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/knowledge")}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-[var(--party-primary)]"
          >
            <ChevronLeftIcon className="w-4 h-4" /> 知识园地
          </button>
          <div className="flex items-center gap-1.5 font-bold text-gray-900">
            <WandSparklesIcon className="w-5 h-5 text-[var(--party-primary)]" /> AI 归档条例
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 pt-6 space-y-4">
        {/* 名称 + 来源 */}
        <div className="rounded-xl border border-gray-100 bg-white/90 shadow-sm p-5 space-y-4">
          <div>
            <div className="text-xs text-gray-400 mb-1">条例 / 制度名称 *</div>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如:中国共产党支部工作条例(试行)" />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400">内容来源:</span>
            <button type="button" className={sourceBtn("paste")} onClick={() => setSource("paste")}>
              <ClipboardPasteIcon className="w-4 h-4" /> 粘贴全文
            </button>
            <button type="button" className={sourceBtn("url")} onClick={() => setSource("url")}>
              <LinkIcon className="w-4 h-4" /> 粘贴链接(自动抓正文)
            </button>
            <button
              type="button"
              className={sourceBtn("search", !canWebSearch)}
              onClick={() => canWebSearch && setSource("search")}
              title={canWebSearch ? "" : "未配置联网搜索模型 —— 到「AI 接入管理」给「AI 联网检索归档」绑定开启联网的模型"}
            >
              <GlobeIcon className="w-4 h-4" /> 一键联网检索
            </button>
          </div>

          {source === "url" && (
            <div className="flex items-center gap-2">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="粘贴条例原文网页链接(政府官网等)" className="flex-1" />
              <Button variant="outline" disabled={!url.trim() || fetchUrl.isPending} onClick={() => fetchUrl.mutate()}>
                {fetchUrl.isPending ? <Loader2Icon className="w-4 h-4 mr-1 animate-spin" /> : <LinkIcon className="w-4 h-4 mr-1" />}
                抓取正文
              </Button>
            </div>
          )}

          {source !== "search" && (
            <div>
              <div className="text-xs text-gray-400 mb-1">
                {source === "url" ? "抓取到的正文(可核对/修补后再清洗)" : "粘贴原始正文"}
              </div>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={8}
                placeholder="把条例原文粘贴到这里,AI 会清洗成规范全文…"
                className="text-sm font-mono"
              />
            </div>
          )}
          {source === "search" && (
            <div className="rounded-lg bg-blue-50/60 border border-blue-100 px-3 py-2 text-xs text-blue-700">
              将让 AI 联网搜索《{name || "…"}》的最新权威全文并清洗归档。检索质量取决于所配模型。
            </div>
          )}

          <div className="flex justify-end">
            <Button
              className="bg-[var(--party-primary)] hover:opacity-90 text-white"
              disabled={
                !name.trim() ||
                clean.isPending ||
                (source !== "search" && !text.trim())
              }
              onClick={() => clean.mutate()}
            >
              {clean.isPending ? <Loader2Icon className="w-4 h-4 mr-1 animate-spin" /> : <SparklesIcon className="w-4 h-4 mr-1" />}
              {source === "search" ? "联网检索并清洗" : "AI 清洗成规范全文"}
            </Button>
          </div>
        </div>

        {/* 预览 */}
        {result && (
          <div className="rounded-xl border border-gray-100 bg-white/90 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="font-medium text-gray-800">{result.title}</span>
              {result.categoryHint && (
                <span className="px-1.5 py-0.5 rounded text-[11px] bg-party-soft text-[var(--party-primary)]">
                  建议分类:{result.categoryHint}
                </span>
              )}
              <Button
                className="ml-auto bg-[var(--party-primary)] hover:opacity-90 text-white"
                size="sm"
                disabled={createDraft.isPending}
                onClick={() => createDraft.mutate()}
              >
                {createDraft.isPending ? <Loader2Icon className="w-4 h-4 mr-1 animate-spin" /> : null}
                建成草稿去编辑
              </Button>
            </div>
            <div className="max-h-[50vh] overflow-y-auto border border-gray-100 rounded-lg p-4 bg-gray-50/40">
              <MarkdownView md={result.contentMd} />
            </div>
            <div className="mt-2 text-xs text-gray-400">
              清洗结果仅供参考,请与原文核对无误后再发布(建成草稿后可在编辑器继续修改、生成导读/FAQ)。
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
