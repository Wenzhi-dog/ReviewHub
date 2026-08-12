import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { DEFAULT_MODEL_ID } from "@/lib/ai/models";
import { getDb } from "@/lib/db";
import { topics } from "@/lib/db/schema";
import { requireOwnerId } from "@/lib/owner";

export async function GET() {
  try {
    const ownerId = await requireOwnerId();
    const db = getDb();
    const rows = await db
      .select()
      .from(topics)
      .where(eq(topics.ownerId, ownerId));
    return NextResponse.json({ topics: rows });
  } catch (e) {
    const message = e instanceof Error ? e.message : "加载失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ownerId = await requireOwnerId();
    const body = (await request.json()) as {
      title?: string;
    };
    const title = body.title?.trim();
    if (!title) {
      return NextResponse.json({ error: "请输入主题" }, { status: 400 });
    }

    const db = getDb();
    const [topic] = await db
      .insert(topics)
      .values({
        ownerId,
        title,
        modelId: DEFAULT_MODEL_ID,
        status: "chapters",
      })
      .returning();

    return NextResponse.json({ topic });
  } catch (e) {
    const message = e instanceof Error ? e.message : "创建失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
