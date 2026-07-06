import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FolderTreeIcon, PlusIcon, PencilIcon, Trash2Icon, ShieldCheckIcon } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Switch } from "@/shared/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { knowledgeApi, knowledgeErrMsg, type KnowledgeCategory, type KnowledgeType } from "../../api";

type CatDialogState =
  | { mode: "create"; parentId: string | null; parentName?: string }
  | { mode: "edit"; cat: KnowledgeCategory }
  | null;

/**
 * 分类管理:领域分类(两级树)+ 内容类型与审核开关(requireReview 唯一配置处)。
 */
export default function KnowledgeCategories() {
  const [tab, setTab] = useState<"category" | "type">("category");
  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-2 mb-1">
        <FolderTreeIcon className="w-5 h-5 text-[var(--party-primary)]" />
        <h1 className="text-xl font-bold text-gray-900">知识分类管理</h1>
      </div>
      <p className="text-sm text-gray-400 mb-4">
        领域分类 = 门户左侧导航(党建/设备/安全…);内容类型 = 条例/制度/经验等,并决定「提交是否需审核」。
      </p>
      <Tabs value={tab} onValueChange={(v) => setTab(v as "category" | "type")}>
        <TabsList>
          <TabsTrigger value="category">领域分类</TabsTrigger>
          <TabsTrigger value="type">内容类型与审核</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="mt-4">{tab === "category" ? <CategoriesTab /> : <TypesTab />}</div>
    </div>
  );
}

/* ─── 领域分类 ─── */

