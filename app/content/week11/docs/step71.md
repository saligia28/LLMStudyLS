# Step 71: RAG Pipeline｜整合 Pipeline（chunk → embed → store → search）

## 学习目标

这一节要做的是把 Week 9、10 积累的所有组件——chunking、embedding、向量存储、相似度检索——串成一个真正可运行的端到端 RAG 流水线。

完成后你应该能：

1. 描述完整 RAG Pipeline 的两条主干流程：ingest（入库）和 query（问答）
2. 实现一个 `RagPipeline` 类，封装 chunk、embed、store、search 四个阶段
3. 使用 DeepSeek（OpenAI-compatible）完成 embedding 和 chat 调用
4. 运行一个从文档到问答的完整端到端示例
5. 识别每个阶段的输入输出边界，为后续扩展打好基础

> Week 9 和 Week 10 分别解决了"如何表示文本"和"如何切分文本"，这一节把它们接在一起，让整条链路第一次真正跑起来。

---

## 一、完整 RAG Pipeline 的结构

先把两条主干流程的关系看清楚：

```text
【Ingest 入库流程】

原始文档（字符串 / 文件）
  ↓
Chunking（切分为小块）
  ↓
Embedding（每个 chunk → 向量）
  ↓
向量存储（保存 chunk + 向量）

【Query 问答流程】

用户问题
  ↓
Query Embedding（问题 → 向量）
  ↓
向量检索（余弦相似度 → Top-K chunks）
  ↓
Prompt 组装（chunks + 问题）
  ↓
LLM 生成（DeepSeek chat）
  ↓
返回答案
```

这两条流程共享同一个向量存储。Ingest 写入，Query 读出。Pipeline 就是把这两条流程封装在一个类里，统一管理状态和配置。

### 为什么要封装成类

1. 配置（model 名、chunk 参数、Top-K）集中管理，不散落各处
2. 向量存储在内存里生命周期清晰，不需要全局变量
3. ingest 和 query 作为两个公开方法，边界明确
4. 后续加 rerank、cache、citation 时，改动范围可控

---

## 二、项目结构

```text
rag-pipeline/
├── index.js          # 入口示例
├── RagPipeline.js    # 核心 Pipeline 类
├── chunker.js        # Chunking 模块
├── embedder.js       # Embedding 模块
├── vectorStore.js    # 向量存储模块
└── .env              # DEEPSEEK_API_KEY
```

先把各个模块单独写清楚，再组装进 `RagPipeline`。

---

## 三、Chunking 模块

```js
// chunker.js
/**
 * 滑动窗口切分，支持 overlap
 * @param {string} text
 * @param {object} options
 * @param {number} options.chunkSize  - 每块字符数，默认 600
 * @param {number} options.overlap    - 重叠字符数，默认 100
 * @returns {Array<{text: string, index: number}>}
 */
export function chunkText(text, { chunkSize = 600, overlap = 100 } = {}) {
  if (overlap >= chunkSize) {
    throw new Error('overlap 必须小于 chunkSize')
  }

  const step = chunkSize - overlap
  const chunks = []
  let index = 0

  for (let i = 0; i < text.length; i += step) {
    const part = text.slice(i, i + chunkSize).trim()
    if (part.length > 20) {  // 过滤过短的碎片
      chunks.push({ text: part, index })
      index++
    }
    if (i + chunkSize >= text.length) break
  }

  return chunks
}

/**
 * 按 Markdown 标题做语义切分，超过 maxSize 时再做长度约束
 */
export function chunkMarkdown(markdown, { maxSize = 800, overlap = 100 } = {}) {
  // 先按标题分段
  const sections = markdown.split(/\n(?=#{1,6}\s)/)
  const result = []
  let index = 0

  for (const section of sections) {
    const trimmed = section.trim()
    if (!trimmed) continue

    if (trimmed.length <= maxSize) {
      result.push({ text: trimmed, index })
      index++
    } else {
      // 段落太长时做滑动窗口
      const subChunks = chunkText(trimmed, { chunkSize: maxSize, overlap })
      for (const sub of subChunks) {
        result.push({ text: sub.text, index })
        index++
      }
    }
  }

  return result
}
```

---

## 四、Embedding 模块

