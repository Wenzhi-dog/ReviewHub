import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import {
  ALLOWED_EXTENSIONS,
  MAX_EXTRACTED_CHARS,
  MAX_MATERIAL_BYTES,
  extensionOf,
  extractMaterialText,
} from "@/lib/materials/extract";

const FETCH_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 5;

export type FetchedMaterial = {
  filename: string;
  mimeType: string;
  byteSize: number;
  extractedText: string;
  sourceUrl: string;
};

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

function isPrivateHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    h === "localhost" ||
    h === "::1" ||
    h === "0.0.0.0" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h.endsWith(".internal")
  ) {
    return true;
  }

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (ipv4) {
    const parts = ipv4.slice(1).map(Number);
    if (parts.some((n) => n > 255)) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }

  // IPv6 unique-local / link-local (rough)
  if (
    h === "::" ||
    h.startsWith("fc") ||
    h.startsWith("fd") ||
    h.startsWith("fe80")
  ) {
    return true;
  }

  return false;
}

export function assertPublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("链接格式无效");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("仅支持 http / https 链接");
  }
  if (url.username || url.password) {
    throw new Error("不支持带认证信息的链接");
  }
  if (isPrivateHostname(url.hostname)) {
    throw new Error("不支持访问内网或本机地址");
  }
  return url;
}

function mimeBase(contentType: string | null): string {
  if (!contentType) return "";
  return contentType.split(";")[0].trim().toLowerCase();
}

function extFromMime(mime: string): string | null {
  if (mime === "application/pdf") return "pdf";
  if (
    mime ===
    "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ) {
    return "pptx";
  }
  if (
    mime ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx";
  }
  if (mime === "text/plain") return "txt";
  if (mime === "text/markdown") return "md";
  if (mime === "text/html" || mime === "application/xhtml+xml") return "html";
  return null;
}

function guessExt(url: URL, mime: string): string {
  const fromPath = extensionOf(url.pathname);
  if (ALLOWED_EXTENSIONS.includes(fromPath) || fromPath === "html" || fromPath === "htm") {
    return fromPath === "htm" ? "html" : fromPath;
  }
  return extFromMime(mime) ?? "html";
}

function displayName(url: URL, title: string | null | undefined, ext: string): string {
  const cleanTitle = title?.replace(/\s+/g, " ").trim();
  if (cleanTitle) {
    const base = cleanTitle.slice(0, 120);
    if (ext === "html" || ext === "htm") return base;
    return base.toLowerCase().endsWith(`.${ext}`) ? base : `${base}.${ext}`;
  }
  const pathPart = url.pathname === "/" ? "" : url.pathname;
  const raw = `${url.hostname}${pathPart}`.replace(/\/+$/, "") || url.hostname;
  return raw.slice(0, 200);
}

function stripHtmlToText(html: string): string {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  return collapseWhitespace(
    withoutNoise
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'"),
  );
}

function extractHtmlDocument(html: string, url: string): {
  title: string | null;
  text: string;
} {
  const { document } = parseHTML(html);
  // Readability expects a document with location-like base
  try {
    const reader = new Readability(document, { charThreshold: 100 });
    const article = reader.parse();
    if (article?.textContent?.trim()) {
      return {
        title: article.title?.trim() || document.title?.trim() || null,
        text: collapseWhitespace(article.textContent),
      };
    }
  } catch {
    // fall through
  }

  const title = document.title?.trim() || null;
  const text = stripHtmlToText(html);
  if (!text) {
    throw new Error(`未能从页面提取正文：${url}`);
  }
  return { title, text };
}

async function readBodyWithLimit(
  res: Response,
  limit: number,
): Promise<ArrayBuffer> {
  const lenHeader = res.headers.get("content-length");
  if (lenHeader) {
    const len = Number(lenHeader);
    if (Number.isFinite(len) && len > limit) {
      throw new Error(`内容过大（上限 ${Math.round(limit / 1024 / 1024)}MB）`);
    }
  }

  if (!res.body) {
    const buf = await res.arrayBuffer();
    if (buf.byteLength > limit) {
      throw new Error(`内容过大（上限 ${Math.round(limit / 1024 / 1024)}MB）`);
    }
    return buf;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > limit) {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      throw new Error(`内容过大（上限 ${Math.round(limit / 1024 / 1024)}MB）`);
    }
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
}

