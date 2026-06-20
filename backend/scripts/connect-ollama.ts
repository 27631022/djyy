/**
 * 一键把「本地 Ollama(gemma)」接入平台,用于发票 AI 识别。
 *
 * 跑法(在 backend 目录):
 *   npx tsx scripts/connect-ollama.ts
 * 可选环境变量:
 *   OLLAMA_URL=http://localhost:11434   # Ollama 地址(默认本机)
 *   OLLAMA_MODEL=gemma3:4b              # 指定模型标签(默认自动挑一个 gemma 视觉模型)
 *
 * 做的事:
 *   1. 探测 Ollama,列出已装模型,挑一个 gemma(优先有视觉能力的)
 *   2. 在 ExternalApi 里登记/更新 provider「ollama」(kind=internal,无需 Key)
 *   3. 把「报送管理 · AI 识别发票图片」(consumerKey=report.invoice.extract.vision)绑定到它
 *   4. 发一条最小请求测试连通
 *
 * 设置后立即生效(后端读 DB 实时,无需重启)。可在「系统设置 → AI 接入管理」看到这条记录。
 * ⚠ 若后端(3001)正在跑且报「database is locked」,重试一次或先停下 3001 再跑。
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const OLLAMA = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/+$/, '');
const FORCE_MODEL = process.env.OLLAMA_MODEL;

interface OllamaTag {
  name: string;
  size?: number;
  details?: { family?: string; parameter_size?: string };
}

async function main() {
  // 1) 探测 Ollama
  let models: OllamaTag[] = [];
  try {
    const r = await axios.get<{ models?: OllamaTag[] }>(`${OLLAMA}/api/tags`, { timeout: 5000 });
    models = r.data?.models ?? [];
  } catch {
    console.error(
      `✗ 连不上 Ollama(${OLLAMA})。请确认 Ollama 已启动(命令行 \`ollama serve\`,或 Ollama 桌面端在运行),` +
        `再重试。也可用 OLLAMA_URL 指定地址。`,
    );
    process.exit(1);
  }
  if (models.length === 0) {
    console.error('✗ Ollama 里没有已安装的模型。请先拉一个有视觉能力的 gemma,如:`ollama pull gemma3:4b`');
    process.exit(1);
  }
  console.log(`Ollama @ ${OLLAMA} 已安装模型:`);
  models.forEach((m) =>
    console.log(`  - ${m.name}  (${m.details?.family ?? '?'}, ${m.details?.parameter_size ?? '?'}, ${((m.size ?? 0) / 1e9).toFixed(2)}GB)`),
  );

  // 2) 挑模型:优先 gemma 且非 1b(1b 纯文本无视觉);可用 OLLAMA_MODEL 指定
  const names = models.map((m) => m.name);
  let model = FORCE_MODEL && names.includes(FORCE_MODEL) ? FORCE_MODEL : '';
  if (!model) {
    const gemmas = names.filter((n) => /gemma/i.test(n));
    const visionable = gemmas.filter((n) => !/[:\-_]1b\b/i.test(n));
    model = visionable.find((n) => /gemma3/i.test(n)) || visionable[0] || gemmas[0] || names[0];
  }
  if (FORCE_MODEL && model !== FORCE_MODEL)
    console.warn(`⚠ 指定的 OLLAMA_MODEL=${FORCE_MODEL} 不在已装列表,改用自动挑选。`);

  const textOnly = /[:\-_]1b\b/i.test(model);
  const capabilities = textOnly ? 'chat' : 'chat,vision';
  console.log(`\n选用模型:${model}   能力:${capabilities}`);
  if (textOnly)
    console.warn(
      '⚠ 该模型疑似纯文本(1b),不支持「图片发票」识别,只能识别「可复制文本的 PDF 发票」。' +
        '要识别拍照/扫描发票,请装带视觉的 gemma3(如 `ollama pull gemma3:4b`)后重跑本脚本。',
    );

  // 3) 登记 provider + 4) 绑定消费功能
  const prisma = new PrismaClient();
  const apiUrl = `${OLLAMA}/v1`;
  try {
    await prisma.externalApi.upsert({
      where: { provider: 'ollama' },
      create: {
        provider: 'ollama',
        kind: 'internal',
        iconRef: 'lucide:Server',
        name: '本地 Ollama',
        description: '内网本地模型(Ollama),用于发票 AI 识别等。kind=internal,无需 Key。',
        apiUrl,
        model,
        visionModel: model,
        capabilities,
        priority: 90,
        active: true,
      },
      update: { kind: 'internal', apiUrl, model, visionModel: model, capabilities, active: true },
    });
    console.log(`✓ 已登记/更新 provider「ollama」→ ${apiUrl}(model=${model})`);

    await prisma.aiRoute.upsert({
      where: { consumerKey: 'report.invoice.extract.vision' },
      create: { consumerKey: 'report.invoice.extract.vision', provider: 'ollama' },
      update: { provider: 'ollama' },
    });
    console.log('✓ 已把「报送管理 · AI 识别发票图片」绑定到 ollama');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`✗ 写入数据库失败:${msg}`);
    if (/locked/i.test(msg)) console.error('  → SQLite 被占用,重试一次,或先停掉后端(3001)再跑。');
    await prisma.$disconnect();
    process.exit(1);
  }

  // 5) 连通测试(最小 chat)
  try {
    const t = await axios.post(
      `${apiUrl}/chat/completions`,
      { model, messages: [{ role: 'user', content: '只回复两个字:在线' }], stream: false, temperature: 0 },
      { timeout: 60000 },
    );
    const reply = String(t.data?.choices?.[0]?.message?.content ?? '').trim().slice(0, 60);
    console.log(`✓ 连通测试 OK,模型回复:「${reply || '(空)'}」`);
  } catch (e) {
    const err = e as { response?: { data?: unknown }; message?: string };
    console.warn(
      `⚠ 连通测试失败(provider 已登记好,可稍后在「AI 接入管理」点测试):` +
        `${err.message ?? ''} ${err.response?.data ? JSON.stringify(err.response.data).slice(0, 200) : ''}`,
    );
  }

  await prisma.$disconnect();
  console.log('\n完成 ✅  到「报送 → 我的待办 → 录入发票」,上传发票图片点「AI 识别发票并自动填写」即走本地 gemma。');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
