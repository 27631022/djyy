import { type GameDef } from '../game-def';
import { raceGame } from './race.game';

/**
 * 足球摇一摇 —— 玩法/计分/倒计时/分组/跑动/领奖台与 race(快乐点点点)**完全一致**,
 * 唯一区别在手机端交互:把「点击」换成「摇一摇」(体感)。
 * 后端零差异:reduce 仍吃 {kind:'tap', n}(每次摇动 = 一次 tap),只换 type/label;前端换 Remote。
 * 加新游戏 = 后端一文件 + 前端一文件 + 双端 registry 各一行。
 */
export const soccerShakeGame = {
  ...raceGame,
  type: 'soccer_shake',
  label: '足球摇一摇',
  icon: 'Vibrate',
} as unknown as GameDef;
