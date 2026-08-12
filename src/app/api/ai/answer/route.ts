import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { generateDashScopeText } from "@/lib/ai/dashscope-stream";
import { QWEN_MODELS } from "@/lib/ai/models";
import { answerPrompt } from "@/lib/ai/prompts";
import { getDb } from "@/lib/db";
import { formatDbError, sanitizeDbText, withDbRetry } from "@/lib/db/retry";
import { chapters, questions } from "@/lib/db/schema";
import {
  getOwnedTopic,
  listMaterials,
  touchTopic,
} from "@/lib/db/queries";
import { formatMaterialsForPrompt } from "@/lib/materials/extract";
import { requireOwnerId } from "@/lib/owner";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const ownerId = await requireOwnerId();
    const body = (await request.json()) as { questionId?: string };
    if (!body.questionId) {
      return NextResponse.json({ error: "缺少 questionId" }, { status: 400 });
    }

    const db = getDb();
    const row = await withDbRetry(async () => {
      const [r] = await db
        .select({
          question: questions,
          chapter: chapters,
        })
        .from(questions)
        .innerJoin(chapters, eq(questions.chapterId, chapters.id))
        .where(eq(questions.id, body.questionId!))
        .limit(1);
      return r;
    });

    if (!row) {
      return NextResponse.json({ error: "小题不存在" }, { status: 404 });
    }

    const topic = await withDbRetry(() =>
      getOwnedTopic(row.chapter.topicId, ownerId),
    );
    if (!topic) {
      return NextResponse.json({ error: "主题不存在" }, { status: 404 });
    }

    const materialRows = await withDbRetry(() => listMaterials(topic.id));
    const materialsBlock = formatMaterialsForPrompt(
      materialRows.map((m) => ({
        filename: m.filename,
        extractedText: m.extractedText,
      })),
      {
        query: `${topic.title}\n${row.chapter.title}\n${row.question.stem}`,
        maxTotalChars: 40_000,
      },
    );

    // Must use DashScope SSE: non-streaming cannot combine web search + thinking.
    const { text } = await generateDashScopeText({
      apiModel: QWEN_MODELS.answer,
      prompt: answerPrompt({
        topicTitle: topic.title,
        chapterTitle: row.chapter.title,
        stem: row.question.stem,
        materialsBlock: materialsBlock || undefined,
      }),
      enableSearch: true,
      enableThinking: true,
    });

    const answer = sanitizeDbText(text.trim());
    if (!answer) {
      return NextResponse.json({ error: "模型未返回有效答案" }, { status: 502 });
    }

    const updated = await withDbRetry(async () => {
      const [u] = await db
        .update(questions)
        .set({ answer })
        .where(eq(questions.id, row.question.id))
        .returning();
      return u;
    });

    await withDbRetry(() => touchTopic(topic.id));
    return NextResponse.json({ question: updated });
  } catch (e) {
    const message =
      e instanceof Error && !e.message.startsWith("Failed query:")
        ? e.message
        : formatDbError(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
