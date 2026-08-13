import { describe, expect, it } from "vitest";
import { assertPublicHttpUrl } from "@/lib/materials/fetch-url";

describe("assertPublicHttpUrl", () => {
  it("accepts public http(s) urls", () => {
    expect(assertPublicHttpUrl("https://example.com/path").hostname).toBe(
      "example.com",
    );
    expect(assertPublicHttpUrl("http://example.org").protocol).toBe("http:");
  });

  it("rejects invalid protocol and credentials", () => {
    expect(() => assertPublicHttpUrl("not a url")).toThrow(/格式无效/);
    expect(() => assertPublicHttpUrl("ftp://example.com")).toThrow(/http/);
    expect(() =>
      assertPublicHttpUrl("https://user:pass@example.com"),
    ).toThrow(/认证/);
  });

  it("rejects private / localhost hosts", () => {
    const blocked = [
      "http://localhost/a",
      "http://127.0.0.1/a",
      "http://10.0.0.2/a",
      "http://192.168.1.1/a",
      "http://172.16.0.1/a",
      "http://169.254.1.1/a",
      "http://[::1]/",
      "http://foo.local/a",
    ];
    for (const url of blocked) {
      expect(() => assertPublicHttpUrl(url), url).toThrow(/内网|本机/);
    }
  });
});
