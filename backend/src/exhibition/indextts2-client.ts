/**
 * IndexTTS2(本地 Gradio 服务)语音克隆客户端。
 *
 * IndexTTS2 是「零样本声音克隆」TTS:给一段**音色参考音频** + 文本,合成出该音色的语音。
 * 通过 Gradio HTTP API 调用(实测协议,见 backend 调试):
 *   1. 上传参考音频:POST {base}/gradio_api/upload(multipart, 字段 files)→ 服务器临时路径
 *   2. 提交合成:POST {base}/gradio_api/call/gen_single { data:[...] } → { event_id }
 *   3. 取结果:GET {base}/gradio_api/call/gen_single/{event_id}(SSE,连接持续到 complete)
 *      → 解析 event:complete 后的 data → 输出音频 FileData(path/url,wav)
 *   4. 下载音频字节
 * ⚠ 本地 CPU/beam 较慢(实测一句 ~100s+),故 num_beams=1 提速,超时给足。
 */

/** Gradio 输出常包一层 { value: ... },拆掉 */
function pick<T = Record<string, unknown>>(x: unknown): T {
  const o = x as { value?: unknown } | null;
  return (o && o.value !== undefined ? o.value : x) as T;
}

interface GradioFileData {
  path?: string;
  url?: string;
}

/** 调一个 Gradio 命名端点(call → SSE 取 complete 结果);timeoutMs 覆盖慢速本地合成 */
async function gradioCall(
  base: string,
  fn: string,
  data: unknown[],
  timeoutMs: number,
): Promise<unknown[]> {
  const post = await fetch(`${base}/gradio_api/call/${fn}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data }),
  });
  if (!post.ok) throw new Error(`IndexTTS2 调用 ${fn} 失败:HTTP ${post.status}`);
  const { event_id: eventId } = (await post.json()) as { event_id?: string };
  if (!eventId) throw new Error(`IndexTTS2 调用 ${fn} 未返回 event_id`);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let txt: string;
  try {
    const sse = await fetch(`${base}/gradio_api/call/${fn}/${eventId}`, { signal: ctrl.signal });
    txt = await sse.text(); // 连接持续到 complete 才关
  } finally {
    clearTimeout(timer);
  }

  const lines = txt.split('\n');
  let result: unknown[] | null = null;
  for (let i = 0; i < lines.length; i++) {
    const ev = lines[i].trim();
    if (ev === 'event: error' || ev === 'event:error') {
      const dl = (lines[i + 1] || '').replace(/^data:\s*/, '').trim();
      throw new Error(`IndexTTS2 ${fn} 报错:${dl.slice(0, 200)}`);
    }
    if ((ev === 'event: complete' || ev === 'event:complete') && (lines[i + 1] || '').startsWith('data:')) {
      result = JSON.parse(lines[i + 1].replace(/^data:\s*/, '').trim()) as unknown[];
    }
  }
  if (!result) {
    // 兜底:取最后一个能解析的 data 行
    for (const l of lines) {
      if (l.startsWith('data:')) {
        try {
          result = JSON.parse(l.replace(/^data:\s*/, '').trim()) as unknown[];
        } catch {
          /* ignore */
        }
      }
    }
  }
  if (!result) throw new Error(`IndexTTS2 ${fn} 未返回结果`);
  return result;
}

async function gradioUpload(base: string, buffer: Buffer, name: string): Promise<string> {
  const fd = new FormData();
  // 拷进独立 ArrayBuffer(满足 Blob 的 BlobPart 类型;避免 Node Buffer 的 ArrayBufferLike 不兼容)
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  fd.append('files', new Blob([ab]), name);
  const r = await fetch(`${base}/gradio_api/upload`, { method: 'POST', body: fd });
  if (!r.ok) throw new Error(`IndexTTS2 上传参考音频失败:HTTP ${r.status}`);
  const paths = (await r.json()) as string[] | string;
  const p = Array.isArray(paths) ? paths[0] : paths;
  if (!p) throw new Error('IndexTTS2 上传参考音频未返回路径');
  return p;
}

/**
 * 用 IndexTTS2 合成语音。ref 给定 = 克隆该音色;否则用 IndexTTS2 自带示例音色(开箱即用)。
 * 返回 wav 字节。
 */
export async function synthesizeWithIndexTts2(
  base: string,
  text: string,
  ref?: { buffer: Buffer; name: string },
  controlInstruction = '',
): Promise<{ buffer: Buffer; ext: string; mime: string }> {
  let refPath: string;
  if (ref) {
    refPath = await gradioUpload(base, ref.buffer, ref.name || 'voice-ref.wav');
  } else {
    // 无用户参考音 → 取自带示例音色(on_example_click[0] 的音色参考音频)
    const ex = await gradioCall(base, 'on_example_click', [0], 30_000);
    const fd = pick<GradioFileData>(ex[0]);
    if (!fd?.path) {
      throw new Error('IndexTTS2 无可用参考音频:请在「解说员设置」上传音色参考音频');
    }
    refPath = fd.path;
  }

  // 有控制指令则切「情感描述文本」模式,把指令填进情感描述槽;否则跟随音色参考音频
  const hasCtrl = !!controlInstruction.trim();
  // gen_single 24 个入参(顺序见 /gradio_api/info);num_beams=1 提速;其余取默认
  const out = await gradioCall(
    base,
    'gen_single',
    [
      hasCtrl ? '使用情感描述文本控制' : '与音色参考音频相同', // 情感控制方式(标签按标准 IndexTTS2;不同构建若异需调整)
      { path: refPath, meta: { _type: 'gradio.FileData' } }, // 音色参考音频
      text, // 文本
      null, // 情感参考音频
      0.65, // 情感权重
      0, 0, 0, 0, 0, 0, 0, 0, // 喜/怒/哀/惧/厌恶/低落/惊喜/平静
      hasCtrl ? controlInstruction.trim() : '', // 情感描述文本(= 播报风格控制指令)
      false, // 情感随机采样
      120, // 分句最大Token数
      true, // do_sample
      0.8, // top_p
      30, // top_k
      0.8, // temperature
      0, // length_penalty
      1, // num_beams(默认 3,降到 1 提速)
      10, // repetition_penalty
      1500, // max_mel_tokens
    ],
    280_000,
  );

  const audioFd = pick<GradioFileData>(out[0]);
  const url =
    audioFd?.url || (audioFd?.path ? `${base}/gradio_api/file=${encodeURIComponent(audioFd.path)}` : null);
  if (!url) throw new Error('IndexTTS2 未返回生成音频');
  const dl = await fetch(url);
  if (!dl.ok) throw new Error(`下载 IndexTTS2 音频失败:HTTP ${dl.status}`);
  const buffer = Buffer.from(await dl.arrayBuffer());
  if (!buffer.length) throw new Error('IndexTTS2 返回的音频为空');
  return { buffer, ext: 'wav', mime: 'audio/wav' };
}
