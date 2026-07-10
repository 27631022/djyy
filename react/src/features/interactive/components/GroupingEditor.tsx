import { TEAM_COLORS, type GroupingConfig } from "../api";

function newTeamId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `t_${Math.random().toString(36).slice(2)}`;
}

/**
 * 分组对抗编辑器 —— 个人赛/分组对抗是**节目玩法**,在节目设置里配(每节目独立)。
 * 受控 value/onChange;队伍/每队上限/自选或均分。
 */
export function GroupingEditor({
  value,
  onChange,
}: {
  value: GroupingConfig;
  onChange: (g: GroupingConfig) => void;
}) {
  const g = value;
  const addTeam = () => {
    if (g.teams.length >= 8) return;
    const i = g.teams.length;
    onChange({
      ...g,
      teams: [...g.teams, { id: newTeamId(), name: `${i + 1}队`, color: TEAM_COLORS[i % TEAM_COLORS.length] }],
    });
  };
  const updTeam = (id: string, patch: Partial<{ name: string; color: string }>) =>
    onChange({ ...g, teams: g.teams.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  const delTeam = (id: string) => onChange({ ...g, teams: g.teams.filter((t) => t.id !== id) });

  return (
    <div className="space-y-3 text-sm">
      <div className="flex gap-2">
        {(["individual", "teams"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange({ ...g, mode: m })}
            className={`rounded-md px-3 py-1 border ${
              g.mode === m ? "border-[var(--party-primary)] bg-party-soft" : "border-gray-300"
            }`}
          >
            {m === "individual" ? "个人赛" : "分组对抗"}
          </button>
        ))}
      </div>

      {g.mode === "teams" && (
        <div className="space-y-3">
          <div className="space-y-2">
            {g.teams.map((t) => (
              <div key={t.id} className="flex items-center gap-2">
                <input type="color" value={t.color} onChange={(e) => updTeam(t.id, { color: e.target.value })} />
                <input
                  value={t.name}
                  onChange={(e) => updTeam(t.id, { name: e.target.value })}
                  maxLength={12}
                  className="rounded-md border border-gray-300 px-2 py-1 flex-1"
                />
                <button
                  type="button"
                  onClick={() => delTeam(t.id)}
                  className="text-gray-400 hover:text-red-500 px-2"
                >
                  删除
                </button>
              </div>
            ))}
            {g.teams.length < 8 && (
              <button
                type="button"
                onClick={addTeam}
                className="rounded-md border border-dashed border-gray-300 px-3 py-1.5 text-gray-500 hover:bg-gray-50 w-full"
              >
                + 添加队伍
              </button>
            )}
          </div>

          <div className="flex items-center gap-6 flex-wrap">
            <label className="flex items-center gap-2">
              每队人数上限
              <input
                type="number"
                min={0}
                max={200}
                value={g.maxPerTeam}
                onChange={(e) => onChange({ ...g, maxPerTeam: Math.max(0, Number(e.target.value) || 0) })}
                className="w-20 rounded-md border border-gray-300 px-2 py-1"
              />
              <span className="text-gray-400">0=不限</span>
            </label>
            <label className="flex items-center gap-2">
              分组方式
              <select
                value={g.assign}
                onChange={(e) => onChange({ ...g, assign: e.target.value === "auto" ? "auto" : "pick" })}
                className="rounded-md border border-gray-300 px-2 py-1"
              >
                <option value="pick">玩家自选队(手机确认加入)</option>
                <option value="auto">系统均分</option>
              </select>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
