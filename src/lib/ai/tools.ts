import { tool } from "ai";
import { z } from "zod";
import { searchWeb } from "@/lib/ai/search";

export const agentTools = {
  webSearch: tool({
    description:
      "搜索与主题相关的文档、教程、权威资料。可多次调用，从不同角度检索。",
    inputSchema: z.object({
      query: z.string().describe("搜索关键词或短语"),
      maxResults: z
        .number()
        .optional()
        .describe("返回条数，默认 5，最多 10"),
    }),
    execute: async ({ query, maxResults }) => searchWeb(query, maxResults ?? 5),
  }),
};

export type AgentTools = typeof agentTools;