async function fetchFollowingRedirects(
  start: URL,
  signal: AbortSignal,
): Promise<{ response: Response; finalUrl: URL }> {
  let current = start;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    assertPublicHttpUrl(current.toString());
    const response = await fetch(current.toString(), {
      method: "GET",
      redirect: "manual",
      signal,
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/pdf,application/vnd.openxmlformats-officedocument.*,text/plain,text/markdown,*/*;q=0.8",
        "User-Agent":
          "ReviewHubMaterialFetcher/1.0 (+https://reviewhub-delta.vercel.app)",
      },
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        throw new Error("重定向缺少 Location");
      }
      current = new URL(location, current);
      continue;
    }

    return { response, finalUrl: current };
  }
  throw new Error("重定向次数过多");
}

export async function fetchUrlMaterial(rawUrl: string): Promise<FetchedMaterial> {
  const startUrl = assertPublicHttpUrl(rawUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const { response, finalUrl } = await fetchFollowingRedirects(
      startUrl,
      controller.signal,
    );

    if (!response.ok) {
      throw new Error(`无法获取链接（HTTP ${response.status}）`);
    }

    const mime = mimeBase(response.headers.get("content-type")) || "application/octet-stream";
    const buffer = await readBodyWithLimit(response, MAX_MATERIAL_BYTES);
    const byteSize = buffer.byteLength;
    if (byteSize <= 0) {
      throw new Error("链接返回内容为空");
    }

    const ext = guessExt(finalUrl, mime);
    const isHtml =
      ext === "html" ||
      mime === "text/html" ||
      mime === "application/xhtml+xml" ||
      (mime === "application/octet-stream" &&
        (finalUrl.pathname.endsWith(".html") ||
          finalUrl.pathname.endsWith(".htm") ||
          finalUrl.pathname === "/" ||
          !extensionOf(finalUrl.pathname)));

    if (isHtml && (mime.startsWith("text/") || mime.includes("html") || mime === "application/octet-stream" || mime === "application/xhtml+xml")) {
      // Prefer HTML parse when content looks like markup
      const decoded = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
      const looksLikeHtml =
        mime.includes("html") ||
        mime === "application/xhtml+xml" ||
        /^\s*</.test(decoded);
      if (looksLikeHtml) {
        const { title, text } = extractHtmlDocument(decoded, finalUrl.toString());
        if (!text.trim()) {
          throw new Error("未能从页面提取到正文（可能需要登录或为纯前端渲染）");
        }
        return {
          filename: displayName(finalUrl, title, "html"),
          mimeType: "text/html",
          byteSize,
          extractedText: truncate(text),
          sourceUrl: finalUrl.toString(),
        };
      }
    }

    if (["pdf", "pptx", "docx", "txt", "md"].includes(ext)) {
      const filename = displayName(
        finalUrl,
        extensionOf(finalUrl.pathname) ? null : `document.${ext}`,
        ext,
      );
      const safeName = extensionOf(filename) === ext ? filename : `${filename}.${ext}`;
      const extractedText = await extractMaterialText({
        filename: safeName,
        mimeType: mime,
        buffer,
      });
      return {
        filename: safeName,
        mimeType: mime,
        byteSize,
        extractedText,
        sourceUrl: finalUrl.toString(),
      };
    }

    // Last resort: try as HTML if it starts with a tag
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
    if (/^\s*</.test(decoded)) {
      const { title, text } = extractHtmlDocument(decoded, finalUrl.toString());
      return {
        filename: displayName(finalUrl, title, "html"),
        mimeType: "text/html",
        byteSize,
        extractedText: truncate(text),
        sourceUrl: finalUrl.toString(),
      };
    }

    throw new Error(
      `不支持该链接类型（${mime || "未知"}）。请提供网页或 PDF / DOCX / PPTX / TXT / MD`,
    );
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("读取链接超时，请稍后重试或换用其他链接");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
