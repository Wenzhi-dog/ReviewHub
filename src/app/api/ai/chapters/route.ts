import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createAgentStreamResponse } from "@/lib/ai/agent-stream";
import { chaptersPrompt } from "@/lib/ai/prompts";
import { chaptersSchema } from "@/lib/ai/schemas";
import { chooseGenerationModel } from "@/lib/ai/select-model";
import { getDb } from "@/lib/db";
import { chapters } from "@/lib/db/schema";
import { getOwnedTopic, listChapters, touchTopic } from "@/lib/db/queries";
import { requireOwnerId } from "@/lib/owner";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const ownerId = await requireOwnerId();
    const body = (await request.json()) as {
      topicId?: string;
      feedback?: string;
    };
    if (!body.topicId) {
      return NextResponse.json({ error: "缺少 topicId" }, { status: 400 });
    }

    const topic = await getOwnedTopic(body.topicId, ownerId);
    if (!topic) {
      return NextResponse.json({ error: "主题不存在" }, { status: 404 });
    }
    if (topic.status !== "chapters") {
      return NextResponse.json(
        { error: "当前主题不在章节编辑阶段" },
        { status: 400 },
      );
    }

    const existing = await listChapters(topic.id);
    const { apiModel } = await chooseGenerationModel({
      kind: "chapters",
      topicTitle: topic.title,
    });

    return createAgentStreamResponse({
      apiModel,
      schema: chaptersSchema,
      resultKey: "chapters",
      prompt: chaptersPrompt({
        title: topic.title,
        current: existing.map((c) => ({
          title: c.title,
          summary: c.summary,
        })),
        feedback: body.feedback?.trim() || undefined,
      }),
      persist: async (output) => {
        const db = getDb();
        await db.delete(chapters).where(eq(chapters.topicId, topic.id));
        await db.insert(chapters).values(
          output.chapters.map((c, i) => ({
            topicId: topic.id,
            title: c.title.trim(),
            summary: c.summary.trim(),
            sortOrder: i,
          })),
        );
        await touchTopic(topic.id);
        return listChapters(topic.id);
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "生成章节失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