```js
// embedder.js
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL || 'https://api.deepseek.com'
})

/**
 * 为单条文本生成 embedding 向量
 */
export async function embedText(text, model = 'text-embedding-v3') {
  const response = await client.embeddings.create({
    model,
    input: text.replace(/\n/g, ' ')
  })
  return response.data[0].embedding
}

/**
 * 批量生成 embeddings，支持分批避免超限
 */
export async function embedBatch(texts, model = 'text-embedding-v3', batchSize = 20) {
  const results = []

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    const response = await client.embeddings.create({
      model,
      input: batch.map(t => t.replace(/\n/g, ' '))
    })
    results.push(...response.data.map(d => d.embedding))

    // 简单限流，避免触发 rate limit
    if (i + batchSize < texts.length) {
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }

  return results
}
```

---

## 五、向量存储模块

```js
// vectorStore.js

/**
 * 余弦相似度
 */
function cosineSimilarity(vecA, vecB) {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < vecA.length; i++) {
    dot   += vecA[i] * vecB[i]
    normA += vecA[i] * vecA[i]
    normB += vecB[i] * vecB[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * 内存向量存储
 * 每条记录: { id, text, embedding, metadata }
 */
export class VectorStore {
  constructor() {
    this.records = []
  }

  /**
   * 添加一条记录
   */
  add(id, text, embedding, metadata = {}) {
    this.records.push({ id, text, embedding, metadata })
  }

  /**
   * Top-K 相似度检索
   * @param {number[]} queryEmbedding
   * @param {number} topK
   * @returns {Array<{text, metadata, score}>}
   */
  search(queryEmbedding, topK = 5) {
    const scored = this.records.map(record => ({
      text: record.text,
      metadata: record.metadata,
      score: cosineSimilarity(queryEmbedding, record.embedding)
    }))

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  }

  /**
   * 返回当前存储的记录数
   */
  size() {
    return this.records.length
  }

  /**
   * 清空存储
   */
  clear() {
    this.records = []
  }
}
```

---

## 六、核心：RagPipeline 类

```js
// RagPipeline.js
import OpenAI from 'openai'
import { chunkMarkdown } from './chunker.js'
import { embedText, embedBatch } from './embedder.js'
import { VectorStore } from './vectorStore.js'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL || 'https://api.deepseek.com'
})

export class RagPipeline {
  constructor(options = {}) {
    this.chunkSize   = options.chunkSize   ?? 600
    this.overlap     = options.overlap     ?? 100
    this.topK        = options.topK        ?? 5
    this.embedModel  = options.embedModel  ?? 'text-embedding-v3'
    this.chatModel   = options.chatModel   ?? 'deepseek-chat'
    this.store       = new VectorStore()
  }

  // ─────────────────────────────────────────────
  // Ingest：文档入库
  // ─────────────────────────────────────────────

  /**
   * 将一篇文档入库
   * @param {string} docText   - 文档原文
   * @param {object} docMeta   - 文档元数据，如 { source, title }
   */
  async ingest(docText, docMeta = {}) {
    // Step 1: Chunk
    const chunks = chunkMarkdown(docText, {
      maxSize: this.chunkSize,
      overlap:  this.overlap
    })

    console.log(`[Ingest] 文档切分完成，共 ${chunks.length} 个 chunk`)

    // Step 2: Embed（批量）
    const texts = chunks.map(c => c.text)
    const embeddings = await embedBatch(texts, this.embedModel)

    console.log(`[Ingest] Embedding 完成，向量维度: ${embeddings[0].length}`)

    // Step 3: Store
    for (let i = 0; i < chunks.length; i++) {
      const id = `${docMeta.source ?? 'doc'}_chunk_${chunks[i].index}`
      this.store.add(id, chunks[i].text, embeddings[i], {
        ...docMeta,
        chunkIndex: chunks[i].index
      })
    }

    console.log(`[Ingest] 入库完成，当前存储总量: ${this.store.size()} 条`)
    return chunks.length
  }

  // ─────────────────────────────────────────────
  // Query：问答检索
  // ─────────────────────────────────────────────

  /**
   * 对用户问题进行 RAG 问答
   * @param {string} question
   * @returns {Promise<{answer: string, context: Array}>}
   */
  async query(question) {
    if (this.store.size() === 0) {
      throw new Error('向量存储为空，请先调用 ingest() 入库')
    }

    // Step 1: Query Embedding
    const queryVec = await embedText(question, this.embedModel)

    // Step 2: 向量检索 Top-K
    const results = this.store.search(queryVec, this.topK)

    console.log(`[Query] 检索完成，Top-${this.topK} 结果:`)
    results.forEach((r, i) => {
      console.log(`  [${i + 1}] score=${r.score.toFixed(4)}  ${r.text.slice(0, 60)}...`)
    })

    // Step 3: 组装 Prompt
    const contextText = results
      .map((r, i) => `[参考 ${i + 1}]\n${r.text}`)
      .join('\n\n---\n\n')

    const systemPrompt = `你是一个专业的问答助手。请根据以下参考内容回答用户的问题。
