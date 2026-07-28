import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { chapters } from "@/lib/db/schema";
import { getOwnedTopic, listChapters, touchTopic } from "@/lib/db/queries";
import { requireOwnerId } from "@/lib/owner";

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
    const rows = await listChapters(topicId);
    return NextResponse.json({ chapters: rows });
  } catch (e) {
    const message = e instanceof Error ? e.message : "加载失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
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
      chapters?: { id?: string; title: string; summary?: string }[];
    };
    if (!Array.isArray(body.chapters)) {
      return NextResponse.json({ error: "无效的章节列表" }, { status: 400 });
    }

    const db = getDb();
    await db.delete(chapters).where(eq(chapters.topicId, topicId));

    if (body.chapters.length > 0) {
      await db.insert(chapters).values(
        body.chapters.map((c, i) => ({
          topicId,
          title: c.title.trim(),
          summary: (c.summary ?? "").trim(),
          sortOrder: i,
        })),
      );
    }

    await touchTopic(topicId);
    const rows = await listChapters(topicId);
    return NextResponse.json({ chapters: rows });
  } catch (e) {
    const message = e instanceof Error ? e.message : "保存失败";
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
      id: string;
      title?: string;
      summary?: string;
    };
    if (!body.id) {
      return NextResponse.json({ error: "缺少章节 id" }, { status: 400 });
    }

    const db = getDb();
    const [existing] = await db
      .select()
      .from(chapters)
      .where(and(eq(chapters.id, body.id), eq(chapters.topicId, topicId)))
      .limit(1);
    if (!existing) {
      return NextResponse.json({ error: "章节不存在" }, { status: 404 });
    }

    const [updated] = await db
      .update(chapters)
      .set({
        title: body.title?.trim() ?? existing.title,
        summary:
          body.summary !== undefined ? body.summary.trim() : existing.summary,
      })
      .where(eq(chapters.id, body.id))
      .returning();

    await touchTopic(topicId);
    return NextResponse.json({ chapter: updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : "更新失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
