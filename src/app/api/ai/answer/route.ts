import { NextResponse } from "next/server";
import { generateText } from "ai";
import { eq } from "drizzle-orm";
import { answerPrompt } from "@/lib/ai/prompts";
import { getAnswerModelRequest } from "@/lib/ai/provider";
import { getDb } from "@/lib/db";
import { chapters, questions } from "@/lib/db/schema";
import { getOwnedTopic, touchTopic } from "@/lib/db/queries";
import { requireOwnerId } from "@/lib/owner";

export async function POST(request: Request) {
  try {
    const ownerId = await requireOwnerId();
    const body = (await request.json()) as { questionId?: string };
    if (!body.questionId) {
      return NextResponse.json({ error: "缺少 questionId" }, { status: 400 });
    }

    const db = getDb();
    const [row] = await db
      .select({
        question: questions,
        chapter: chapters,
      })
      .from(questions)
      .innerJoin(chapters, eq(questions.chapterId, chapters.id))
      .where(eq(questions.id, body.questionId))
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "小题不存在" }, { status: 404 });
    }

    const topic = await getOwnedTopic(row.chapter.topicId, ownerId);
    if (!topic) {
      return NextResponse.json({ error: "主题不存在" }, { status: 404 });
    }

    const { model } = getAnswerModelRequest();
    const { text } = await generateText({
      model,
      prompt: answerPrompt({
        topicTitle: topic.title,
        chapterTitle: row.chapter.title,
        stem: row.question.stem,
      }),
    });

    const [updated] = await db
      .update(questions)
      .set({ answer: text.trim() })
      .where(eq(questions.id, row.question.id))
      .returning();

    await touchTopic(topic.id);
    return NextResponse.json({ question: updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : "生成答案失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
