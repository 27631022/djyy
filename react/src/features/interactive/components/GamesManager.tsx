import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { storageApi } from "@/features/storage";
import {
  interactiveApi,
  parseGameGrouping,
  parseGamePlayConfig,
  parseGameSound,
  DEFAULT_SOUND_URL,
  SOUND_SLOTS,
  type CreateGameInput,
  type EventSound,
  type GroupingConfig,
  type InteractiveEvent,
  type InteractiveGame,
  type SoundEffect,
  type SoundKey,
} from "../api";
import { GAME_UI_LIST, getGameUi } from "../games/registry";
import { type GameUi } from "../games/types";
import { SoundEffectEditor } from "./SoundEffectEditor";
import { GroupingEditor } from "./GroupingEditor";

const EVENTS_KEY = ["interactive", "events"];

interface Draft {
  gameType: string;
  title: string;
  config: Record<string, unknown>;
}

function newDraft(ui: GameUi): Draft {
  return { gameType: ui.type, title: ui.label, config: { ...ui.defaultConfig } };
}

/**
 * 单个节目的设置编辑器:玩法配置 + **独立音效**(每节目一份,初始=同一套默认音,不共用)。
 * key 重挂载模式:草稿在 useState 初始化器里从 configJson 一次读入,保存整份提交由后端归一化。
 */
