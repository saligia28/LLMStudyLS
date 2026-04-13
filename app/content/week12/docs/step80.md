# Step 80: 应用落地｜加入 embedding 存储

## 学习目标

Step 79 把文件切成了 chunk 数组。这一节把这些 chunk 送进 embedding pipeline，存储向量，并在文件变更时支持重建索引。

完成后你应该能：

1. 把 chunking 输出接入 Week 9 的 embedding 调用逻辑
2. 在内存或简单 JSON 文件中存储向量索引
3. 在上传流程中展示索引进度
4. 当同名文件重新上传时，支持替换旧索引

> **核心**：这一步是 RAG 的"入库"环节。chunk → embedding → 存储，三步之后文档才真正可被检索。

---

## 一、完整入库链路

```text
POST /api/upload
  ↓
multer 保存文件
  ↓
readDocument()    — 读取并清理文本
  ↓
chunkDocument()   — 切分成 chunk 数组
  ↓
embedChunks()     — 批量调用 embedding API
  ↓
vectorStore.add() — 存储 { vector, text, metadata }
  ↓
返回 { chunkCount, indexedAt }
```

---

## 二、Embedding 批量调用

### 2.1 复用 Week 9 的 embedding 函数

```js
// server/services/embedder.js
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey:  process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL || 'https://api.deepseek.com'
})

const EMBED_MODEL = 'deepseek-embedding'

/**
 * 对单个文本生成 embedding 向量
 */
export async function embedText(text) {
  const res = await client.embeddings.create({
    model: EMBED_MODEL,
    input: text
  })
  return res.data[0].embedding
}

/**
 * 批量 embedding，支持速率限制下的分批发送
 * @param {string[]} texts
 * @param {number} batchSize - 每批大小，默认 20
 * @returns {Promise<number[][]>}
 */
export async function embedBatch(texts, batchSize = 20) {
  const results = []

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)

    const res = await client.embeddings.create({
      model: EMBED_MODEL,
      input: batch
    })

    // API 返回的顺序与 input 顺序一致
    const vectors = res.data
      .sort((a, b) => a.index - b.index)
      .map(item => item.embedding)

    results.push(...vectors)

    // 简单的速率限制缓冲（避免 429）
    if (i + batchSize < texts.length) {
      await sleep(200)
    }
  }

  return results
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
```

### 2.2 为什么要分批

DeepSeek 等 API 通常对单次请求的输入数量有限制（通常 20-100 条）。分批可以：

1. 避免超出 API 限制导致 400 错误
2. 在批次间加小延迟，防止触发速率限制
3. 更容易在每批完成后更新进度

---

## 三、向量存储

### 3.1 内存存储（开发快速原型）

```js
// server/services/vector-store.js

/**
 * 内存向量存储
 * 结构：Map<docId, { chunks: Array<{ text, vector, metadata }> }>
 *
 * 生产场景应替换为 Chroma / Qdrant / pgvector 等持久化方案。
 */
class VectorStore {
  constructor() {
    this._store = new Map() // docId → { chunks, indexedAt }
  }

  /**
   * 添加或替换一个文档的所有 chunk
   * @param {string} docId - 文档唯一标识（通常用文件名）
   * @param {Array<{ text: string, vector: number[], metadata: object }>} chunks
   */
  add(docId, chunks) {
    this._store.set(docId, {
      chunks,
      indexedAt: new Date().toISOString()
    })
    console.log(`[VectorStore] ${docId}: ${chunks.length} chunks indexed`)
  }

  /**
   * 删除某文档的索引
   */
  remove(docId) {
    this._store.delete(docId)
  }

  /**
   * 列出所有已索引文档
   */
  list() {
    return [...this._store.entries()].map(([id, v]) => ({
      id,
      chunkCount: v.chunks.length,
      indexedAt:  v.indexedAt
    }))
  }

  /**
   * 余弦相似度检索
   * @param {number[]} queryVector
   * @param {number} topK
   * @returns {Array<{ text, score, metadata }>}
   */
  search(queryVector, topK = 5) {
    const candidates = []

    for (const { chunks } of this._store.values()) {
      for (const chunk of chunks) {
        const score = cosineSimilarity(queryVector, chunk.vector)
        candidates.push({ text: chunk.text, score, metadata: chunk.metadata })
      }
    }

    return candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  }

  /**
   * 返回已索引的 chunk 总数（用于健康检查）
   */
  get totalChunks() {
    let count = 0
    for (const { chunks } of this._store.values()) count += chunks.length
    return count
  }
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

// 单例导出，整个进程共享同一个存储
export const vectorStore = new VectorStore()
```

### 3.2 持久化到 JSON 文件（可选升级）

内存存储在服务重启后丢失索引。如果需要持久化，可以把数据序列化到 JSON：

```js
// server/services/vector-store-persistent.js
import fs from 'fs/promises'

const INDEX_FILE = './data/vector-index.json'

class PersistentVectorStore {
  constructor() {
    this._store = new Map()
    this._loaded = false
  }

  async init() {
    if (this._loaded) return
    try {
      const raw  = await fs.readFile(INDEX_FILE, 'utf-8')
      const data = JSON.parse(raw)
      for (const [id, v] of Object.entries(data)) {
        this._store.set(id, v)
      }
      console.log(`[VectorStore] 从磁盘加载 ${this._store.size} 个文档索引`)
    } catch {
      // 文件不存在时忽略
    }
    this._loaded = true
  }

  async save() {
    const obj = Object.fromEntries(this._store)
    await fs.mkdir('./data', { recursive: true })
    await fs.writeFile(INDEX_FILE, JSON.stringify(obj), 'utf-8')
  }

  async add(docId, chunks) {
    await this.init()
    this._store.set(docId, { chunks, indexedAt: new Date().toISOString() })
    await this.save()
  }

  // search / list / remove 与内存版相同...
}
```

