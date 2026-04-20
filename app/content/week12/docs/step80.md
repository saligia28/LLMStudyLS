# Step 80: 应用落地｜加入 embedding 存储

## 学习目标

这一节要把上传后的 chunk 真正接进索引系统。

完成后你应该能：

1. 把 chunking 输出送进本地 embedding 服务
2. 把生成后的向量写入向量库
3. 在文件重复上传时替换旧索引
4. 继续保持“DeepSeek 生成 + 本地 embedding”的职责边界

> **本节默认能力边界**：Step 80 只处理本地 embedding 与索引入库，不调用 DeepSeek 生成模型。

---

## 一、这一步到底做什么

```text
POST /api/upload
  ↓
读取文档
  ↓
切分 chunk
  ↓
调用本地 embedding 服务
  ↓
写入向量库
```

这一节是典型的“检索底座”章节，不属于聊天生成链。

---

## 二、推荐的 embedding 配置

```bash
EMBEDDING_BACKEND=openai-compatible
EMBEDDING_BASE_URL=http://localhost:11434/v1
EMBEDDING_API_KEY=ollama
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_BATCH_SIZE=16
EMBEDDING_CACHE_FILE=./.cache/embeddings.json
```

和生成链保持分离：

```bash
DEEPSEEK_API_KEY=your-key
DEEPSEEK_BASEURL=https://api.deepseek.com
LLM_MODEL=deepseek-chat
```

---

## 三、补回一个更完整的 `embedder.js`

```js
// server/services/embedder.js
import OpenAI from 'openai'

const embeddingClient = new OpenAI({
  apiKey: process.env.EMBEDDING_API_KEY || 'local',
  baseURL: process.env.EMBEDDING_BASE_URL,
})

const BATCH_SIZE = Number(process.env.EMBEDDING_BATCH_SIZE || 16)

function normalizeText(text) {
  return text.replace(/\s+/g, ' ').trim()
}

export async function embedChunks(chunks) {
  if (chunks.length === 0) return []

  const vectors = []

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE)

    const response = await embeddingClient.embeddings.create({
      model: process.env.EMBEDDING_MODEL,
      input: batch.map((chunk) => normalizeText(chunk.text)),
    })

    const ordered = [...response.data]
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding)

    vectors.push(...ordered)
  }

  return chunks.map((chunk, index) => ({
    ...chunk,
    vector: vectors[index],
  }))
}
```

这段代码恢复的是“真实项目里最好保留”的几个点：

- 分批请求
- 输入标准化
- 按 `index` 重新排序

---

## 四、把向量存储写完整一些

```js
// server/services/vector-store.js
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

class VectorStore {
  constructor() {
    this.docs = new Map()
  }

  replaceDocument(docId, records) {
    this.docs.set(docId, {
      indexedAt: new Date().toISOString(),
      records,
    })
  }

  removeDocument(docId) {
    this.docs.delete(docId)
  }

  listDocuments() {
    return [...this.docs.entries()].map(([docId, value]) => ({
      docId,
      indexedAt: value.indexedAt,
      chunkCount: value.records.length,
    }))
  }

  search(queryVector, topK = 5) {
    const hits = []

    for (const [docId, value] of this.docs.entries()) {
      for (const record of value.records) {
        hits.push({
          ...record,
          docId,
          score: cosineSimilarity(queryVector, record.vector),
        })
      }
    }

    return hits
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  }

  get totalChunks() {
    let count = 0
    for (const value of this.docs.values()) {
      count += value.records.length
    }
    return count
  }
}

export const vectorStore = new VectorStore()
```

`replaceDocument()` 这一步要保留，因为它正好对应“同名文件重新上传时替换旧索引”的用户体验。

---

## 五、补回一个可直接复用的 `indexer.js`

```js
// server/services/indexer.js
import { embedChunks } from './embedder.js'
import { vectorStore } from './vector-store.js'

export async function indexDocument({ docId, chunks, metadata = {} }) {
  const embeddedChunks = await embedChunks(chunks)

  const records = embeddedChunks.map((chunk, index) => ({
    id: `${docId}:${index}`,
    text: chunk.text,
    vector: chunk.vector,
    metadata: {
      ...metadata,
      ...chunk.metadata,
      chunkIndex: index,
    },
  }))

  vectorStore.replaceDocument(docId, records)

  return {
    docId,
    chunkCount: records.length,
    indexedAt: new Date().toISOString(),
  }
}
```

---

## 六、把上传路由接起来

```js
// server/routes/upload.js
import express from 'express'
import fs from 'fs/promises'
import { upload } from '../middleware/upload.js'
import { readDocument } from '../services/document-reader.js'
import { chunkDocument } from '../services/chunker.js'
import { indexDocument } from '../services/indexer.js'

const router = express.Router()

router.post('/upload', upload.array('document', 10), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: '没有收到文件' })
  }

  const results = []

  for (const file of req.files) {
    try {
      const text = await readDocument(file.path, file.originalname)
      const chunks = chunkDocument(text, file.originalname)
      const indexed = await indexDocument({
        docId: file.originalname,
        chunks,
        metadata: {
          filename: file.originalname,
          uploadedAt: new Date().toISOString(),
        },
      })

      results.push({
        filename: file.originalname,
        ok: true,
        chunkCount: indexed.chunkCount,
        indexedAt: indexed.indexedAt,
      })
    } catch (error) {
      results.push({
        filename: file.originalname,
        ok: false,
        error: error.message,
      })
    } finally {
      await fs.unlink(file.path).catch(() => {})
    }
  }

  return res.json({
    ok: true,
    results,
  })
})

export default router
```

这里把长示例补回来，是因为很多同学第一次把 RAG 接成产品，卡住的地方就是“知道服务模块，但不知道怎么把路由串起来”。

---

## 七、加一个健康检查接口

```js
// server/routes/health.js
import express from 'express'
import { vectorStore } from '../services/vector-store.js'

const router = express.Router()

router.get('/health', (req, res) => {
  return res.json({
    status: 'ok',
    docCount: vectorStore.listDocuments().length,
    totalChunks: vectorStore.totalChunks,
    docs: vectorStore.listDocuments(),
  })
})

export default router
```

这一步虽然简单，但排查“为什么上传了文档却搜不到”时非常有用。

---

## 八、小结

这一节最重要的是把职责立稳：

1. Step 80 负责本地 embedding 入库
2. DeepSeek 生成链不参与这一节
3. 向量记录里要保留清晰 metadata，方便后面引用和调试
4. 路由、索引器、向量存储这三层都值得保留完整示例

下一节我们再把这些索引接到前端问答体验里。
