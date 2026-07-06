import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { knowledgeApi } from "../api";

/**
 * 两级领域分类选择(顶级与二级均可选,二级缩进显示)。
 */
export function CategoryPicker({
  value,
  onChange,
  placeholder = "选择领域分类",
}: {
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const q = useQuery({ queryKey: ["knowledge", "categories"], queryFn: knowledgeApi.listCategories });
  const roots = q.data ?? [];
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={q.isLoading ? "分类加载中…" : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {roots.map((root) => (
          <div key={root.id}>
            <SelectItem value={root.id}>{root.name}</SelectItem>
            {root.children.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                <span className="text-gray-400 mr-1">└</span>
                {c.name}
              </SelectItem>
            ))}
          </div>
        ))}
      </SelectContent>
    </Select>
  );
}
