import type { ShowcaseBlock } from "../api";
import { getTool } from "../tools/registry";

/**
 * 区块展示(访客态):blocks.map → 工具 Display。
 * 未知 type 渲染灰色占位不崩(向后兼容将来删掉的工具/脏数据)。
 */
export function BlocksRenderer({ blocks }: { blocks: ShowcaseBlock[] }) {
  if (!blocks.length) return null;
  return (
    <div className="space-y-6">
      {blocks.map((b) => {
        const def = getTool(b.type);
        if (!def) {
          return (
            <div key={b.id} className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
              暂不支持的展示内容({b.type})
            </div>
          );
        }
        const Display = def.Display;
        return (
          <section key={b.id}>
            <Display value={b.content} />
          </section>
        );
      })}
    </div>
  );
}
