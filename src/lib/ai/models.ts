/**
 * Internal Qwen model catalog. Tier is chosen automatically for chapters/questions;
 * answers always use the flash model.
 */

export type QwenTier = "simple" | "high";

export const QWEN_MODELS = {
  /** 简单任务 / 答案 */
  simple: "qwen3.7-flash",
  /** 复杂章节拆分与出题 */
  high: "qwen3.7-plus",
  /** 生成答案固定使用 */
  answer: "qwen3.7-flash",
} as const;

export type QwenApiModel =
  (typeof QWEN_MODELS)[keyof typeof QWEN_MODELS];

/** Stored on topics.model_id for legacy rows; generation no longer reads user choice. */
export const DEFAULT_MODEL_ID = QWEN_MODELS.simple;

export function apiModelForTier(tier: QwenTier): QwenApiModel {
  return tier === "high" ? QWEN_MODELS.high : QWEN_MODELS.simple;
}
