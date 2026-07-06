import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookTemplateIcon, LayoutTemplateIcon, Loader2Icon, SaveIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { useAuth } from "@/stores/auth";
import { knowledgeApi, knowledgeErrMsg } from "../api";

/**
 * 编辑器模板栏:「从模板套用」(把模板正文框架填入编辑器)+「存为模板」(把当前正文存成可复用模板)。
 * 人人可存可用;删自己创建的或管理员删任意。
 */
export function TemplateBar({
  contentMd,
  onApply,
}: {
  contentMd: string;
  onApply: (md: string) => void;
}) {
  const [saveOpen, setSaveOpen] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <ApplyPopover onApply={onApply} hasContent={!!contentMd.trim()} />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-gray-500"
        disabled={!contentMd.trim()}
        onClick={() => setSaveOpen(true)}
      >
        <SaveIcon className="w-3.5 h-3.5 mr-1" /> 存为模板
      </Button>
      {saveOpen && <SaveTemplateDialog contentMd={contentMd} onClose={() => setSaveOpen(false)} />}
    </div>
  );
}

function ApplyPopover({ onApply, hasContent }: { onApply: (md: string) => void; hasContent: boolean }) {
  const qc = useQueryClient();
  const { me } = useAuth();
  const [open, setOpen] = useState(false);
  const list = useQuery({ queryKey: ["knowledge", "templates"], queryFn: knowledgeApi.listTemplates, enabled: open });
  const canManage = !!me?.isPlatformAdmin || (me?.permissions ?? []).includes("knowledge:manage");

  const del = useMutation({
    mutationFn: (id: string) => knowledgeApi.deleteTemplate(id),
    onSuccess: () => {
      toast.success("已删除模板");
      qc.invalidateQueries({ queryKey: ["knowledge", "templates"] });
    },
    onError: (e) => toast.error(knowledgeErrMsg(e, "删除失败")),
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="text-gray-500">
          <LayoutTemplateIcon className="w-3.5 h-3.5 mr-1" /> 从模板套用
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        <div className="text-xs text-gray-400 px-1 pb-1.5">套用模板会用其框架替换当前正文。</div>
        {list.isLoading ? (
          <div className="py-6 text-center text-xs text-gray-400">加载中…</div>
        ) : (list.data?.length ?? 0) === 0 ? (
          <div className="py-6 text-center text-xs text-gray-400">还没有模板 —— 编辑正文后点「存为模板」创建</div>
        ) : (
          <div className="max-h-72 overflow-y-auto space-y-0.5">
            {list.data!.map((t) => (
              <div key={t.id} className="flex items-center gap-1 group rounded-lg hover:bg-gray-50 px-1">
                <button
                  type="button"
                  className="flex-1 text-left py-1.5 min-w-0"
                  onClick={() => {
                    if (hasContent && !window.confirm(`套用模板「${t.name}」会替换当前正文,继续?`)) return;
                    onApply(t.contentMd);
                    setOpen(false);
                    toast.success(`已套用模板「${t.name}」`);
                  }}
                >
                  <div className="text-sm text-gray-800 truncate flex items-center gap-1">
                    <BookTemplateIcon className="w-3.5 h-3.5 text-[var(--party-primary)] shrink-0" /> {t.name}
                  </div>
                  {t.description && <div className="text-[11px] text-gray-400 truncate pl-5">{t.description}</div>}
                  <div className="text-[11px] text-gray-300 pl-5">{t.createdByName}</div>
                </button>
                {(me?.id === t.createdById || canManage) && (
                  <button
                    type="button"
                    className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 px-1"
                    onClick={() => del.mutate(t.id)}
                    aria-label={`删除模板 ${t.name}`}
                  >
                    <Trash2Icon className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function SaveTemplateDialog({ contentMd, onClose }: { contentMd: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const save = useMutation({
    mutationFn: () => knowledgeApi.createTemplate({ name: name.trim(), description: description.trim() || undefined, contentMd }),
    onSuccess: () => {
      toast.success("已存为模板,其他人新建时可套用");
      qc.invalidateQueries({ queryKey: ["knowledge", "templates"] });
      onClose();
    },
    onError: (e) => toast.error(knowledgeErrMsg(e, "保存失败")),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>存为模板</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-gray-400 -mt-1">把当前正文框架存成模板,别人新建时可一键套用(只存正文结构,不含标题/分类)。</div>
        <div className="space-y-3">
          <div>
            <div className="text-xs text-gray-400 mb-1">模板名称 *</div>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如:制度类通用框架" autoFocus />
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-1">说明(可选)</div>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="这个模板适合什么内容" className="text-sm" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2Icon className="w-4 h-4 mr-1 animate-spin" /> : null}
            保存模板
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
