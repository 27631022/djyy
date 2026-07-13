import { type GameUi } from "./types";
import { tapRaceUi } from "./tapRace";
import { raceUi } from "./race";
import { soccerShakeUi } from "./soccerShake";
import { routeRaceUi } from "./routeRace";

/**
 * 前端游戏注册表 —— 与后端 games/registry.ts 对称。
 * 加一个新游戏 = 新建 games/<type>.tsx 导出 GameUi + 此处注册一行。
 */
export const GAME_UIS: Record<string, GameUi> = {
  [tapRaceUi.type]: tapRaceUi,
  [raceUi.type]: raceUi,
  [soccerShakeUi.type]: soccerShakeUi,
  [routeRaceUi.type]: routeRaceUi, // 自制闯关赛(hidden:从「自制游戏库」带设计添加,不进裸列)
};

export function getGameUi(type: string | null | undefined): GameUi | null {
  return type ? GAME_UIS[type] ?? null : null;
}

/** 配置台游戏选择器用(hidden 类型不裸列 —— 如 route_race 必须带设计快照添加) */
export const GAME_UI_LIST: GameUi[] = Object.values(GAME_UIS).filter((ui) => !ui.hidden);
