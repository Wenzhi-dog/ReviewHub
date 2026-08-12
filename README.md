# ReviewHub

知识点复习 Agent：输入主题 → AI 拆章节 → 生成小题 → 逐题生成答案 → 复习打卡。

## 工作流

1. **创建主题**：输入复习主题名称
2. **拆分章节**：Qwen 联网检索资料后划分章节，可编辑或按意见重生成
3. **生成小题**：按章节出复习题干，可编辑或重生成
4. **生成答案**：并发调用模型为每题写参考答案
5. **复习打卡**：在主题页浏览章节与小题，标记掌握 / 收藏

## 模型策略

| 场景 | 模型 | 说明 |
| --- | --- | --- |
| 章节 / 小题 | `qwen3.7-flash` 或 `qwen3.7-plus` | 按主题难度自动分流；DashScope 原生联网搜索，并展示检索来源 |
| 答案 | `qwen3.7-flash` | 固定使用；答案末尾含「依据来源」小节 |

模型由服务端自动选择，界面不再提供手动切换。

## 本地运行

1. 复制环境变量：

```bash
cp .env.example .env.local
```

2. 填入：

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 是 | Neon Postgres 连接串 |
| `DASHSCOPE_API_KEY` | 是 | [阿里云百炼](https://bailian.console.aliyun.com) API Key |
| `DASHSCOPE_BASE_URL` | 否 | 默认 `https://dashscope.aliyuncs.com/compatible-mode/v1`；国际站可用 `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` |

3. 建表并启动：

```bash
npm install
npm run db:push
npm run dev
```

## 部署（Vercel）

已关联项目 `reviewhub`，生产地址：https://reviewhub-delta.vercel.app

在 Vercel 项目环境变量中配置 `DATABASE_URL` 与 `DASHSCOPE_API_KEY`（按需配置 `DASHSCOPE_BASE_URL`），然后：

```bash
npx vercel deploy --prod
```
