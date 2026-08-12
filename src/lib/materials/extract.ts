import JSZip from "jszip";
import { extractText as extractPdfText } from "unpdf";
import {
  formatRetrievedChunksForPrompt,
  retrieveMaterialChunks,
} from "@/lib/materials/rag";

export const MAX_MATERIAL_BYTES = 12 * 1024 * 1024; // 12MB
export const MAX_MATERIALS_PER_TOPIC = 8;
/** Soft cap for text stored per material (prompt injection uses RAG selection). */
export const MAX_EXTRACTED_CHARS = 200_000;

const EXT_MIME: Record<string, string[]> = {
  pdf: ["application/pdf"],
  pptx: [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
  ppt: ["application/vnd.ms-powerpoint"],
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  txt: ["text/plain"],
  md: ["text/markdown", "text/plain"],
};

export const ALLOWED_EXTENSIONS = Object.keys(EXT_MIME);

export function extensionOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i >= 0 ? filename.slice(i + 1).toLowerCase() : "";
}

export function isAllowedMaterial(filename: string, mimeType?: string): boolean {
  const ext = extensionOf(filename);
  if (!ALLOWED_EXTENSIONS.includes(ext)) return false;
  if (ext === "ppt") return false; // binary legacy PPT — ask for pptx
  if (!mimeType || mimeType === "application/octet-stream") return true;
  const allowed = EXT_MIME[ext] ?? [];
  return allowed.some((m) => mimeType === m || mimeType.startsWith("text/"));
}

function collapseWhitespace(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncate(text: string, max = MAX_EXTRACTED_CHARS): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n…（内容过长，已截断）`;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function textFromXml(xml: string): string {
  const withoutTags = xml
    .replace(/<a:t[^>]*>/gi, "")
    .replace(/<\/a:t>/gi, "\n")
    .replace(/<w:t[^>]*>/gi, "")
    .replace(/<\/w:t>/gi, "")
    .replace(/<[^>]+>/g, " ");
  return decodeXmlEntities(withoutTags);
}

async function extractPptx(buffer: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const slideNames = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/i.test(n))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)/i)?.[1] ?? 0);
      const nb = Number(b.match(/slide(\d+)/i)?.[1] ?? 0);
      return na - nb;
    });

  const parts: string[] = [];
  for (const name of slideNames) {
    const xml = await zip.files[name].async("string");
    const slideText = collapseWhitespace(textFromXml(xml));
    if (slideText) {
      const n = name.match(/slide(\d+)/i)?.[1] ?? "?";
      parts.push(`【幻灯片 ${n}】\n${slideText}`);
    }
  }

  // notes (optional)
  const noteNames = Object.keys(zip.files)
    .filter((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(n))
    .sort();
  for (const name of noteNames) {
    const xml = await zip.files[name].async("string");
    const noteText = collapseWhitespace(textFromXml(xml));
    if (noteText) parts.push(`【备注】\n${noteText}`);
  }

  if (parts.length === 0) {
    throw new Error("未能从 PPTX 中提取到文字（可能是纯图片幻灯片）");
  }
  return parts.join("\n\n");
}

async function extractDocx(buffer: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const doc = zip.file("word/document.xml");
  if (!doc) throw new Error("无效的 DOCX 文件");
  const xml = await doc.async("string");
  const text = collapseWhitespace(textFromXml(xml));
  if (!text) throw new Error("未能从 DOCX 中提取到文字");
  return text;
}

async function extractPdf(buffer: ArrayBuffer): Promise<string> {
  const { text } = await extractPdfText(new Uint8Array(buffer), {
    mergePages: true,
  });
  const cleaned = collapseWhitespace(text ?? "");
  if (!cleaned) throw new Error("未能从 PDF 中提取到文字（可能是扫描件）");
  return cleaned;
}

export async function extractMaterialText(params: {
  filename: string;
  mimeType: string;
  buffer: ArrayBuffer;
}): Promise<string> {
  const ext = extensionOf(params.filename);
  let raw: string;

  switch (ext) {
    case "pdf":
      raw = await extractPdf(params.buffer);
      break;
    case "pptx":
      raw = await extractPptx(params.buffer);
      break;
    case "docx":
      raw = await extractDocx(params.buffer);
      break;
    case "txt":
    case "md":
      raw = collapseWhitespace(new TextDecoder("utf-8", { fatal: false }).decode(params.buffer));
      if (!raw) throw new Error("文本文件为空");
      break;
    case "ppt":
      throw new Error("暂不支持旧版 .ppt，请另存为 .pptx 后再上传");
    default:
      throw new Error(`不支持的文件类型：.${ext || "?"}`);
  }

  return truncate(raw);
}

/**
 * Build a materials block for prompts.
 * Long corpora are chunked and filtered by `query` (topic / chapter / question).
 */
export function formatMaterialsForPrompt(
  materials: { filename: string; extractedText: string }[],
  options?: { query?: string; maxTotalChars?: number },
): string {
  if (materials.length === 0) return "";

  const chunks = retrieveMaterialChunks(materials, options?.query ?? "", {
    maxTotalChars: options?.maxTotalChars ?? 60_000,
  });
  return formatRetrievedChunksForPrompt(chunks);
}
