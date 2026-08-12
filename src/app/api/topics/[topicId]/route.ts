import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { topics, type TopicStatus } from "@/lib/db/schema";
import { getOwnedTopic } from "@/lib/db/queries";
import { requireOwnerId } from "@/lib/owner";

const statuses: TopicStatus[] = ["chapters", "questions", "answers", "ready"];

export async function GET(
  _request: Request,
  context: { params: Promise<{ topicId: string }> },
) {
  try {
    const { topicId } = await context.params;
    const ownerId = await requireOwnerId();
    const topic = await getOwnedTopic(topicId, ownerId);
    if (!topic) {
      return NextResponse.json({ error: "主题不存在" }, { status: 404 });
    }
    return NextResponse.json({ topic });
  } catch (e) {
    const message = e instanceof Error ? e.message : "加载失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ topicId: string }> },
) {
  try {
    const { topicId } = await context.params;
    const ownerId = await requireOwnerId();
    const topic = await getOwnedTopic(topicId, ownerId);
    if (!topic) {
      return NextResponse.json({ error: "主题不存在" }, { status: 404 });
    }

    const body = (await request.json()) as {
      title?: string;
      status?: TopicStatus;
    };

    const updates: Partial<{
      title: string;
      status: TopicStatus;
      updatedAt: Date;
    }> = { updatedAt: new Date() };
    if (typeof body.title === "string" && body.title.trim()) {
      updates.title = body.title.trim();
    }
    if (body.status && statuses.includes(body.status)) {
      updates.status = body.status;
    }

    const db = getDb();
    const [updated] = await db
      .update(topics)
      .set(updates)
      .where(and(eq(topics.id, topicId), eq(topics.ownerId, ownerId)))
      .returning();

    return NextResponse.json({ topic: updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : "更新失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ topicId: string }> },
) {
  try {
    const { topicId } = await context.params;
    const ownerId = await requireOwnerId();
    const topic = await getOwnedTopic(topicId, ownerId);
    if (!topic) {
      return NextResponse.json({ error: "主题不存在" }, { status: 404 });
    }

    const db = getDb();
    await db
      .delete(topics)
      .where(and(eq(topics.id, topicId), eq(topics.ownerId, ownerId)));

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "删除失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
