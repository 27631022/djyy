import { type GameDef } from '../game-def';
import { tapRaceGame } from './tap-race.game';
import { raceGame } from './race.game';
import { soccerShakeGame } from './soccer-shake.game';
import { routeRaceGame } from './route-race.game';

/**
 * 游戏注册表 —— 加游戏在此加一行(+ 前端 features/interactive/games/registry 对称加一行)。
 *
 * 用 `as unknown as GameDef` 收敛:具体游戏是 GameDef<窄类型>,而注册表按全 unknown 的
 * GameDef 存取;方法参数逆变导致直接赋值不兼容,经 unknown 中转是这类「定义对象注册表」的惯用法。
 */
export const GAMES: Record<string, GameDef> = {
  [tapRaceGame.type]: tapRaceGame as unknown as GameDef,
  [raceGame.type]: raceGame,
  [soccerShakeGame.type]: soccerShakeGame,
  [routeRaceGame.type]: routeRaceGame as unknown as GameDef, // 自制闯关赛(互动游戏编辑器产物)
};

export function getGame(type: string): GameDef | null {
  return GAMES[type] ?? null;
}

/** 配置台游戏选择器用 */
export const GAME_LIST: GameDef[] = Object.values(GAMES);
