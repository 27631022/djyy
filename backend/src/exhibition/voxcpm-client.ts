/**
 * VoxCPM(本地 Gradio 服务,默认端口 8808)语音合成客户端。
 *
 * VoxCPM 是 ModelBest/OpenBMB 的 TTS:给文本(可选音色参考音频)合成语音。
 * 通过 Gradio HTTP API 调用(协议同 IndexTTS2,实测 `/gradio_api/info` 的 `/generate` 端点):
 *   1.(可选)上传音色参考音频:POST {base}/gradio_api/upload(multipart,字段 files)→ 临时路径
 *   2. 提交合成:POST {base}/gradio_api/call/generate { data:[...] } → { event_id }
 *   3. 取结果:GET {base}/gradio_api/call/generate/{event_id}(SSE,持续到 complete)→ 输出 Audio FileData
 *   4. 下载音频字节(wav)
 *
 * `/generate` 入参顺序(见 /gradio_api/info):
 *   [0]text [1]control_instruction [2]ref_wav(Audio) [3]use_prompt_text [4]prompt_text_value
 *   [5]cfg_value(=2) [6]do_normalize [7]denoise [8]dit_steps(=10)
 * 无音色参考音频时 ref_wav=null(VoxCPM 用默认音色);给定则零样本克隆该音色。
 * ⚠ 本地推理可能较慢,超时给足。
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
  if (!post.ok) throw new Error(`VoxCPM 调用 ${fn} 失败:HTTP ${post.status}`);
  const { event_id: eventId } = (await post.json()) as { event_id?: string };
  if (!eventId) throw new Error(`VoxCPM 调用 ${fn} 未返回 event_id`);

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
      throw new Error(`VoxCPM ${fn} 报错:${dl.slice(0, 200)}`);
    }
    if ((ev === 'event: complete' || ev === 'event:complete') && (lines[i + 1] || '').startsWith('data:')) {
      result = JSON.parse(lines[i + 1].replace(/^data:\s*/, '').trim()) as unknown[];
    }
  }
  if (!result) {
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
  if (!result) throw new Error(`VoxCPM ${fn} 未返回结果`);
  return result;
}

async function gradioUpload(base: string, buffer: Buffer, name: string): Promise<string> {
  const fd = new FormData();
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  fd.append('files', new Blob([ab]), name);
  const r = await fetch(`${base}/gradio_api/upload`, { method: 'POST', body: fd });
  if (!r.ok) throw new Error(`VoxCPM 上传参考音频失败:HTTP ${r.status}`);
  const paths = (await r.json()) as string[] | string;
  const p = Array.isArray(paths) ? paths[0] : paths;
  if (!p) throw new Error('VoxCPM 上传参考音频未返回路径');
  return p;
}

/**
 * 用 VoxCPM 合成语音。ref 给定 = 克隆该音色;否则用 VoxCPM 默认音色。返回 wav 字节。
 */
export async function synthesizeWithVoxcpm(
  base: string,
  text: string,
  ref?: { buffer: Buffer; name: string },
): Promise<{ buffer: Buffer; ext: string; mime: string }> {
  let refWav: { path: string; meta: { _type: 'gradio.FileData' } } | null = null;
  if (ref) {
    const refPath = await gradioUpload(base, ref.buffer, ref.name || 'voice-ref.wav');
    refWav = { path: refPath, meta: { _type: 'gradio.FileData' } };
  }

  // /generate 入参(顺序见 /gradio_api/info);多数取默认,dit_steps=10 / cfg_value=2
  const out = await gradioCall(
    base,
    'generate',
    [
      text, // text
      '', // control_instruction
      refWav, // ref_wav(无则 null,用默认音色)
      false, // use_prompt_text
      '', // prompt_text_value(参考音频转写,留空)
      2, // cfg_value
      true, // do_normalize(文本规整:数字/符号读得更准)
      false, // denoise
      10, // dit_steps
    ],
    280_000,
  );

  const audioFd = pick<GradioFileData>(out[0]);
  const url =
    audioFd?.url || (audioFd?.path ? `${base}/gradio_api/file=${encodeURIComponent(audioFd.path)}` : null);
  if (!url) throw new Error('VoxCPM 未返回生成音频');
  const dl = await fetch(url);
  if (!dl.ok) throw new Error(`下载 VoxCPM 音频失败:HTTP ${dl.status}`);
  const buffer = Buffer.from(await dl.arrayBuffer());
  if (!buffer.length) throw new Error('VoxCPM 返回的音频为空');
  return { buffer, ext: 'wav', mime: 'audio/wav' };
}
