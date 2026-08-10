import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  Output,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import type { z } from "zod";
import { getModelRequest } from "@/lib/ai/provider";
import { agentTools } from "@/lib/ai/tools";

export type AgentDataParts = {
  chapters: unknown;
  questions: unknown;
  error: { message: string };
};

export type AgentUIMessage = UIMessage<never, AgentDataParts>;

type CreateAgentStreamOptions<TSchema extends z.ZodType> = {
  modelId: string | null | undefined;
  prompt: string;
  schema: TSchema;
  /** Custom data part name written after persistence */
  resultKey: "chapters" | "questions";
  persist: (output: z.infer<TSchema>) => Promise<unknown>;
};

/**
 * Run a search+thinking agent and stream UI message parts.
 * Persists structured output when the loop finishes, then emits a data-* part.
 *
 * Uses Output.json() (not Output.object) because DeepSeek lacks native
 * json_schema support; Zod validates the result after the stream completes.
 */
export function createAgentStreamResponse<TSchema extends z.ZodType>(
  options: CreateAgentStreamOptions<TSchema>,
): Response {
  const { model, providerOptions } = getModelRequest(options.modelId);

  const stream = createUIMessageStream<AgentUIMessage>({
    execute: async ({ writer }) => {
      try {
        const result = streamText({
          model,
          providerOptions,
          tools: agentTools,
          stopWhen: stepCountIs(8),
          output: Output.json(),
          prompt: options.prompt,
        });

        writer.merge(
          toUIMessageStream({
            stream: result.stream,
            tools: agentTools,
            sendReasoning: true,
            onError: (error) =>
              error instanceof Error ? error.message : "工具执行失败",
          }),
        );

        const raw = await result.output;
        const parsed = options.schema.safeParse(
          raw ?? extractJsonObject(await result.text),
        );

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
