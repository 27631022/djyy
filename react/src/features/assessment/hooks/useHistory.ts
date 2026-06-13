import { useCallback, useState } from "react";

const MAX_HISTORY = 50;

/**
 * 通用 undo/redo 历史栈(镜像 venue/hooks/useHistory.ts —— 纯通用,逻辑零改)。
 * 指标树编辑器用:一次性动作(加/删/改名/改权重)record() 后 setState()。
 */
export function useHistory<T>(initial: T) {
  const [state, setStateInternal] = useState<T>(initial);
  const [past, setPast] = useState<T[]>([]);
  const [future, setFuture] = useState<T[]>([]);

  const setState = useCallback((next: T | ((prev: T) => T)) => {
    setStateInternal(next);
  }, []);

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
