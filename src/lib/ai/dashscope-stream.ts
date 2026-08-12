import {
  normalizeSearchSources,
  type SearchSource,
} from "@/lib/ai/search-source";

export type DashScopeStreamChunk = {
  reasoningDelta?: string;
  textDelta?: string;
  sources?: SearchSource[];
};

/**
 * Qwen3.5+ Plus/Flash (and VL) are multimodal on DashScope native API.
 * Calling text-generation with them returns: url error, please check url!
 */
export function isDashScopeMultimodalModel(apiModel: string): boolean {
  const id = apiModel.toLowerCase();
  if (id.includes("-vl") || id.includes("omni")) return true;
  // qwen3.5 / qwen3.6 / qwen3.7 / qwen3.8 plus & flash families
  return /^qwen3\.[5-9]/.test(id) && /(plus|flash)/.test(id);
}

/**
 * Resolve native DashScope generation URL from DASHSCOPE_BASE_URL (compatible-mode)
 * or the Beijing default host.
 */
export function getDashScopeGenerationUrl(apiModel: string): string {
  const path = isDashScopeMultimodalModel(apiModel)
    ? "/api/v1/services/aigc/multimodal-generation/generation"
    : "/api/v1/services/aigc/text-generation/generation";

  const configured = process.env.DASHSCOPE_BASE_URL?.trim();
  if (configured) {
    try {
      const origin = new URL(configured).origin;
      return `${origin}${path}`;
    } catch {
      /* fall through */
    }
  }
  return `https://dashscope.aliyuncs.com${path}`;
}

type StreamDashScopeOptions = {
  apiModel: string;
  prompt: string;
  enableSearch?: boolean;
  enableThinking?: boolean;
  signal?: AbortSignal;
};

/**
 * Stream DashScope native generation with optional web search + thinking.
 * OpenAI-compatible Chat Completions cannot return search_info; native API can.
 */
export async function* streamDashScopeGeneration(
  options: StreamDashScopeOptions,
): AsyncGenerator<DashScopeStreamChunk> {
  const apiKey = process.env.DASHSCOPE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("缺少 DASHSCOPE_API_KEY，请在环境变量中配置。");
  }

  const enableSearch = options.enableSearch ?? false;
  const enableThinking = options.enableThinking ?? true;
  const multimodal = isDashScopeMultimodalModel(options.apiModel);

  const res = await fetch(getDashScopeGenerationUrl(options.apiModel), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-DashScope-SSE": "enable",
    },
    body: JSON.stringify({
      model: options.apiModel,
      input: {
        messages: [
          {
            role: "user",
            // Multimodal endpoint requires content as [{ text }]
            content: multimodal
              ? [{ text: options.prompt }]
              : options.prompt,
          },
        ],
      },
      parameters: {
        result_format: "message",
        incremental_output: true,
        enable_thinking: enableThinking,
        ...(enableSearch
          ? {
              enable_search: true,
              search_options: {
                search_strategy: "agent",
                enable_source: true,
                prepend_search_result: true,
              },
            }
          : {}),
      },
    }),
    signal: options.signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      parseDashScopeError(errText) ||
        `DashScope 请求失败（${res.status}）`,
    );
  }

  if (!res.body) {
    throw new Error("DashScope 响应无正文流");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let emittedSources = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) >= 0) {
      const rawEvent = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);

      const dataLines: string[] = [];
      for (const line of rawEvent.split("\n")) {
        const trimmed = line.trimEnd();
        if (trimmed.startsWith("data:")) {
          dataLines.push(trimmed.slice(5).trim());
        }
      }
      if (dataLines.length === 0) continue;
      const payload = dataLines.join("\n");
      if (!payload || payload === "[DONE]") continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }

      const chunk = mapDashScopePayload(parsed, { emittedSources });
      if (chunk.sources?.length) emittedSources = true;
      if (
        chunk.reasoningDelta ||
        chunk.textDelta ||
        (chunk.sources && chunk.sources.length > 0)
      ) {
        yield chunk;
      }
    }
  }
}

function extractMessageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const item of content) {
    if (typeof item === "string") {
      parts.push(item);
      continue;
    }
    if (item && typeof item === "object") {
      const row = item as Record<string, unknown>;
      if (typeof row.text === "string") parts.push(row.text);
    }
  }
  return parts.join("");
}

function mapDashScopePayload(
  parsed: unknown,
  state: { emittedSources: boolean },
): DashScopeStreamChunk {
  if (!parsed || typeof parsed !== "object") return {};
  const root = parsed as Record<string, unknown>;

  if (typeof root.code === "string" && root.code && root.code !== "Success") {
    throw new Error(
      typeof root.message === "string" ? root.message : "DashScope 调用失败",
    );
  }

  const output = root.output as Record<string, unknown> | undefined;
  if (!output) return {};

  const out: DashScopeStreamChunk = {};

  if (!state.emittedSources) {
    const searchInfo = output.search_info as
      | { search_results?: unknown }
      | undefined;
    const sources = normalizeSearchSources(searchInfo?.search_results);
    if (sources.length > 0) {
      out.sources = sources;
    }
  }

  const choices = output.choices as unknown[] | undefined;
  const first = choices?.[0] as Record<string, unknown> | undefined;
  const message = first?.message as Record<string, unknown> | undefined;
  if (!message) return out;

  const reasoning =
    typeof message.reasoning_content === "string"
      ? message.reasoning_content
      : "";
  const content = extractMessageText(message.content);

  if (reasoning) out.reasoningDelta = reasoning;
  if (content) out.textDelta = content;
  return out;
}

function parseDashScopeError(body: string): string | undefined {
  if (!body.trim()) return undefined;
  try {
    const json = JSON.parse(body) as {
      message?: string;
      code?: string;
      error?: { message?: string };
    };
    return (
      json.message ||
      json.error?.message ||
      (json.code ? `DashScope 错误：${json.code}` : undefined)
    );
  } catch {
    return body.slice(0, 200);
  }
}
