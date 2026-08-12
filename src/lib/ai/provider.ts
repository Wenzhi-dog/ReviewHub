import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import type { QwenApiModel } from "@/lib/ai/models";
import { QWEN_MODELS } from "@/lib/ai/models";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) {
    throw new Error(`缺少 ${name}，请在环境变量中配置。`);
  }
  return value.trim();
}

export type ModelRequestConfig = {
  model: LanguageModel;
};

export type GetModelRequestOptions = {
  /** Enable Qwen built-in web search (chapters / questions). */
  enableSearch?: boolean;
  /** Enable thinking/reasoning stream. Defaults to true. */
  enableThinking?: boolean;
};

/**
 * Resolve a concrete Qwen API model (OpenAI-compatible Chat Completions).
 * Used for answer generation and model routing — not for agent search citations
 * (compatible-mode cannot return search_info; see dashscope-stream.ts).
 *
 * DashScope extras (enable_search / enable_thinking) are injected via
 * transformRequestBody because openai-compatible strips unknown providerOptions.
 */
export function getModelRequest(
  apiModel: QwenApiModel | string,
  options: GetModelRequestOptions = {},
): ModelRequestConfig {
  const enableSearch = options.enableSearch ?? false;
  const enableThinking = options.enableThinking ?? true;

  const qwen = createOpenAICompatible({
    name: "qwen",
    apiKey: requireEnv("DASHSCOPE_API_KEY"),
    baseURL:
      process.env.DASHSCOPE_BASE_URL?.trim() ||
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
    transformRequestBody: (body) => ({
      ...body,
      enable_thinking: enableThinking,
      ...(enableSearch
        ? {
            enable_search: true,
            search_options: { search_strategy: "agent" },
          }
        : {}),
    }),
  });

  return { model: qwen.chatModel(apiModel) };
}

/** Shortcut for answer generation (always flash, no search). */
export function getAnswerModelRequest(): ModelRequestConfig {
  return getModelRequest(QWEN_MODELS.answer, {
    enableSearch: false,
    enableThinking: true,
  });
}
