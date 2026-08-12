import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai";
import type { z } from "zod";
import { streamDashScopeGeneration } from "@/lib/ai/dashscope-stream";
import type { SearchSource } from "@/lib/ai/search-source";

export type AgentDataParts = {
  chapters: unknown;
  questions: unknown;
  sources: SearchSource[];
  error: { message: string };
};

export type AgentUIMessage = UIMessage<never, AgentDataParts>;

type CreateAgentStreamOptions<TSchema extends z.ZodType> = {
  /** Concrete Qwen API model id */
  apiModel: string;
  prompt: string;
  schema: TSchema;
  /** Custom data part name written after persistence */
  resultKey: "chapters" | "questions";
  /** Enable Qwen built-in web search + source refs. Defaults to true. */
  enableSearch?: boolean;
  persist: (output: z.infer<TSchema>) => Promise<unknown>;
};

/**
 * Run a thinking agent (optional built-in web search) and stream UI message parts.
 * Uses DashScope native generation so search_info sources can be returned.
 * Persists structured output when finished, then emits a data-* part.
 *
 * Does NOT use response_format/json_object: DashScope rejects it together
 * with enable_search. We parse JSON from free text.
 */
export function createAgentStreamResponse<TSchema extends z.ZodType>(
  options: CreateAgentStreamOptions<TSchema>,
): Response {
  const enableSearch = options.enableSearch ?? true;

  const stream = createUIMessageStream<AgentUIMessage>({
    execute: async ({ writer }) => {
      const reasoningId = "reasoning";
      const textId = "text";
      let startedReasoning = false;
      let startedText = false;
      let text = "";
      let sourcesEmitted = false;

      try {
        for await (const chunk of streamDashScopeGeneration({
          apiModel: options.apiModel,
          prompt: options.prompt,
          enableSearch,
          enableThinking: true,
        })) {
          if (chunk.sources?.length && !sourcesEmitted) {
            writer.write({ type: "data-sources", data: chunk.sources });
            sourcesEmitted = true;
          }

          if (chunk.reasoningDelta) {
            if (!startedReasoning) {
              writer.write({ type: "reasoning-start", id: reasoningId });
              startedReasoning = true;
            }
            writer.write({
              type: "reasoning-delta",
              id: reasoningId,
              delta: chunk.reasoningDelta,
            });
          }

          if (chunk.textDelta) {
            if (!startedText) {
              writer.write({ type: "text-start", id: textId });
              startedText = true;
            }
            text += chunk.textDelta;
            writer.write({
              type: "text-delta",
              id: textId,
              delta: chunk.textDelta,
            });
          }
        }

        if (startedReasoning) {
          writer.write({ type: "reasoning-end", id: reasoningId });
        }
        if (startedText) {
          writer.write({ type: "text-end", id: textId });
        }

        let raw: unknown;
        try {
          raw = extractJsonObject(text);
        } catch {
          writer.write({
            type: "data-error",
            data: { message: "模型未返回有效 JSON" },
          });
          return;
        }

        const parsed = options.schema.safeParse(raw);
        if (!parsed.success) {
          writer.write({
            type: "data-error",
            data: { message: "模型未返回有效结构化结果" },
          });
          return;
        }

        const rows = await options.persist(parsed.data);
        if (options.resultKey === "chapters") {
          writer.write({ type: "data-chapters", data: rows });
        } else {
          writer.write({ type: "data-questions", data: rows });
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "Agent 生成失败";
        writer.write({ type: "data-error", data: { message } });
      }
    },
    onError: (error) =>
      error instanceof Error ? error.message : "Agent 流式出错",
  });

  return createUIMessageStreamResponse({ stream });
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("空响应");
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error("无法解析模型输出为 JSON");
  }
}
