import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import { ExternalApiService } from './external-api.service';

export interface ChatJsonResult {
  raw: string;
  promptTokens?: number;
  completionTokens?: number;
  provider: string;
  model: string;
  webSearch: boolean;
}

function isTimeout(err: AxiosError): boolean {
  return err.code === 'ECONNABORTED' || /timeout/i.test(err.message);
}

/**
 * 通用 LLM 调用(OpenAI 兼容 /chat/completions,JSON 模式)——泛化自 task/assessment 的 callLlm,
 * 额外提供 `enableWebSearch`(按 provider 注入联网参数,如千问 enable_search)。
 * 放在 @Global 的 external-api 模块内,业务模块直接注入复用(既有 task/assessment/report 三处复制暂不迁移)。
 */
@Injectable()
export class LlmClientService {
  private readonly logger = new Logger(LlmClientService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly externalApi: ExternalApiService,
  ) {}

  async chatJson(opts: {
    consumerKey: string;
    systemPrompt: string;
    userContent: string;
    temperature?: number;
    timeoutMs?: number;
    /** true 且该模型开了联网(cfg.webSearch)时,按 provider 注入联网搜索参数 */
    enableWebSearch?: boolean;
    /** 透传给 /chat/completions body 的额外字段(优先级低于上面自动注入的联网参数) */
    extraBody?: Record<string, unknown>;
  }): Promise<ChatJsonResult> {
    const cfg = await this.externalApi.getConfigForConsumer(opts.consumerKey);
    if (!cfg) {
      throw new ServiceUnavailableException(
        'AI 服务未配置:请到「系统设置 → AI 接入管理」录入至少一个带 chat 能力的模型,或在「AI 提示词/模型路由」里给对应功能绑定一个。',
      );
    }
    const apiUrl =
      cfg.apiUrl || this.config.get<string>('DEEPSEEK_API_URL') || 'https://api.deepseek.com';
    const model = cfg.model || this.config.get<string>('DEEPSEEK_MODEL') || 'deepseek-v4-flash';
    const timeoutMs = opts.timeoutMs ?? Number(this.config.get<string>('DEEPSEEK_TIMEOUT_MS') ?? '110000');

    const body: Record<string, unknown> = {
      // extraBody 先展开,固定字段后置**覆盖它** —— extraBody 不能篡改 model/messages/response_format(防调用方 footgun)
      ...(opts.extraBody ?? {}),
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: opts.systemPrompt },
        { role: 'user', content: opts.userContent },
      ],
      temperature: opts.temperature ?? 0.1,
    };
    // 联网:目前支持千问(DashScope OpenAI 兼容模式的 enable_search);豆包联网走 bot API,暂不支持。
    if (opts.enableWebSearch && cfg.webSearch && cfg.provider === 'qwen') {
      body.enable_search = true;
    }

    try {
      const resp = await axios.post(`${apiUrl.replace(/\/+$/, '')}/chat/completions`, body, {
        headers: {
          'Content-Type': 'application/json',
          ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
        },
        timeout: timeoutMs,
      });
      return {
        raw: String(resp.data?.choices?.[0]?.message?.content ?? ''),
        promptTokens: resp.data?.usage?.prompt_tokens,
        completionTokens: resp.data?.usage?.completion_tokens,
        provider: cfg.provider,
        model,
        webSearch: !!body.enable_search,
      };
    } catch (e) {
      const err = e as AxiosError<{ error?: { message?: string } }>;
      const detail = err.response?.data?.error?.message ?? err.message ?? '未知错误';
      this.logger.error(`LLM (${cfg.provider}) 调用失败: ${detail}`);
      if (isTimeout(err)) {
        throw new ServiceUnavailableException(
          `${cfg.provider}(${model})超时(${Math.round(timeoutMs / 1000)}s)。可在「AI 接入管理」换更快的模型。`,
        );
      }
      throw new ServiceUnavailableException(`${cfg.provider} 调用失败:${detail}`);
    }
  }
}
