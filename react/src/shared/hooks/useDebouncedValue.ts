import { useEffect, useState } from "react";

/** 防抖值:value 停止变化 delay ms 后才更新返回值(搜索联想等高频输入场景)。 */
export function useDebouncedValue<T>(value: T, delay = 220): T {
  const [deb, setDeb] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDeb(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return deb;
}
