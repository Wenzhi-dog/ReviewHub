import { createDeepSeek } from "@ai-sdk/deepseek";
import type { LanguageModel } from "ai";
import { resolveModelOption, type AiProviderId } from "@/lib/ai/models";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) {
    throw new Error(`缺少 ${name}，请在环境变量中配置。`);
  }
  return value.trim();
}

const providerFactories: Record<
  AiProviderId,
  (apiModel: string) => LanguageModel
> = {
  deepseek: (apiModel) => {
    const deepseek = createDeepSeek({
      apiKey: requireEnv("DEEPSEEK_API_KEY"),
    });
    // Official provider uses json_object (not json_schema) for structured output.
    return deepseek.chat(apiModel);
  },
  // Future: openai, anthropic, etc.
};

/** Resolve a LanguageModel from a catalog model id (e.g. deepseek/deepseek-chat). */
export function getLanguageModel(modelId: string | null | undefined): LanguageModel {
  const option = resolveModelOption(modelId);
  const factory = providerFactories[option.provider];
  if (!factory) {
    throw new Error(`未支持的模型提供商：${option.provider}`);
  }
  return factory(option.apiModel);
}
