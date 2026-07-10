import { type GameRemoteProps, type GameUi } from "./types";
import { raceUi, RaceRemote } from "./race";

/**
 * 足球摇一摇 —— 画面/计分/配置/领奖台与「快乐点点点」(race)完全一致(直接复用 raceUi 的 Screen/Config/
 * defaultConfig/defaultSounds),唯一区别:手机端交互从「点击」换成「摇一摇」(RaceRemote 的 shake 模式)。
 * ⚠ 体感需安全上下文(HTTPS/localhost);局域网 HTTP 下 devicemotion 不派发,自动兜底为点击。
 */
function SoccerShakeRemote(props: GameRemoteProps) {
  return <RaceRemote {...props} mode="shake" />;
}

export const soccerShakeUi: GameUi = {
  ...raceUi,
  type: "soccer_shake",
  label: "足球摇一摇",
  icon: "Vibrate",
  hint: "限时摇手机,摇得越猛跑得越远;画面/计分同快乐点点点,只把点击换成摇一摇(体感)",
  rules:
    "🤳 个人赛:倒计时结束后用力摇手机 —— 摇得越多,你的跑者在大屏赛道上冲得越靠前,前 8 名实时 PK,第一个撞线夺冠。\n👥 团体赛:先加入一个队伍,比全队摇动总次数,哪个队总数最高哪队夺冠。\n📱 体感不灵?点屏幕圆圈也能计数(局域网无 HTTPS 时的兜底)。",
  Remote: SoccerShakeRemote,
};
