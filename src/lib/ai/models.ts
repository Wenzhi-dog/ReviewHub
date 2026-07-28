/**
 * User-facing model catalog. Add new entries here when supporting more providers.
 * `id` is stored on topics.model_id; server resolves it via getLanguageModel().
 */
export type AiProviderId = "deepseek";

export type ModelOption = {
  id: string;
  label: string;
  description: string;
  provider: AiProviderId;
  /** Model name sent to the provider API */
  apiModel: string;
};

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: "deepseek/deepseek-chat",
    label: "DeepSeek Chat",
    description: "通用对话，适合拆章节与出题",
    provider: "deepseek",
    apiModel: "deepseek-chat",
  },
  {
    id: "deepseek/deepseek-reasoner",
    label: "DeepSeek Reasoner",
    description: "更强推理，适合难题答案",
    provider: "deepseek",
    apiModel: "deepseek-reasoner",
  },
];

export const DEFAULT_MODEL_ID = MODEL_OPTIONS[0]!.id;

export function isValidModelId(id: string | null | undefined): id is string {
  return !!id && MODEL_OPTIONS.some((m) => m.id === id);
}

export function resolveModelOption(id: string | null | undefined): ModelOption {
  if (isValidModelId(id)) {
    return MODEL_OPTIONS.find((m) => m.id === id)!;
  }
  return MODEL_OPTIONS.find((m) => m.id === DEFAULT_MODEL_ID)!;
}

export function getModelLabel(id: string | null | undefined): string {
  return resolveModelOption(id).label;
}