如果参考内容中没有相关信息，请如实说明，不要编造。`

    const userPrompt = `参考内容：
${contextText}

用户问题：${question}`

    // Step 4: LLM 生成
    const response = await client.chat.completions.create({
      model: this.chatModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt }
      ],
      temperature: 0.3
    })

    const answer = response.choices[0].message.content

    return { answer, context: results }
  }
}
```

---

## 七、入口示例

```js
// index.js
import 'dotenv/config'
import { RagPipeline } from './RagPipeline.js'

// ── 示例文档 ──────────────────────────────────────
const doc = `
# DeepSeek API 使用指南

## 模型列表

DeepSeek 提供以下主要模型：

- deepseek-chat：通用对话模型，适合问答、写作、分析
- deepseek-coder：代码专用模型，适合编程任务
- text-embedding-v3：文本向量模型，适合语义检索

## 快速开始

调用 DeepSeek API 需要在请求头中携带 API Key：

\`\`\`bash
curl https://api.deepseek.com/chat/completions \\
  -H "Authorization: Bearer $DEEPSEEK_API_KEY" \\
  -d '{"model":"deepseek-chat","messages":[{"role":"user","content":"你好"}]}'
\`\`\`

## 计费方式

DeepSeek 按 token 计费。input token 和 output token 单独计价。
使用 embedding 模型时，只有 input token 产生费用。

## 常见错误

- 401 Unauthorized：API Key 无效或过期
- 429 Too Many Requests：请求频率超限，需要降速或分批
- 500 Internal Server Error：服务端错误，稍后重试
`

// ── 运行 Pipeline ─────────────────────────────────
async function main() {
  const pipeline = new RagPipeline({
    chunkSize: 400,
    overlap: 80,
    topK: 3
  })

  // 入库
  await pipeline.ingest(doc, { source: 'deepseek-guide', title: 'DeepSeek API 使用指南' })

  // 问答
  const questions = [
    'DeepSeek 有哪些模型？',
    '如何快速调用 DeepSeek API？',
    '遇到 429 错误怎么办？',
    'embedding 模型怎么计费？'
  ]

  for (const q of questions) {
    console.log('\n' + '='.repeat(60))
    console.log(`问题: ${q}`)
    const { answer } = await pipeline.query(q)
    console.log(`回答:\n${answer}`)
  }
}

main().catch(console.error)
```

---

## 八、验证步骤

1. 安装依赖：`npm install openai dotenv`
2. 创建 `.env` 文件，写入 `DEEPSEEK_API_KEY=your-key`
3. 运行：`node index.js`
4. 观察控制台输出：
   - Ingest 阶段：chunk 数量、向量维度、入库总量
   - Query 阶段：Top-K 检索结果及相似度分数
   - 最终答案是否来自原文

### 预期输出示意

```text
[Ingest] 文档切分完成，共 6 个 chunk
[Ingest] Embedding 完成，向量维度: 1024
[Ingest] 入库完成，当前存储总量: 6 条

============================================================
问题: DeepSeek 有哪些模型？
[Query] 检索完成，Top-3 结果:
  [1] score=0.9123  DeepSeek 提供以下主要模型：...
  [2] score=0.7841  调用 DeepSeek API 需要在请求头中...
  [3] score=0.7102  DeepSeek 按 token 计费...
回答:
DeepSeek 提供三款主要模型：
1. deepseek-chat：通用对话模型
2. deepseek-coder：代码专用模型
3. text-embedding-v3：文本向量模型
```

---

## 小结

1. RAG Pipeline 有两条主干流程：Ingest（写入）和 Query（读出），共享同一个向量存储。
2. `RagPipeline` 类把 chunk、embed、store、search、chat 五个阶段统一封装，配置集中、边界清晰。
3. 批量 embedding（`embedBatch`）比逐条调用显著减少 API 次数，是生产中的必要做法。
4. Prompt 组装时把 Top-K chunks 以编号方式拼入，是 RAG 最基本的上下文注入模式。
5. 这一节的 Pipeline 是后续所有扩展的基础骨架，rerank、query 重写、citation、cache 都将在此基础上叠加。
