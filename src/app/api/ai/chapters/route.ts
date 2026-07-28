import { NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { chaptersPrompt } from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/provider";
import { getDb } from "@/lib/db";
import { chapters } from "@/lib/db/schema";
import { getOwnedTopic, listChapters, touchTopic } from "@/lib/db/queries";
import { requireOwnerId } from "@/lib/owner";

const chaptersSchema = z.object({
  chapters: z
    .array(
      z.object({
        title: z.string(),
        summary: z.string(),
      }),
    )
    .min(1),
});

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
    const { output } = await generateText({
      model: getLanguageModel(topic.modelId),
      output: Output.object({ schema: chaptersSchema }),
      prompt: chaptersPrompt({
        title: topic.title,
        current: existing.map((c) => ({
          title: c.title,
          summary: c.summary,
        })),
        feedback: body.feedback?.trim() || undefined,
      }),
    });

    if (!output) {
      return NextResponse.json({ error: "模型未返回有效章节" }, { status: 502 });
    }

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

    const rows = await listChapters(topic.id);
    return NextResponse.json({ chapters: rows });
  } catch (e) {
    const message = e instanceof Error ? e.message : "生成章节失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
