// 注意:Module 导出必须放最后(barrel 加载顺序约定,详见 auth/index.ts)。
export { ExternalApiService } from './external-api.service';
export type { ExternalApiPublic } from './external-api.service';
export { LlmClientService } from './llm-client.service';
export type { ChatJsonResult } from './llm-client.service';
export { ExternalApiModule } from './external-api.module';
