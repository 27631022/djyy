/** 编辑器中栏的三个场景(游戏前 / 游戏中 / 颁奖),对应设计的 lobby / board / award 三段 */
export type DesignScene = "lobby" | "board" | "award";

export const SCENE_TABS: { key: DesignScene; label: string }[] = [
  { key: "lobby", label: "① 游戏前(报名)" },
  { key: "board", label: "② 游戏中(路线/关卡)" },
  { key: "award", label: "③ 颁奖" },
];
