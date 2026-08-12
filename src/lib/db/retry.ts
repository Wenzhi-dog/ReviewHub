/** Strip bytes Postgres text columns reject (NUL). */
export function sanitizeDbText(value: string): string {
  return value.replace(/\u0000/g, "");
}

function isTransientDbError(error: unknown): boolean {
  const parts: string[] = [];
  let cur: unknown = error;
  for (let i = 0; i < 4 && cur; i++) {
    if (cur instanceof Error) {
      parts.push(cur.message);
      parts.push(cur.name);
      const code = (cur as Error & { code?: string }).code;
      if (typeof code === "string") {
        // Permanent Postgres SQLSTATEs — don't retry.
        if (/^(22|23|42)/.test(code)) return false;
        parts.push(code);
      }
      cur = cur.cause;
      continue;
    }
    if (typeof cur === "object" && cur !== null) {
      const o = cur as Record<string, unknown>;
      if (typeof o.message === "string") parts.push(o.message);
      if (typeof o.code === "string") {
        if (/^(22|23|42)/.test(o.code)) return false;
        parts.push(o.code);
      }
      cur = o.cause ?? o.sourceError;
      continue;
    }
    break;
  }
  const text = parts.join(" ").toLowerCase();
  return (
    text.includes("fetch failed") ||
    text.includes("other side closed") ||
    text.includes("socket") ||
    text.includes("econnreset") ||
    text.includes("etimedout") ||
    text.includes("network") ||
    text.includes("timeout") ||
    text.includes("503") ||
    text.includes("429") ||
    text.includes("too many") ||
    text.includes("connection") ||
    text.includes("failed query") ||
    text.includes("drizzlequeryerror")
  );
}

export function formatDbError(error: unknown): string {
  if (!(error instanceof Error)) return "数据库操作失败";

  let causeMsg = "";
  let cur: unknown = error.cause;
  for (let i = 0; i < 3 && cur; i++) {
    if (cur instanceof Error) {
      causeMsg = cur.message || causeMsg;
      cur = cur.cause;
    } else if (typeof cur === "object" && cur !== null) {
      const o = cur as Record<string, unknown>;
      if (typeof o.message === "string") causeMsg = o.message;
      cur = o.cause ?? o.sourceError;
    } else {
      break;
    }
  }

  // Drizzle prefixes with "Failed query: … params: …" which dumps the whole answer.
  if (error.message.startsWith("Failed query:")) {
    return causeMsg || "数据库写入失败，请重试";
  }
  return causeMsg ? `${error.message}（${causeMsg}）` : error.message;
}

export async function withDbRetry<T>(
  fn: () => Promise<T>,
  opts?: { retries?: number; baseDelayMs?: number },
): Promise<T> {
  const retries = opts?.retries ?? 3;
  const baseDelayMs = opts?.baseDelayMs ?? 400;
  let last: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (attempt >= retries || !isTransientDbError(error)) throw error;
      const delay = baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 200);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw last;
}
