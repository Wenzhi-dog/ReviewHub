/** Chunk + retrieve relevant material snippets for prompts (lightweight RAG). */

export type MaterialInput = {
  filename: string;
  extractedText: string;
};

export type MaterialChunk = {
  filename: string;
  /** 0-based chunk index within that file */
  index: number;
  text: string;
  score: number;
};

const DEFAULT_CHUNK_SIZE = 1_200;
const DEFAULT_OVERLAP = 180;
/** Soft floor: below this, inject full text without retrieval. */
const FULL_TEXT_THRESHOLD = 24_000;

function collapseWs(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Prefer splitting on paragraph / sentence boundaries; fall back to fixed windows.
 */
export function chunkText(
  text: string,
  chunkSize = DEFAULT_CHUNK_SIZE,
  overlap = DEFAULT_OVERLAP,
): string[] {
  const cleaned = collapseWs(text);
  if (!cleaned) return [];
  if (cleaned.length <= chunkSize) return [cleaned];

  const paragraphs = cleaned.split(/\n{2,}/);
  const chunks: string[] = [];
  let buf = "";

  const flush = () => {
    const t = buf.trim();
    if (t) chunks.push(t);
    buf = "";
  };

  for (const para of paragraphs) {
    if (!para.trim()) continue;
    if (buf.length === 0) {
      buf = para;
      continue;
    }
    if (buf.length + 2 + para.length <= chunkSize) {
      buf = `${buf}\n\n${para}`;
      continue;
    }
    flush();
    if (para.length <= chunkSize) {
      buf = para;
    } else {
      // Long paragraph: sliding window
      let start = 0;
      while (start < para.length) {
        const end = Math.min(start + chunkSize, para.length);
        chunks.push(para.slice(start, end).trim());
        if (end >= para.length) break;
        start = Math.max(end - overlap, start + 1);
      }
      buf = "";
    }
  }
  flush();

  // Merge tiny trailing chunks into previous when possible
  const merged: string[] = [];
  for (const c of chunks) {
    if (
      merged.length > 0 &&
      c.length < chunkSize * 0.35 &&
      merged[merged.length - 1].length + 2 + c.length <= chunkSize * 1.15
    ) {
      merged[merged.length - 1] = `${merged[merged.length - 1]}\n\n${c}`;
    } else {
      merged.push(c);
    }
  }
  return merged.filter(Boolean);
}

/** Character bigrams + latin/digit tokens for cheap multilingual matching. */
function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const tokens: string[] = [];
  const latin = lower.match(/[a-z0-9_]{2,}/g);
  if (latin) tokens.push(...latin);

  const cjk = lower.replace(/[^\u4e00-\u9fff]/g, "");
  for (let i = 0; i < cjk.length - 1; i++) {
    tokens.push(cjk.slice(i, i + 2));
  }
  // Single CJK chars still help short queries
  for (const ch of cjk) {
    if (ch.trim()) tokens.push(ch);
  }
  return tokens;
}

function buildTf(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) {
    tf.set(t, (tf.get(t) ?? 0) + 1);
  }
  return tf;
}

