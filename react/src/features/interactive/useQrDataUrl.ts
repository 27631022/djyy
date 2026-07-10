import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** 把文本渲染成二维码 data URL(异步)。text 变化即重算。 */
export function useQrDataUrl(text: string, size = 240): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!text) return; // 空文本:不同步置态(避免 set-state-in-effect),保留上次值
    let alive = true;
    QRCode.toDataURL(text, { width: size, margin: 1, color: { dark: "#111827", light: "#ffffff" } })
      .then((u) => {
        if (alive) setUrl(u);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [text, size]);
  return url;
}
