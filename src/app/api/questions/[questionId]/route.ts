import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { chapters, questions } from "@/lib/db/schema";
import { getOwnedTopic, touchTopic } from "@/lib/db/queries";
import { requireOwnerId } from "@/lib/owner";

async function assertQuestionOwned(questionId: string, ownerId: string) {
  const db = getDb();
  const [row] = await db
    .select({
      question: questions,
      chapter: chapters,
    })
    .from(questions)
    .innerJoin(chapters, eq(questions.chapterId, chapters.id))
    .where(eq(questions.id, questionId))
    .limit(1);

  if (!row) return null;
  const topic = await getOwnedTopic(row.chapter.topicId, ownerId);
  if (!topic) return null;
  return { ...row, topic };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ questionId: string }> },
) {
  try {
    const { questionId } = await context.params;
    const ownerId = await requireOwnerId();
    const owned = await assertQuestionOwned(questionId, ownerId);
    if (!owned || owned.question.deletedAt) {
      return NextResponse.json({ error: "小题不存在" }, { status: 404 });
    }
    return NextResponse.json({
      question: owned.question,
      chapter: owned.chapter,
      topic: owned.topic,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "加载失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ questionId: string }> },
) {
  try {
    const { questionId } = await context.params;
    const ownerId = await requireOwnerId();
    const owned = await assertQuestionOwned(questionId, ownerId);
    if (!owned || owned.question.deletedAt) {
      return NextResponse.json({ error: "小题不存在" }, { status: 404 });
    }

    const body = (await request.json()) as {
      stem?: string;
      answer?: string | null;
      checked?: boolean;
      favorited?: boolean;
    };

    const db = getDb();
    const [updated] = await db
      .update(questions)
      .set({
        stem: body.stem?.trim() ?? owned.question.stem,
        answer:
          body.answer !== undefined ? body.answer : owned.question.answer,
        checked:
          body.checked !== undefined ? body.checked : owned.question.checked,
        favorited:
          body.favorited !== undefined
            ? body.favorited
            : owned.question.favorited,
      })
      .where(eq(questions.id, questionId))
      .returning();

    await touchTopic(owned.topic.id);
    return NextResponse.json({ question: updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : "更新失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ questionId: string }> },
) {
  try {
    const { questionId } = await context.params;
    const ownerId = await requireOwnerId();
    const owned = await assertQuestionOwned(questionId, ownerId);
    if (!owned || owned.question.deletedAt) {
      return NextResponse.json({ error: "小题不存在" }, { status: 404 });
    }

    const db = getDb();
    await db
      .update(questions)
      .set({ deletedAt: new Date() })
      .where(eq(questions.id, questionId));

    await touchTopic(owned.topic.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "删除失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
