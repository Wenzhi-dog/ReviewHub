# ReviewHub

知识点复习 Agent：输入主题 → AI 拆章节 → 生成小题 → 逐题生成答案 → 复习打卡。

章节与小题生成会以 Agent 方式运行：先通过 [You.com Search API](https://you.com/docs/api-reference/search/v1-search) 搜索相关资料，流式展示搜索与思考过程，再落库结构化结果。

## 本地运行

1. 复制环境变量：

```bash
cp .env.example .env.local
```

2. 填入：
   - Neon `DATABASE_URL`
   - `DEEPSEEK_API_KEY`（[DeepSeek 开放平台](https://platform.deepseek.com)）
   - `YDC_API_KEY`（[You.com Platform](https://you.com/platform)，章节/小题 Agent 搜索用）

3. 建表并启动：

```bash
npm run db:push
npm run dev
```

创建主题时可选择模型（当前支持 DeepSeek V4 Flash Thinking / Pro）。后续在 `src/lib/ai/models.ts` 与 `src/lib/ai/provider.ts` 添加即可扩展。

## 部署（Vercel）

已关联项目 `reviewhub`，生产地址：https://reviewhub-delta.vercel.app

重新部署：

```bash
npx vercel deploy --prod
```

在 Vercel 项目环境变量中配置 `DATABASE_URL`、`DEEPSEEK_API_KEY` 与 `YDC_API_KEY`。
