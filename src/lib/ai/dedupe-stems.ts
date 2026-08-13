const PUNCT_RE = /[\s\p{P}\p{S}]+/gu;

/** Interrogative / instructional fluff that should not block near-dup detection. */
const FILLER_RE =
  /什么是|是什么|如何|怎样|怎么|为何|为什么|是否|可否|请|简述|简要|详细|说明|解释|试述|描述|谈谈|说说|理解|工作方式|区别在哪|有何区别|的区别|吗|呢|啊|吧/g;

const PARTICLE_RE = /[的了其与和并及等到从用对为将被给把]/g;

/** Normalize stem for similarity comparison. */
export function normalizeStem(stem: string): string {
  return stem
    .trim()
    .toLowerCase()
    .replace(PUNCT_RE, "")
    .replace(FILLER_RE, "")
    .replace(PARTICLE_RE, "");
}

function tokenize(normalized: string): Set<string> {
  const tokens = new Set<string>();
  if (!normalized) return tokens;
  if (/[\u4e00-\u9fff]/.test(normalized)) {
    for (const ch of normalized) {
      if (/[\u4e00-\u9fffa-z0-9]/i.test(ch)) tokens.add(ch);
    }
    if (normalized.length >= 2) {
      for (let i = 0; i < normalized.length - 1; i++) {
        tokens.add(normalized.slice(i, i + 2));
      }
    }
  } else {
    for (const m of normalized.match(/[a-z0-9]{2,}/g) ?? [normalized]) {
      tokens.add(m);
    }
  }
  return tokens;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) {
    if (b.has(t)) inter++;
  }
  return inter / (a.size + b.size - inter);
}

function isNearDuplicate(
  a: string,
  b: string,
  threshold: number,
): boolean {
  const na = normalizeStem(a);
  const nb = normalizeStem(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Containment: one stem largely restates the other
  if (na.length >= 4 && nb.length >= 4) {
    if (na.includes(nb) || nb.includes(na)) return true;
  }
  return jaccard(tokenize(na), tokenize(nb)) >= threshold;
}

export type StemItem = { stem: string };

/**
 * Drop stems too similar to prior (other chapters) or to earlier items in the batch.
 * Does not backfill — may return fewer than input.
 */
export function dedupeQuestionStems<T extends StemItem>(
  candidates: T[],
  priorStems: string[],
  options?: { threshold?: number },
): T[] {
  const threshold = options?.threshold ?? 0.72;
  const kept: T[] = [];
  const compareAgainst = [...priorStems];

  for (const item of candidates) {
    const stem = item.stem.trim();
    if (!stem) continue;
    const dup = compareAgainst.some((p) =>
      isNearDuplicate(stem, p, threshold),
    );
    if (dup) continue;
    kept.push({ ...item, stem });
    compareAgainst.push(stem);
  }

  return kept;
}

const MAX_PRIOR_QUESTIONS = 80;
const MAX_PRIOR_CHARS = 12_000;

/** Cap prior question list for prompt token budget (chapter order preserved). */
export function truncatePriorQuestions<
  T extends { chapterTitle: string; stem: string },
>(priors: T[]): T[] {
  const out: T[] = [];
  let chars = 0;
  for (const q of priors) {
    if (out.length >= MAX_PRIOR_QUESTIONS) break;
    const line = `[${q.chapterTitle}] ${q.stem}`;
    if (out.length > 0 && chars + line.length > MAX_PRIOR_CHARS) break;
    out.push(q);
    chars += line.length;
  }
  return out;
}
