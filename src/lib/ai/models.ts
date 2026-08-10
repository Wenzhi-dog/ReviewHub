/**
 * User-facing model catalog. Add new entries here when supporting more providers.
 * `id` is stored on topics.model_id; server resolves it via getModelRequest().
 */
export type AiProviderId = "deepseek";

export type DeepSeekThinking = "enabled" | "disabled";

export type ModelOption = {
  id: string;
  label: string;
  description: string;
  provider: AiProviderId;
  /** Model name sent to the provider API */
  apiModel: string;
  /** DeepSeek V4 thinking mode (request-level, not a separate model id) */
  thinking: DeepSeekThinking;
};

/** Legacy catalog ids → current V4 catalog ids */
const LEGACY_MODEL_IDS: Record<string, string> = {
  "deepseek/deepseek-chat": "deepseek/deepseek-v4-flash-thinking",
  "deepseek/deepseek-reasoner": "deepseek/deepseek-v4-flash-thinking",
  "deepseek/deepseek-v4-flash": "deepseek/deepseek-v4-flash-thinking",
};

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: "deepseek/deepseek-v4-flash-thinking",
    label: "DeepSeek V4 Flash Thinking",
    description: "开启思考链，适合难题答案",
    provider: "deepseek",
    apiModel: "deepseek-v4-flash",
    thinking: "enabled",
  },
  {
    id: "deepseek/deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    description: "更高质量，适合复杂推理",
    provider: "deepseek",
    apiModel: "deepseek-v4-pro",
    thinking: "enabled",
  },
];

export const DEFAULT_MODEL_ID = MODEL_OPTIONS[0]!.id;

export function normalizeModelId(id: string | null | undefined): string {
  if (!id) return DEFAULT_MODEL_ID;
  return LEGACY_MODEL_IDS[id] ?? id;
}

export function isValidModelId(id: string | null | undefined): id is string {
  if (!id) return false;
  const normalized = normalizeModelId(id);
  return MODEL_OPTIONS.some((m) => m.id === normalized);
}

export function resolveModelOption(id: string | null | undefined): ModelOption {
  const normalized = normalizeModelId(id);
  return (
    MODEL_OPTIONS.find((m) => m.id === normalized) ??
    MODEL_OPTIONS.find((m) => m.id === DEFAULT_MODEL_ID)!
  );
}

export function getModelLabel(id: string | null | undefined): string {
  return resolveModelOption(id).label;
}
