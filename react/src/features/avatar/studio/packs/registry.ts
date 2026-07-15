import type { StylePack } from "../types";
import { pixarPack } from "./pixar";

/**
 * 风格包注册表(照 task/fields / interactive/games 范式):
 * 加一个新风格包 = packs/<id>/ 一个目录(index.ts 定义 + assets 素材)+ 此处注册一行。
 */
export const STYLE_PACKS: Record<string, StylePack> = {
  [pixarPack.id]: pixarPack,
};

export const DEFAULT_PACK_ID = pixarPack.id;

export function getPack(id: string | null | undefined): StylePack {
  return (id && STYLE_PACKS[id]) || pixarPack;
}