function GameEditor({
  game,
  eventId,
  onClose,
}: {
  game: InteractiveGame;
  eventId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const ui = getGameUi(game.gameType);
  const [title, setTitle] = useState(game.title);
  const [cfg, setCfg] = useState<Record<string, unknown>>(() => parseGamePlayConfig(game.configJson));
  const [sound, setSound] = useState<EventSound>(() => parseGameSound(game.configJson));
  const [grouping, setGrouping] = useState<GroupingConfig>(() => parseGameGrouping(game.configJson));
  const [uploading, setUploading] = useState<string | null>(null);

  const saveMut = useMutation({
    mutationFn: () =>
      interactiveApi.updateGame(game.id, {
        title: title.trim() || undefined,
        config: { ...cfg, sound, grouping },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EVENTS_KEY });
      toast.success("节目设置已保存(音效即时生效;版式/玩法在开赛前和结算页即时生效)");
      onClose();
    },
    onError: () => toast.error("保存失败"),
  });

  const setEffect = (key: SoundKey, e: SoundEffect) =>
    setSound((s) => ({ ...s, effects: { ...s.effects, [key]: e } }));
  const clearEffectFile = (key: SoundKey) =>
    setSound((s) => {
      const e = s.effects[key];
      const next: SoundEffect = {
        loop: e.loop,
        playCount: e.playCount,
        delayMs: e.delayMs,
        volume: e.volume,
        clipStart: e.clipStart,
        clipEnd: e.clipEnd,
      };
      return { ...s, effects: { ...s.effects, [key]: next } };
    });

  const uploadEffect = async (file: File, key: SoundKey) => {
    setUploading(key);
    try {
      const meta = await storageApi.upload(file, {
        ownerModule: "interactive",
        folder: `event-${eventId}/game-${game.id}`,
      });
      setSound((s) => ({
        ...s,
        effects: { ...s.effects, [key]: { ...s.effects[key], fileId: meta.id, name: meta.originalName } },
      }));
      toast.success("上传成功,记得点「保存节目设置」");
    } catch {
      toast.error("上传失败");
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="rounded-lg border border-[var(--party-primary)] bg-party-soft p-3 space-y-3">
      <div className="flex items-center gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={60}
          className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm"
        />
        <span className="text-xs text-gray-500 shrink-0">{ui?.label ?? game.gameType}</span>
      </div>

      {ui && (
        <div className="rounded-md bg-white/70 p-2">
          <div className="text-xs font-semibold text-gray-500 mb-1.5">玩法</div>
          <ui.Config value={cfg} onChange={setCfg} />
        </div>
      )}

      <div className="rounded-md bg-white/70 p-2">
        <div className="text-xs font-semibold text-gray-500 mb-1.5">
          分组(个人赛 / 分组对抗 —— 本节目玩法,各节目独立)
        </div>
        <GroupingEditor value={grouping} onChange={setGrouping} />
      </div>

      <div className="rounded-md bg-white/70 p-2">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-xs font-semibold text-gray-500">音效(本节目独立,5 种)</div>
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={sound.enabled}
              onChange={(e) => setSound((s) => ({ ...s, enabled: e.target.checked }))}
            />
            启用
          </label>
        </div>
        <div className="space-y-2">
          {SOUND_SLOTS.map((s) => (
            <SoundEffectEditor
              key={s.key}
              label={s.label}
              value={sound.effects[s.key]}
              defaultUrl={ui?.defaultSounds?.[s.key] ?? DEFAULT_SOUND_URL[s.key]}
              uploading={uploading === s.key}
              onChange={(e) => setEffect(s.key, e)}
              onUpload={(f) => uploadEffect(f, s.key)}
              onClearFile={() => clearEffectFile(s.key)}
            />
          ))}
        </div>
        <div className="text-[11px] text-gray-400 mt-1.5">
          初始为同一套内置默认音;此处修改只影响本节目,不影响其他节目
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          className="rounded-md px-4 py-1 text-white text-sm disabled:opacity-50"
          style={{ background: "var(--party-primary)" }}
        >
          {saveMut.isPending ? "保存中…" : "保存节目设置"}
        </button>
        <button type="button" onClick={onClose} className="rounded-md border border-gray-300 px-4 py-1 text-sm">
          收起
        </button>
      </div>
    </div>
  );
}

/** 节目单管理:加/删多个节目 + 每个节目**单独设置**(玩法 + 独立音效);主持台经 room:games 即时同步。 */
export function GamesManager({ event }: { event: InteractiveEvent }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const addMut = useMutation({
    mutationFn: (input: CreateGameInput) => interactiveApi.addGame(event.id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EVENTS_KEY });
      toast.success("节目已添加(音效已初始化为默认,可在节目设置里单独调整)");
      setDraft(null);
    },
    onError: () => toast.error("添加失败"),
  });
  const removeMut = useMutation({
    mutationFn: (gameId: string) => interactiveApi.removeGame(gameId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EVENTS_KEY });
      toast.success("节目已删除");
    },
    onError: () => toast.error("删除失败"),
  });

  const confirmAdd = () => {
    if (!draft) return;
    addMut.mutate({ gameType: draft.gameType, title: draft.title.trim() || undefined, config: draft.config });
  };
  const draftUi = draft ? getGameUi(draft.gameType) : null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
      <div className="font-bold">节目设置(每个节目的玩法、音效都独立)</div>

      <div className="space-y-2">
        {event.games.map((g, i) => {
          const ui = getGameUi(g.gameType);
          const editing = editingId === g.id;
          return (
            <div key={g.id} className="space-y-2">
              <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                <div className="min-w-0">
                  <span className="text-gray-400 text-xs mr-2">{i + 1}.</span>
                  <span className="font-medium">{g.title}</span>
                  <span className="text-xs text-gray-400 ml-2">{ui?.label ?? g.gameType}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditingId(editing ? null : g.id)}
                    className="text-sm text-[var(--party-primary)] hover:underline"
                  >
                    {editing ? "收起" : "设置"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`删除节目「${g.title}」?其记录一并删除。`)) removeMut.mutate(g.id);
                    }}
                    disabled={removeMut.isPending}
                    className="text-gray-400 hover:text-red-500 text-sm"
                  >
                    删除
                  </button>
                </div>
              </div>
              {editing && (
                <GameEditor
                  key={`${g.id}-${g.configJson.length}`}
                  game={g}
                  eventId={event.id}
                  onClose={() => setEditingId(null)}
                />
              )}
            </div>
          );
        })}
        {event.games.length === 0 && <div className="text-sm text-gray-400">还没有节目</div>}
      </div>

      {!draft ? (
        <div className="flex gap-2 flex-wrap">
          <span className="text-sm text-gray-500 self-center">添加节目:</span>
          {GAME_UI_LIST.map((ui) => (
            <button
              key={ui.type}
              type="button"
              onClick={() => setDraft(newDraft(ui))}
              className="text-sm rounded-md border border-gray-300 px-3 py-1 hover:bg-gray-50"
            >
              + {ui.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-[var(--party-primary)] bg-party-soft p-3 space-y-2">
          <div className="flex items-center gap-2">
            <input
              value={draft.title}
              onChange={(e) => setDraft((d) => (d ? { ...d, title: e.target.value } : d))}
              className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm"
            />
            <span className="text-xs text-gray-500">{draftUi?.label}</span>
          </div>
          {draftUi && <draftUi.Config value={draft.config} onChange={(cfg) => setDraft((d) => (d ? { ...d, config: cfg } : d))} />}
          <div className="text-xs text-gray-400">音效自动初始化为默认 5 段,添加后在该节目「设置」里单独调整</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirmAdd}
              disabled={addMut.isPending}
              className="rounded-md px-4 py-1 text-white text-sm disabled:opacity-50"
              style={{ background: "var(--party-primary)" }}
            >
              {addMut.isPending ? "添加中…" : "确认添加"}
            </button>
            <button type="button" onClick={() => setDraft(null)} className="rounded-md border border-gray-300 px-4 py-1 text-sm">
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
