export type SearchSource = {
  index: number;
  title: string;
  url: string;
  siteName?: string;
};

export function normalizeSearchSources(raw: unknown): SearchSource[] {
  if (!Array.isArray(raw)) return [];

  const out: SearchSource[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const url = typeof row.url === "string" ? row.url.trim() : "";
    if (!title && !url) continue;
    const index =
      typeof row.index === "number" && Number.isFinite(row.index)
        ? row.index
        : out.length + 1;
    const siteName =
      typeof row.site_name === "string"
        ? row.site_name
        : typeof row.siteName === "string"
          ? row.siteName
          : undefined;
    out.push({
      index,
      title: title || url,
      url,
      siteName,
    });
  }
  return out;
}
