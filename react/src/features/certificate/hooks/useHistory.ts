import { useCallback, useState } from "react";

const MAX_HISTORY = 50;

/**
 * 通用 undo/redo 历史栈。
 *
 * 设计:
 *   - state:当前展示的状态(类似 useState)
 *   - setState:静默更新,不进历史 — 用于"连续交互"中间状态(拖拽中每帧的位置)
 *   - record:把当前 present 推入 past 作为可回滚检查点 — 用于"动作开始前"
 *
 * 典型用法:
 *   // 拖拽
 *   onMouseDown: record(); dragRef.current = {...}
 *   onMouseMove: setState(newState)   // 不进历史
 *   onMouseUp:   nothing — 历史已经在 mouseDown 时记好了
 *
 *   // 一次性动作(加元素 / 删除 / 改属性 / 排序)
 *   record();
 *   setState(newState);
 *
 * 这种"动作前 record"的模式比"动作后 commit"清晰 —— record 的含义就是
 * "我现在准备改东西了,先存档"。撤销时 pop past 还原即可。
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

  /** 重置历史(切换模板时用) */
  const reset = useCallback((next: T) => {
    setStateInternal(next);
    setPast([]);
    setFuture([]);
  }, []);

  return {
    state,
    setState,
    record,
    undo,
    redo,
    reset,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  };
}
