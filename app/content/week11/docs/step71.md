# Step 71: RAG Pipeline｜整合 Pipeline（chunk → embed → store → search）

## 学习目标

这一节要把 Week 9、10 积累的组件接成一条真正可运行的 RAG 主线。

完成后你应该能：

1. 清楚区分 ingest 与 query 两条流程
2. 用一个 `RagPipeline` 类统一管理配置和状态
3. 明确拆分“本地 embedding”与“DeepSeek 生成”
4. 跑通一份从文档入库到问答返回的端到端示例

> **本节默认能力边界**：文档向量与查询向量由本地 OpenAI-compatible embedding 服务生成；DeepSeek 负责最终回答、query rewrite 与 rerank 等生成类能力。

---

## 一、先把两条流程拆清楚

```text
【Ingest 入库流程】
原始文档
  ↓
Chunking
  ↓
Local Embedding
  ↓
向量库存储

【Query 问答流程】
用户问题
  ↓
Query Embedding（本地）
  ↓
向量检索
  ↓
Prompt 组装
  ↓
DeepSeek 回答
```

从这一节开始，RAG 主线不再写成“DeepSeek 一家包办”，而是固定成：

- `DeepSeek = 生成`
- `Local Embedding = 检索底座`

---

## 二、推荐的配置分层

```bash
# 生成模型
DEEPSEEK_API_KEY=your-key
DEEPSEEK_BASEURL=https://api.deepseek.com
LLM_MODEL=deepseek-chat

# embedding 服务
EMBEDDING_BACKEND=openai-compatible
EMBEDDING_BASE_URL=http://localhost:11434/v1
EMBEDDING_API_KEY=ollama
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_BATCH_SIZE=16

# RAG 参数
TOP_K=5
SIMILARITY_THRESHOLD=0.5
CHUNK_SIZE=800
CHUNK_OVERLAP=160
```

---

## 三、两个客户端分开初始化

```js
// clients.js
import OpenAI from 'openai'

export const llmClient = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL || 'https://api.deepseek.com',
})

export const embeddingClient = new OpenAI({
  apiKey: process.env.EMBEDDING_API_KEY || 'local',
  baseURL: process.env.EMBEDDING_BASE_URL,
})
```

这样后面你想：

- 换本地 embedding 模型
- 保持 DeepSeek 生成不动

都只改一侧配置。

---

## 四、补回一个可复用的 `chunker.js`

```js
// chunker.js
export function chunkText(text, { chunkSize = 800, overlap = 160 } = {}) {
  if (overlap >= chunkSize) {
    throw new Error('overlap 必须小于 chunkSize')
  }

  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  const step = chunkSize - overlap
  const chunks = []

  for (let start = 0, index = 0; start < normalized.length; start += step, index += 1) {
    const raw = normalized.slice(start, start + chunkSize).trim()
    if (!raw) continue

    chunks.push({
      index,
      start,
      end: Math.min(start + chunkSize, normalized.length),
      text: raw,
    })

    if (start + chunkSize >= normalized.length) break
  }

  return chunks
}

export function chunkMarkdown(markdown, options = {}) {
  const sections = markdown.split(/\n(?=#{1,6}\s)/)
  const chunks = []

  for (const section of sections) {
    const trimmed = section.trim()
    if (!trimmed) continue

    if (trimmed.length <= (options.chunkSize || 800)) {
      chunks.push({
        index: chunks.length,
        start: 0,
        end: trimmed.length,
        text: trimmed,
      })
      continue
    }

    const subChunks = chunkText(trimmed, options)
    for (const item of subChunks) {
      chunks.push({
        ...item,
        index: chunks.length,
      })
    }
  }

  return chunks
}
```

这段代码值得保留，因为后面排查“为什么命中了不相关 chunk”时，第一步往往就是先看切分结果。

---

## 五、补回一个批量 `embedder.js`

```js
// embedder.js
import { embeddingClient } from './clients.js'

const BATCH_SIZE = Number(process.env.EMBEDDING_BATCH_SIZE || 16)

function normalizeText(text) {
  return text.replace(/\s+/g, ' ').trim()
}

export async function embedTexts(texts) {
  if (texts.length === 0) return []

  const normalized = texts.map((text) => normalizeText(text))
  const vectors = []

  for (let i = 0; i < normalized.length; i += BATCH_SIZE) {
    const batch = normalized.slice(i, i + BATCH_SIZE)

    const response = await embeddingClient.embeddings.create({
      model: process.env.EMBEDDING_MODEL,
      input: batch,
    })

    const ordered = [...response.data]
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding)

    vectors.push(...ordered)
  }

  return vectors
}
```

这里恢复“分批 embedding”的长示例，是因为这一步在真实项目里很重要：

- 方便后续做速率限制
- 容易加缓存
- 能清晰看到 batch 行为

---

## 六、补回 `vector-store.js`

```js
// vector-store.js
function cosineSimilarity(a, b) {
  let dot = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

export class VectorStore {
  constructor() {
    this.records = []
  }

  async upsert(records) {
    const ids = new Set(records.map((record) => record.id))
    this.records = this.records.filter((record) => !ids.has(record.id))
    this.records.push(...records)
  }

  search(queryVector, topK = 5, threshold = 0) {
    return this.records
      .map((record) => ({
        ...record,
        score: cosineSimilarity(queryVector, record.vector),
      }))
      .filter((record) => record.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  }

  size() {
    return this.records.length
  }

  clear() {
    this.records = []
  }
}
```