function cosineTf(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const v of a.values()) normA += v * v;
  for (const v of b.values()) normB += v * v;
  if (normA === 0 || normB === 0) return 0;
  for (const [k, va] of a) {
    const vb = b.get(k);
    if (vb) dot += va * vb;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Extra signal: how many distinct query tokens appear in the chunk. */
function queryCoverage(queryTf: Map<string, number>, chunkTf: Map<string, number>): number {
  if (queryTf.size === 0) return 0;
  let hit = 0;
  for (const k of queryTf.keys()) {
    if (chunkTf.has(k)) hit += 1;
  }
  return hit / queryTf.size;
}

function phraseBonus(query: string, chunkText: string): number {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return 0;
  const hay = chunkText.toLowerCase();
  // Prefer longer contiguous hits from the query lines
  const parts = q
    .split(/[\n,，。；;、\s]+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2);
  let bonus = 0;
  for (const p of parts) {
    if (hay.includes(p)) bonus += Math.min(0.35, 0.08 + p.length * 0.01);
  }
  return Math.min(0.8, bonus);
}

function totalChars(materials: MaterialInput[]): number {
  return materials.reduce((n, m) => n + (m.extractedText?.length ?? 0), 0);
}

/**
 * Select chunks most relevant to `query`, with light diversity (avoid near-duplicates).
 * Short corpora are returned in full (as one synthetic block per file).
 */
export function retrieveMaterialChunks(
  materials: MaterialInput[],
  query: string,
  options?: {
    maxTotalChars?: number;
    maxChunks?: number;
    chunkSize?: number;
    overlap?: number;
  },
): MaterialChunk[] {
  const maxTotalChars = options?.maxTotalChars ?? 60_000;
  const maxChunks = options?.maxChunks ?? 48;
  const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const overlap = options?.overlap ?? DEFAULT_OVERLAP;

  const usable = materials.filter((m) => m.extractedText?.trim());
  if (usable.length === 0) return [];

  // Short enough: keep original order, full text
  if (totalChars(usable) <= Math.min(FULL_TEXT_THRESHOLD, maxTotalChars)) {
    return usable.map((m, i) => ({
      filename: m.filename,
      index: 0,
      text: m.extractedText.trim(),
      score: 1 - i * 0.001,
    }));
  }

  const queryText = query.trim() || usable.map((m) => m.filename).join(" ");
  const queryTf = buildTf(tokenize(queryText));
  const all: MaterialChunk[] = [];

  for (const m of usable) {
    const parts = chunkText(m.extractedText, chunkSize, overlap);
    parts.forEach((text, index) => {
      const chunkTf = buildTf(tokenize(text));
      const cos = cosineTf(queryTf, chunkTf);
      const coverage = queryCoverage(queryTf, chunkTf);
      const phrase = phraseBonus(queryText, text);
      let score = cos * 0.45 + coverage * 0.4 + phrase;
      // Tiny position prior only when query is weak / empty
      if (!query.trim()) {
        score += Math.max(0, 0.05 - index * 0.002);
      }
      if (
        query.trim() &&
        m.filename &&
        tokenize(m.filename).some((t) => queryTf.has(t))
      ) {
        score += 0.02;
      }
      all.push({ filename: m.filename, index, text, score });
    });
  }

  all.sort((a, b) => b.score - a.score || a.index - b.index);

  const selected: MaterialChunk[] = [];
  let used = 0;
  const seenFingerprints = new Set<string>();

  const consider = (chunk: MaterialChunk) => {
    if (selected.length >= maxChunks) return false;
    const fp = `${chunk.filename}#${chunk.index}`;
    if (seenFingerprints.has(fp)) return false;
    const tip = chunk.text.slice(0, 80);
    for (const s of selected) {
      if (s.text.slice(0, 80) === tip) return false;
    }
    const cost = chunk.text.length + 40;
    if (used + cost > maxTotalChars && selected.length > 0) return false;
    seenFingerprints.add(fp);
    selected.push(chunk);
    used += cost;
    return true;
  };

  // Keep one head snippet per file for orientation, but only a small budget share
  const headBudget = Math.min(maxTotalChars * 0.2, chunkSize * usable.length * 1.2);
  let headUsed = 0;
  for (const m of usable) {
    const head = all.find((c) => c.filename === m.filename && c.index === 0);
    if (!head) continue;
    if (headUsed + head.text.length > headBudget && selected.length > 0) continue;
    if (consider(head)) headUsed += head.text.length;
  }

  for (const c of all) {
    if (selected.length >= maxChunks || used >= maxTotalChars) break;
    consider(c);
  }

  // Stable reading order: by file appearance, then chunk index
  const fileOrder = new Map(usable.map((m, i) => [m.filename, i]));
  selected.sort((a, b) => {
    const fa = fileOrder.get(a.filename) ?? 0;
    const fb = fileOrder.get(b.filename) ?? 0;
    if (fa !== fb) return fa - fb;
    return a.index - b.index;
  });

  return selected;
}

export function formatRetrievedChunksForPrompt(chunks: MaterialChunk[]): string {
  if (chunks.length === 0) return "";

  const blocks: string[] = [];
  for (const c of chunks) {
    const label =
      c.index === 0
        ? `### 资料：${c.filename}`
        : `### 资料：${c.filename}（片段 ${c.index + 1}）`;
    blocks.push(`${label}\n${c.text}`);
  }

  return `\n用户提供的参考资料（已按当前任务检索相关片段；请优先依据这些内容，勿编造资料中未出现的内容）：\n${blocks.join("\n\n")}\n`;
}
