import { useCallback, useState } from "react";

const MAX = 50;

/**
 * 受控列表的撤销 / 重做(镜像 task/designer/useFieldHistory)。
 * state 由外部持有(value/onChange),本 hook 维护 past/future 两栈。
 * 所有变更走 mutate/undo/redo —— 在事件处理里 setState + onChange(不在 effect 里 onChange)。
 */
export function useFieldHistory<T>(value: T, onChange: (next: T) => void) {
  const [past, setPast] = useState<T[]>([]);
  const [future, setFuture] = useState<T[]>([]);

  const mutate = useCallback(
    (next: T) => {
      setPast((p) => [...p, value].slice(-MAX));
      setFuture([]);
      onChange(next);
    },
    [value, onChange],
  );

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    setPast(past.slice(0, -1));
    setFuture((fu) => [value, ...fu].slice(0, MAX));
    onChange(prev);
  }, [past, value, onChange]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture(future.slice(1));
    setPast((p) => [...p, value].slice(-MAX));
    onChange(next);
  }, [future, value, onChange]);

  return { mutate, undo, redo, canUndo: past.length > 0, canRedo: future.length > 0 };
}
