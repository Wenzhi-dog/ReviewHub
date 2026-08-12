import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { materials } from "@/lib/db/schema";
import { getOwnedTopic, listMaterials, touchTopic } from "@/lib/db/queries";
import {
  ALLOWED_EXTENSIONS,
  MAX_MATERIAL_BYTES,
  MAX_MATERIALS_PER_TOPIC,
  extractMaterialText,
  isAllowedMaterial,
} from "@/lib/materials/extract";
import { fetchUrlMaterial } from "@/lib/materials/fetch-url";
import { requireOwnerId } from "@/lib/owner";

export const maxDuration = 60;

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
    const rows = await listMaterials(topicId);
    return NextResponse.json({
      materials: rows.map((m) => ({
        id: m.id,
        filename: m.filename,
        mimeType: m.mimeType,
        byteSize: m.byteSize,
        createdAt: m.createdAt,
        charCount: m.extractedText.length,
      })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "加载失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function normalizeUrls(raw: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const url = item.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

async function parseMaterialsRequest(request: Request): Promise<{
  files: File[];
  urls: string[];
}> {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as { urls?: unknown };
    const urls = Array.isArray(body.urls) ? normalizeUrls(body.urls) : [];
    return { files: [], urls };
  }

  const form = await request.formData();
  const files = form
    .getAll("files")
    .filter((v): v is File => typeof File !== "undefined" && v instanceof File);
  const urls = normalizeUrls(form.getAll("urls"));
  return { files, urls };
}

export async function POST(
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

    const existing = await listMaterials(topicId);
    const { files, urls } = await parseMaterialsRequest(request);

    if (files.length === 0 && urls.length === 0) {
      return NextResponse.json(
        { error: "请选择要上传的文件或粘贴链接" },
        { status: 400 },
      );
    }

    if (existing.length + files.length + urls.length > MAX_MATERIALS_PER_TOPIC) {
      return NextResponse.json(
        {
          error: `每个主题最多 ${MAX_MATERIALS_PER_TOPIC} 份资料（已有 ${existing.length} 个）`,
        },
        { status: 400 },
      );
    }

    const db = getDb();
    const created = [];

    for (const file of files) {
      if (file.size <= 0) {
        return NextResponse.json(
          { error: `文件为空：${file.name}` },
          { status: 400 },
        );
      }
      if (file.size > MAX_MATERIAL_BYTES) {
        return NextResponse.json(
          {
            error: `文件过大：${file.name}（上限 ${Math.round(MAX_MATERIAL_BYTES / 1024 / 1024)}MB）`,
          },
          { status: 400 },
        );
      }
      if (!isAllowedMaterial(file.name, file.type)) {
        return NextResponse.json(
          {
            error: `不支持「${file.name}」。允许：${ALLOWED_EXTENSIONS.filter((e) => e !== "ppt").join(", ")}`,
          },
          { status: 400 },
        );
      }

      const buffer = await file.arrayBuffer();
      let extractedText: string;
      try {
        extractedText = await extractMaterialText({
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          buffer,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "解析失败";
        return NextResponse.json(
          { error: `解析「${file.name}」失败：${msg}` },
          { status: 400 },
        );
      }

      const [row] = await db
        .insert(materials)
        .values({
          topicId,
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          byteSize: file.size,
          extractedText,
        })
        .returning();
      created.push(row);
    }

    for (const url of urls) {
      let fetched;
      try {
        fetched = await fetchUrlMaterial(url);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "读取失败";
        return NextResponse.json(
          { error: `读取链接失败（${url}）：${msg}` },
          { status: 400 },
        );
      }

      const [row] = await db
        .insert(materials)
        .values({
          topicId,
          filename: fetched.filename,
          mimeType: fetched.mimeType,
          byteSize: fetched.byteSize,
          extractedText: fetched.extractedText,
        })
        .returning();
      created.push(row);
    }

    await touchTopic(topicId);

    return NextResponse.json({
      materials: created.map((m) => ({
        id: m.id,
        filename: m.filename,
        mimeType: m.mimeType,
        byteSize: m.byteSize,
        createdAt: m.createdAt,
        charCount: m.extractedText.length,
      })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "上传失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