function CategoriesTab() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["knowledge", "categories"], queryFn: knowledgeApi.listCategories });
  const [dialog, setDialog] = useState<CatDialogState>(null);

  const del = useMutation({
    mutationFn: (id: string) => knowledgeApi.deleteCategory(id),
    onSuccess: () => {
      toast.success("已删除");
      qc.invalidateQueries({ queryKey: ["knowledge", "categories"] });
    },
    onError: (e) => toast.error(knowledgeErrMsg(e, "删除失败")),
  });

  function row(cat: KnowledgeCategory, isChild: boolean) {
    return (
      <div
        key={cat.id}
        className={`flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-gray-50 ${isChild ? "ml-8" : ""}`}
      >
        <span className={`flex-1 truncate ${isChild ? "text-sm text-gray-600" : "font-medium text-gray-800"}`}>
          {isChild && <span className="text-gray-300 mr-1">└</span>}
          {cat.name}
          {cat.description && <span className="ml-2 text-xs text-gray-400">{cat.description}</span>}
        </span>
        <span className="text-xs text-gray-400">{cat.articleCount} 篇</span>
        {!isChild && (
          <Button
            size="sm"
            variant="ghost"
            className="text-gray-400"
            onClick={() => setDialog({ mode: "create", parentId: cat.id, parentName: cat.name })}
          >
            <PlusIcon className="w-3.5 h-3.5 mr-0.5" /> 子分类
          </Button>
        )}
        <Button size="sm" variant="ghost" className="text-gray-400" onClick={() => setDialog({ mode: "edit", cat })}>
          <PencilIcon className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-gray-300 hover:text-red-500"
          onClick={() => {
            if (window.confirm(`确定删除分类「${cat.name}」?(有子分类或文章时不可删)`)) del.mutate(cat.id);
          }}
        >
          <Trash2Icon className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-white shadow-sm p-4">
      <div className="flex justify-end mb-2">
        <Button size="sm" onClick={() => setDialog({ mode: "create", parentId: null })}>
          <PlusIcon className="w-4 h-4 mr-1" /> 新建顶级分类
        </Button>
      </div>
      {list.isLoading ? (
        <div className="py-10 text-center text-sm text-gray-400">加载中…</div>
      ) : (list.data?.length ?? 0) === 0 ? (
        <div className="py-10 text-center text-sm text-gray-400">还没有分类</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {list.data!.map((root) => (
            <div key={root.id} className="py-0.5">
              {row(root, false)}
              {root.children.map((c) => row(c, true))}
            </div>
          ))}
        </div>
      )}
      {dialog && (
        <CategoryDialog
          key={dialog.mode === "edit" ? dialog.cat.id : `new-${dialog.parentId ?? "root"}`}
          state={dialog}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function CategoryDialog({ state, onClose }: { state: NonNullable<CatDialogState>; onClose: () => void }) {
  const qc = useQueryClient();
  const editing = state.mode === "edit" ? state.cat : null;
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [sortOrder, setSortOrder] = useState(String(editing?.sortOrder ?? 0));

  const save = useMutation({
    mutationFn: () => {
      const data = { name: name.trim(), description: description.trim() || undefined, sortOrder: Number(sortOrder) || 0 };
      return editing
        ? knowledgeApi.updateCategory(editing.id, data)
        : knowledgeApi.createCategory({ ...data, parentId: state.mode === "create" ? state.parentId ?? undefined : undefined });
    },
    onSuccess: () => {
      toast.success("已保存");
      qc.invalidateQueries({ queryKey: ["knowledge", "categories"] });
      onClose();
    },
    onError: (e) => toast.error(knowledgeErrMsg(e, "保存失败")),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing
              ? `编辑分类「${editing.name}」`
              : state.mode === "create" && state.parentName
                ? `在「${state.parentName}」下新建子分类`
                : "新建顶级分类"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <div className="text-xs text-gray-400 mb-1">名称 *</div>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如:党建 / 设备 / 安全" autoFocus />
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-1">说明(可选)</div>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="一句话说明" />
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-1">排序(小的在前)</div>
            <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="w-28" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── 内容类型与审核 ─── */

function TypesTab() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["knowledge", "types"], queryFn: knowledgeApi.listTypes });
  const [creating, setCreating] = useState(false);

  const update = useMutation({
    mutationFn: ({ code, data }: { code: string; data: { requireReview?: boolean } }) =>
      knowledgeApi.updateType(code, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["knowledge", "types"] }),
    onError: (e) => toast.error(knowledgeErrMsg(e, "保存失败")),
  });

  const del = useMutation({
    mutationFn: (code: string) => knowledgeApi.deleteType(code),
    onSuccess: () => {
      toast.success("已删除");
      qc.invalidateQueries({ queryKey: ["knowledge", "types"] });
    },
    onError: (e) => toast.error(knowledgeErrMsg(e, "删除失败")),
  });

  return (
    <div className="rounded-xl border border-gray-100 bg-white shadow-sm p-4">
      <div className="flex items-center mb-2">
        <span className="text-xs text-gray-400 flex items-center gap-1">
          <ShieldCheckIcon className="w-3.5 h-3.5" />
          开「需审核」的类型(如条例/制度),普通用户提交后须管理员审核通过才公开;管理员本人提交免审。
        </span>
        <Button size="sm" className="ml-auto" onClick={() => setCreating(true)}>
          <PlusIcon className="w-4 h-4 mr-1" /> 新建类型
        </Button>
      </div>
      <div className="divide-y divide-gray-50">
        {(list.data ?? []).map((t: KnowledgeType) => (
          <div key={t.code} className="flex items-center gap-4 py-3 px-2">
            <span className="font-medium text-gray-800 w-28">{t.name}</span>
            <span className="text-xs text-gray-400 font-mono">{t.code}</span>
            <span className="ml-auto flex items-center gap-2 text-sm text-gray-500">
              需审核
              <Switch
                checked={t.requireReview}
                onCheckedChange={(v) => update.mutate({ code: t.code, data: { requireReview: v } })}
              />
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="text-gray-300 hover:text-red-500"
              onClick={() => {
                if (window.confirm(`确定删除类型「${t.name}」?(有文章使用时不可删)`)) del.mutate(t.code);
              }}
            >
              <Trash2Icon className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
      </div>
      {creating && <TypeDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function TypeDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [requireReview, setRequireReview] = useState(false);

  const save = useMutation({
    mutationFn: () => knowledgeApi.createType({ code: code.trim(), name: name.trim(), requireReview }),
    onSuccess: () => {
      toast.success("已创建");
      qc.invalidateQueries({ queryKey: ["knowledge", "types"] });
      onClose();
    },
    onError: (e) => toast.error(knowledgeErrMsg(e, "创建失败")),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>新建内容类型</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <div className="text-xs text-gray-400 mb-1">名称 *</div>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如:应急预案" autoFocus />
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-1">代码 *(小写字母/数字/下划线,建后不可改)</div>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="如:emergency_plan" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <Switch checked={requireReview} onCheckedChange={setRequireReview} /> 提交需管理员审核
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button disabled={!name.trim() || !code.trim() || save.isPending} onClick={() => save.mutate()}>创建</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
