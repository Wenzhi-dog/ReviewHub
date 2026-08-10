export type SearchResult = {
  title: string;
  url: string;
  content: string;
};

type YouWebResult = {
  title?: string;
  url?: string;
  snippets?: string[];
  description?: string;
};

type YouSearchResponse = {
  results?: {
    web?: YouWebResult[];
    news?: YouWebResult[];
  };
  detail?: string | { error?: string; message?: string };
  message?: string;
  error?: string;
};

function requireYouApiKey(): string {
  const value = process.env.YDC_API_KEY;
  if (!value?.trim()) {
    throw new Error(
      "缺少 YDC_API_KEY，请在环境变量中配置（https://you.com/platform）。",
    );
  }
  return value.trim().replace(/^["']|["']$/g, "");
}

/** Search the web via You.com Search API for agent grounding. */
export async function searchWeb(
  query: string,
  maxResults = 5,
): Promise<{ results: SearchResult[] }> {
  const apiKey = requireYouApiKey();
  const limit = Math.min(Math.max(Math.floor(maxResults), 1), 10);

  const url = new URL("https://ydc-index.io/v1/search");
  url.searchParams.set("query", query);
  url.searchParams.set("count", String(limit));

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-API-Key": apiKey,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    let message = `You.com 搜索失败（${res.status}）`;
    try {
      const parsed = JSON.parse(detail) as YouSearchResponse;
      const err =
        parsed.message ||
        parsed.error ||
        (typeof parsed.detail === "string"
          ? parsed.detail
          : parsed.detail?.error || parsed.detail?.message);
      if (err) message += `：${err}`;
      else if (detail) message += `：${detail.slice(0, 200)}`;
    } catch {
      if (detail) message += `：${detail.slice(0, 200)}`;
    }
    if (res.status === 401) {
      message += "。请检查 .env.local 中的 YDC_API_KEY 是否有效。";
    }
    throw new Error(message);
  }

  const data = (await res.json()) as YouSearchResponse;
  const web = data.results?.web ?? [];
  const news = data.results?.news ?? [];

  const results = [...web, ...news]
    .map((item) => {
      const title = (item.title ?? "").trim() || item.url || "未命名";
      const link = (item.url ?? "").trim();
      const content =
        (item.snippets ?? []).filter(Boolean).join(" ").trim() ||
        (item.description ?? "").trim();
      return { title, url: link, content };
    })
    .filter((item) => item.url.length > 0)
    .slice(0, limit);

  return { results };
}
