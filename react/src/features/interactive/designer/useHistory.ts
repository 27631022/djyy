import { useCallback, useState } from "react";

const MAX_HISTORY = 50;

/**
 * 通用 undo/redo 历史栈(与 certificate/exhibition 的 useHistory 同一套;certificate barrel
 * 不导出 hook,跨 feature 不能深 import —— 照 exhibition 先例本 feature 自带一份)。
 *
 * 用法:一次性动作 = 先 record() 再 setState();拖拽 = pointerdown 时 record() 一次,
 * move 期间 setState()(中间态不进历史)。
 */
export function useHistory<T>(initial: T) {
  const [state, setStateInternal] = useState<T>(initial);
  const [past, setPast] = useState<T[]>([]);
  const [future, setFuture] = useState<T[]>([]);

  const setState = useCallback((next: T | ((prev: T) => T)) => {
    setStateInternal(next);
  }, []);

  /** 在做改变之前调用 — 把当前 state 推入 past,清空 future */
  const record = useCallback(() => {
    setPast((p) => [...p, state].slice(-MAX_HISTORY));
    setFuture([]);
  }, [state]);

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    setFuture((f) => [state, ...f].slice(0, MAX_HISTORY));
    setStateInternal(prev);
    setPast((p) => p.slice(0, -1));
  }, [past, state]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setPast((p) => [...p, state].slice(-MAX_HISTORY));
    setStateInternal(next);
    setFuture((f) => f.slice(1));
  }, [future, state]);

  const reset = useCallback((next: T) => {
    setStateInternal(next);
    setPast([]);
    setFuture([]);
  }, []);

  return { state, setState, record, undo, redo, reset, canUndo: past.length > 0, canRedo: future.length > 0 };
}
