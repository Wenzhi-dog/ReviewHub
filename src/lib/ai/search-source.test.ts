import { describe, expect, it } from "vitest";
import { normalizeSearchSources } from "@/lib/ai/search-source";

describe("normalizeSearchSources", () => {
  it("returns empty for non-arrays", () => {
    expect(normalizeSearchSources(null)).toEqual([]);
    expect(normalizeSearchSources({})).toEqual([]);
  });

  it("normalizes title/url/site aliases and auto index", () => {
    const out = normalizeSearchSources([
      { title: " A ", url: " https://a.com ", site_name: "站点A" },
      { url: "https://b.com", siteName: "B" },
      { title: "", url: "" },
      "skip",
    ]);
    expect(out).toEqual([
      { index: 1, title: "A", url: "https://a.com", siteName: "站点A" },
      { index: 2, title: "https://b.com", url: "https://b.com", siteName: "B" },
    ]);
  });

  it("keeps explicit index when finite", () => {
    expect(
      normalizeSearchSources([{ index: 9, title: "t", url: "u" }])[0]?.index,
    ).toBe(9);
  });
});