这版保留了最关键的三个能力：

1. `upsert()` 可以重复导入同一批 chunk
2. `search()` 能带 `threshold`
3. `size()` 便于做健康检查和调试输出

---

## 七、一个更完整的 `RagPipeline`

```js
// RagPipeline.js
import { chunkMarkdown } from './chunker.js'
import { embedTexts } from './embedder.js'
import { llmClient } from './clients.js'

export class RagPipeline {
  constructor({ vectorStore, chunkOptions = {} }) {
    this.vectorStore = vectorStore
    this.chunkOptions = chunkOptions
    this.llmModel = process.env.LLM_MODEL || 'deepseek-chat'
    this.topK = Number(process.env.TOP_K || 5)
    this.threshold = Number(process.env.SIMILARITY_THRESHOLD || 0.5)
  }

  async ingestDocument(docId, text, metadata = {}) {
    const chunks = chunkMarkdown(text, this.chunkOptions)
    const vectors = await embedTexts(chunks.map((chunk) => chunk.text))

    const records = chunks.map((chunk, index) => ({
      id: `${docId}:${index}`,
      text: chunk.text,
      vector: vectors[index],
      metadata: {
        ...metadata,
        chunkIndex: index,
        chunkStart: chunk.start,
        chunkEnd: chunk.end,
      },
    }))

    await this.vectorStore.upsert(records)

    return {
      chunkCount: records.length,
      records,
    }
  }

  async retrieve(question, options = {}) {
    const [queryVector] = await embedTexts([question])

    return this.vectorStore.search(
      queryVector,
      options.topK ?? this.topK,
      options.threshold ?? this.threshold,
    )
  }

  buildContext(hits) {
    return hits
      .map((item, index) => {
        const source = item.metadata?.source || 'unknown'
        return `[来源${index + 1} | ${source} | score=${item.score.toFixed(4)}]\n${item.text}`
      })
      .join('\n\n---\n\n')
  }

  async answer(question, options = {}) {
    const hits = await this.retrieve(question, options)
    const context = this.buildContext(hits)

    const response = await llmClient.chat.completions.create({
      model: this.llmModel,
      messages: [
        {
          role: 'system',
          content: '你是文档问答助手，只能基于提供的上下文回答。如果资料不足，请明确说“文档中未提及”。',
        },
        {
          role: 'user',
          content: `参考内容：\n${context}\n\n问题：${question}`,
        },
      ],
      temperature: 0.2,
    })

    return {
      answer: response.choices[0]?.message?.content || '',
      hits,
    }
  }
}
```

现在这版 `RagPipeline` 保留了“骨架清晰”的优点，也把真实项目常用的细节补回来了：

- 入库时保留 chunk 范围信息
- 检索时支持 `threshold`
- Prompt 里带简单来源与得分

---

## 八、补回一个端到端 `index.js`

```js
// index.js
import 'dotenv/config'
import { RagPipeline } from './RagPipeline.js'
import { VectorStore } from './vector-store.js'

const demoDoc = `
# DeepSeek API 使用说明

## 模型职责

在这个项目里，DeepSeek 负责最终回答生成；embedding 使用本地 OpenAI-compatible 服务。

## 工具调用

如果你要做 function calling，请使用 deepseek-chat，不要把 deepseek-reasoner 放进工具循环。

## RAG 约束

向量化与检索由本地 embedding 服务完成，回答阶段再把检索结果交给 DeepSeek 生成。
`

async function main() {
  const vectorStore = new VectorStore()
  const pipeline = new RagPipeline({
    vectorStore,
    chunkOptions: {
      chunkSize: Number(process.env.CHUNK_SIZE || 800),
      overlap: Number(process.env.CHUNK_OVERLAP || 160),
    },
  })

  const ingestResult = await pipeline.ingestDocument('deepseek-guide', demoDoc, {
    source: 'deepseek-guide.md',
    title: 'DeepSeek API 使用说明',
  })

  console.log('[ingest] chunkCount =', ingestResult.chunkCount)
  console.log('[ingest] vectorStore size =', vectorStore.size())

  const { answer, hits } = await pipeline.answer('这个项目里谁负责 embedding，谁负责最终回答？')

  console.log('\n[hits]')
  hits.forEach((item, index) => {
    console.log(`${index + 1}. score=${item.score.toFixed(4)} ${item.metadata.source}`)
  })

  console.log('\n[answer]')
  console.log(answer)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
```

---

## 九、验证步骤

1. 安装依赖：`npm install openai dotenv`
2. 启动本地 embedding 服务，并确认 `EMBEDDING_BASE_URL` 与 `EMBEDDING_MODEL` 可用
3. 写好 `.env` 后执行：`node index.js`
4. 核对输出：
   - `chunkCount` 是否大于 0
   - `vectorStore size` 是否等于 chunk 数量
   - 检索结果是否来自正确段落
   - 最终答案是否遵守“DeepSeek 只负责生成”的边界

---

## 十、小结

这一节最重要的不是 `RagPipeline` 这个类名，而是这条主线：

1. 本地 embedding 负责向量化
2. DeepSeek 负责回答
3. 两者用独立配置管理
4. 教程里依然要保留足够完整的模块示例，方便你后面直接拿去改项目

下一节我们继续在这个边界上加 rerank。