> 注意：向量数据是浮点数组，JSON 序列化后体积会膨胀约 3-4 倍。大规模场景请使用 Chroma、Qdrant 或 SQLite + sqlite-vss。

---

## 四、把入库逻辑整合进上传路由

### 4.1 新建索引服务

```js
// server/services/indexer.js
import path from 'path'
import { embedBatch } from './embedder.js'
import { vectorStore } from './vector-store.js'

/**
 * 对 chunk 数组做 embedding 并存入向量库
 * @param {string} docId         - 文档唯一 ID（文件名）
 * @param {string[]} chunks      - chunk 文本数组
 * @param {object} baseMeta      - 基础 metadata（filename、uploadedAt 等）
 * @param {function} [onProgress] - 进度回调 (indexed, total) => void
 */
export async function indexDocument(docId, chunks, baseMeta = {}, onProgress) {
  const texts   = chunks
  const vectors = await embedBatch(texts)

  const entries = vectors.map((vector, i) => ({
    text: texts[i],
    vector,
    metadata: {
      ...baseMeta,
      chunkIndex: i,
      chunkTotal: chunks.length
    }
  }))

  vectorStore.add(docId, entries)

  if (onProgress) onProgress(entries.length, entries.length)

  return entries.length
}
```

### 4.2 更新上传路由

```js
// server/routes/upload.js（更新版）
import express from 'express'
import path from 'path'
import fs from 'fs/promises'
import { upload } from '../middleware/upload.js'
import { readDocument } from '../services/document-reader.js'
import { chunkDocument } from '../services/chunker.js'
import { indexDocument } from '../services/indexer.js'

const router = express.Router()

router.post(
  '/upload',
  upload.array('document', 10),
  async (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '没有收到文件' })
    }

    const results = []

    for (const file of req.files) {
      const ext    = path.extname(file.originalname).toLowerCase()
      const docId  = file.originalname // 用原始文件名作为文档 ID

      try {
        // 1. 读取并预处理文本
        const text = await readDocument(file.path, file.originalname)

        // 2. Chunking
        const chunks = chunkDocument(text, ext)

        // 3. Embedding + 存储（同名文件会替换旧索引）
        const indexed = await indexDocument(
          docId,
          chunks,
          { filename: file.originalname, uploadedAt: new Date().toISOString() }
        )

        results.push({
          filename:   file.originalname,
          ok:         true,
          chunkCount: indexed,
          charCount:  text.length
        })
      } catch (err) {
        console.error(`[upload] ${file.originalname} 失败:`, err)
        results.push({
          filename: file.originalname,
          ok:       false,
          error:    err.message
        })
      } finally {
        // 处理完毕后删除临时文件
        await fs.unlink(file.path).catch(() => {})
      }
    }

    res.json({ ok: true, results })
  }
)

export default router
```

---

## 五、处理同名文件重新上传

当用户上传同名文件时，应替换旧索引而不是追加：

```js
// vectorStore.add() 已经用 Map.set() 实现替换
// 只需在路由里统一用 filename 作为 docId 即可

// 如果想提示用户"已替换旧版本"：
const existed = vectorStore.list().some(d => d.id === docId)
// 在返回结果里加上 replaced: existed
```

---

## 六、健康检查与索引状态

```js
// server/routes/health.js
import express from 'express'
import { vectorStore } from '../services/vector-store.js'

const router = express.Router()

router.get('/health', (req, res) => {
  const docs = vectorStore.list()
  res.json({
    status:      'ok',
    docCount:    docs.length,
    totalChunks: vectorStore.totalChunks,
    docs:        docs.map(d => ({ id: d.id, chunkCount: d.chunkCount, indexedAt: d.indexedAt }))
  })
})

export default router
```

```bash
curl http://localhost:3001/api/health
# 期望：
# {
#   "status": "ok",
#   "docCount": 2,
#   "totalChunks": 34,
#   "docs": [...]
# }
```

---

## 七、前端展示索引结果

在 Step 78 的上传 UI 里，上传完成后可以展示 chunk 数量：

```js
// 更新 upload.js 中的 setFileStatus 调用
const res = await uploadFile(file) // 后端现在返回 chunkCount
setFileStatus(name, 'done', `完成 · ${res.chunkCount ?? 0} chunks 已索引`)
```

---

## 小结

1. 批量 embedding 要按合理批次（20-100）发送，并在批次间加小延迟，防止 API 速率限制。
2. 内存向量存储适合开发和演示，生产环境应使用支持持久化和 ANN 检索的向量数据库。
3. 用文件名作为 `docId` 并在 `add()` 时覆盖，可以自然实现"同名文件替换旧索引"的语义。
4. 余弦相似度计算是向量检索的核心，理解它比调用库函数更重要。
5. 健康检查端点让你随时验证索引状态，是调试和运维的好帮手。
