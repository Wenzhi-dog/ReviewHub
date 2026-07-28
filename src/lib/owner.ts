/**
 * 身份入口：现阶段返回共享主体，实现全平台同一份数据。
 * 接登录后改为从 session 取真实用户 id，下游 requireOwnerId → owner_id 链路不变。
 */
export async function requireOwnerId(): Promise<string> {
  return process.env.SHARED_OWNER_ID?.trim() || "shared";
}
