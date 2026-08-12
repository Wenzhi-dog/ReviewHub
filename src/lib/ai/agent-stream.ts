import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import type { z } from "zod";
import { getModelRequest } from "@/lib/ai/provider";

export type AgentDataParts = {
  chapters: unknown;
  questions: unknown;
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
  persist: (output: z.infer<TSchema>) => Promise<unknown>;
};

/**
 * Run a thinking + built-in web-search agent and stream UI message parts.
 * Persists structured output when finished, then emits a data-* part.
 *
 * Does NOT use Output.json()/response_format: DashScope rejects json_object
 * together with enable_search (search agent). We parse JSON from free text.
 */
export function createAgentStreamResponse<TSchema extends z.ZodType>(
  options: CreateAgentStreamOptions<TSchema>,
): Response {
  const { model } = getModelRequest(options.apiModel, {
    enableSearch: true,
    enableThinking: true,
  });

  const stream = createUIMessageStream<AgentUIMessage>({
    execute: async ({ writer }) => {
      try {
        const result = streamText({
          model,
          prompt: options.prompt,
        });

        writer.merge(
          toUIMessageStream({
            stream: result.stream,
            sendReasoning: true,
            onError: (error) =>
              error instanceof Error ? error.message : "生成失败",
          }),
        );

        let text: string;
        try {
          text = await result.text;
        } catch (e) {
          const message =
            e instanceof Error ? e.message : "模型流式输出失败";
          writer.write({ type: "data-error", data: { message } });
          return;
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
