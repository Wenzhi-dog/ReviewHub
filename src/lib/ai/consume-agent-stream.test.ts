import { describe, expect, it, vi } from "vitest";
import { consumeAgentStream } from "@/lib/ai/consume-agent-stream";
import { sseResponse } from "@/test/helpers";

describe("consumeAgentStream", () => {
  it("throws on non-ok JSON error", async () => {
    const response = new Response(JSON.stringify({ error: "坏请求" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
    await expect(
      consumeAgentStream({ response, resultKey: "questions" }),
    ).rejects.toThrow("坏请求");
  });

  it("throws when body is missing", async () => {
    const response = new Response(null, { status: 200 });
    await expect(
      consumeAgentStream({ response, resultKey: "chapters" }),
    ).rejects.toThrow(/无正文/);
  });

  it("streams activity and returns result payload", async () => {
    const onActivity = vi.fn();
    const response = sseResponse([
      { type: "reasoning-delta", delta: "思考中" },
      {
        type: "data-sources",
        data: [{ title: "文档", url: "https://ex.com" }],
      },
      {
        type: "data-questions",
        data: [{ id: "q1", stem: "题干" }],
      },
    ]);

    const result = await consumeAgentStream<{ id: string; stem: string }[]>({
      response,
      resultKey: "questions",
      enableSearch: true,
      onActivity,
    });

    expect(result).toEqual([{ id: "q1", stem: "题干" }]);
    expect(onActivity).toHaveBeenCalled();
    const last = onActivity.mock.calls.at(-1)?.[0];
    expect(last.reasoning).toContain("思考中");
    expect(last.sources?.[0]?.url).toBe("https://ex.com");
  });

  it("surfaces stream data-error", async () => {
    const response = sseResponse([
      { type: "data-error", data: { message: "生成失败了" } },
    ]);
    await expect(
      consumeAgentStream({ response, resultKey: "chapters" }),
    ).rejects.toThrow("生成失败了");
  });
});
