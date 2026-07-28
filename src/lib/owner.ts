import { cookies, headers } from "next/headers";

export const OWNER_COOKIE = "rh_owner";
export const OWNER_HEADER = "x-rh-owner";

export async function requireOwnerId(): Promise<string> {
  const h = await headers();
  const fromHeader = h.get(OWNER_HEADER);
  if (fromHeader) return fromHeader;

  const jar = await cookies();
  const existing = jar.get(OWNER_COOKIE)?.value;
  if (existing) return existing;

  throw new Error("缺少所有者标识，请刷新页面后重试。");
}
