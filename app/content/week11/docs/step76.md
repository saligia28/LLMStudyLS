# Step 76: RAG Pipeline｜加入缓存策略

## 学习目标

这一节解决的核心问题：**embedding 和检索结果都可以缓存，怎么做最合理？**

完成后你应该能：

1. 理解 RAG 系统中哪些操作最值得缓存
2. 实现 embedding 的内存缓存和持久化缓存
3. 实现检索结果缓存（exact match 和 semantic dedup）
4. 用语义相似度识别"意思相同的问题"，避免重复调用
5. 评估缓存命中率和成本节约

> **核心**：embedding API 调用有成本和延迟，相似问题没必要反复调用。缓存是 RAG 系统从"能跑"到"省钱"的关键一步。

---

## 一、RAG 中的缓存机会

```text
用户问题
   ↓
[1] Query Embedding  ← 可缓存（相同问题 → 相同 embedding）
   ↓
[2] 向量搜索结果     ← 可缓存（相同 embedding → 相同召回）
   ↓
[3] LLM 回答        ← 可缓存（相同上下文 → 相同回答）
   ↓
最终答案

[4] 文档 Embedding  ← 建库时缓存（避免重复处理同一文档）
```

最值得缓存的两层：

| 缓存层 | 收益 | 风险 |
| --- | --- | --- |
| Query Embedding | 省 API 调用费用，降延迟 | 低 |
| 文档 Embedding | 避免重复入库 | 低 |
| 检索结果 | 快速响应重复问题 | 文档更新后需失效 |
| LLM 回答 | 最大收益 | 文档更新后答案可能过时 |

---

## 二、Embedding 缓存

### 2.1 内存缓存（Map）

```js
class EmbeddingCache {
  constructor() {
    this.cache = new Map()
    this.hits = 0
    this.misses = 0
  }

  _key(text) {
    // 去掉多余空白，保证同义文本命中同一 key
    return text.trim().replace(/\s+/g, ' ')
  }

  get(text) {
    const key = this._key(text)
    if (this.cache.has(key)) {
      this.hits++
      return this.cache.get(key)
    }
    this.misses++
    return null
  }

  set(text, embedding) {
    this.cache.set(this._key(text), embedding)
  }

  stats() {
    const total = this.hits + this.misses
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? (this.hits / total * 100).toFixed(1) + '%' : '0%',
      size: this.cache.size,
    }
  }
}
```

### 2.2 持久化缓存（JSON 文件）

内存缓存进程重启就消失。持久化缓存把结果存到磁盘：

```js
import fs from 'fs'
import path from 'path'

class PersistentEmbeddingCache {
  constructor(cacheFile = './.cache/embeddings.json') {
    this.cacheFile = cacheFile
    this.cache = this._load()
    this.dirty = false
  }

  _load() {
    try {
      const dir = path.dirname(this.cacheFile)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      if (fs.existsSync(this.cacheFile)) {
        return JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'))
      }
    } catch (e) {
      console.warn('缓存文件加载失败，从空缓存开始:', e.message)
    }
    return {}
  }

  _key(text) {
    return text.trim().replace(/\s+/g, ' ')
  }

  get(text) {
    return this.cache[this._key(text)] || null
  }

  set(text, embedding) {
    this.cache[this._key(text)] = embedding
    this.dirty = true
  }

  // 批量写入，避免频繁磁盘 IO
  flush() {
    if (!this.dirty) return
    fs.writeFileSync(this.cacheFile, JSON.stringify(this.cache, null, 0))
    this.dirty = false
    console.log(`缓存已写入磁盘，共 ${Object.keys(this.cache).length} 条`)
  }

  size() {
    return Object.keys(this.cache).length
  }
}
```

### 2.3 接入 RagPipeline

```js
class RagPipelineWithCache {
  constructor(options = {}) {
    this.embeddingCache = new PersistentEmbeddingCache(options.cacheFile)
    this.vectorStore = options.vectorStore
    this.client = options.client
  }

  async embed(text) {
    // 先查缓存
    const cached = this.embeddingCache.get(text)
    if (cached) return cached

    // 缓存未命中，调用 API
    const response = await this.client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    })
    const embedding = response.data[0].embedding

    // 写入缓存
    this.embeddingCache.set(text, embedding)
    return embedding
  }

  async ingest(chunks) {
    const results = []
    for (const chunk of chunks) {
      const embedding = await this.embed(chunk.text)
      results.push({ ...chunk, embedding })
    }
    // 所有 chunk 处理完后批量写缓存
    this.embeddingCache.flush()
    return results
  }
}
```

---

## 三、查询结果缓存

### 3.1 精确匹配缓存

对完全相同的问题直接返回缓存结果：

```js
class QueryCache {
  constructor(ttlMs = 10 * 60 * 1000) { // 默认 10 分钟过期
    this.cache = new Map()
    this.ttl = ttlMs
  }

  _key(query) {
    return query.trim().toLowerCase()
  }

  get(query) {
    const entry = this.cache.get(this._key(query))
    if (!entry) return null
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(this._key(query))
      return null
    }
    return entry.result
  }

  set(query, result) {
    this.cache.set(this._key(query), {
      result,
      timestamp: Date.now(),
    })
  }

  invalidate() {
    this.cache.clear()
    console.log('查询缓存已清空')
  }
}
```

### 3.2 语义去重缓存

精确匹配只能命中字面相同的问题。**语义缓存**可以识别"意思相同"的问题：

```js
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

class SemanticQueryCache {
  constructor(threshold = 0.95) {
    this.entries = []   // [{ queryEmbedding, query, result }]
    this.threshold = threshold  // 相似度阈值，>= 此值视为"同一问题"
  }

  findSimilar(queryEmbedding) {
    let bestSim = -1
    let bestEntry = null

    for (const entry of this.entries) {
      const sim = cosineSimilarity(queryEmbedding, entry.queryEmbedding)
      if (sim > bestSim) {
        bestSim = sim
        bestEntry = entry
      }
    }

    if (bestSim >= this.threshold) {
      console.log(`语义缓存命中 (相似度 ${bestSim.toFixed(3)}): "${bestEntry.query}"`)
      return bestEntry.result
    }
    return null
  }

  add(queryEmbedding, query, result) {
    this.entries.push({ queryEmbedding, query, result })
  }
}
```

### 3.3 使用示例

```js
const semanticCache = new SemanticQueryCache(0.95)

async function cachedQuery(pipeline, question) {
  // 1. 先把问题 embed
  const queryEmbedding = await pipeline.embed(question)

  // 2. 查语义缓存
  const cached = semanticCache.findSimilar(queryEmbedding)
  if (cached) return { ...cached, fromCache: true }

  // 3. 缓存未命中，正常走 RAG
  const result = await pipeline.query(question, queryEmbedding)

  // 4. 写入语义缓存
  semanticCache.add(queryEmbedding, question, result)

  return { ...result, fromCache: false }
}

// 测试语义缓存
const q1 = '什么是 RAG？'
const q2 = 'RAG 是什么意思？'   // 意思相同，预期命中缓存
const q3 = '如何安装 vLLM？'    // 不同话题，预期不命中

const r1 = await cachedQuery(pipeline, q1)
console.log('Q1 fromCache:', r1.fromCache) // false

const r2 = await cachedQuery(pipeline, q2)
console.log('Q2 fromCache:', r2.fromCache) // true（相似度 > 0.95）

const r3 = await cachedQuery(pipeline, q3)
console.log('Q3 fromCache:', r3.fromCache) // false
```

---

## 四、缓存失效策略

### 4.1 什么时候必须让缓存失效

```text
文档内容更新  → 检索结果缓存、LLM 回答缓存全部失效
新增文档      → 检索结果缓存失效（可能召回新文档的内容）
文档删除      → 同上
```

```js
class CacheManager {
  constructor(queryCache, embeddingCache) {
    this.queryCache = queryCache
    this.embeddingCache = embeddingCache
  }

  // 文档更新时调用
  onDocumentUpdate(docId) {
    console.log(`文档 ${docId} 已更新，清空查询缓存`)
    this.queryCache.invalidate()
    // embedding 缓存不需要清空（文档内容的 embedding 是稳定的）
  }

  // 完整重置
  resetAll() {
    this.queryCache.invalidate()
    console.log('所有缓存已重置')
  }
}
```

### 4.2 TTL vs 事件驱动失效

| 方式 | 优点 | 缺点 |
| --- | --- | --- |
| TTL（定时过期）| 简单，不需要感知文档变化 | 可能返回短暂过时的答案 |
| 事件驱动 | 精准，文档更新立即失效 | 需要文档管理系统通知缓存层 |
| 混合 | 兜底 TTL + 主动通知 | 稍复杂 |

开发阶段用 TTL 足够；生产环境建议用事件驱动 + TTL 兜底。

---

## 五、小结

1. **embedding 缓存** 是 ROI 最高的缓存：同一个 chunk 不应该被 embed 两次。
2. **语义缓存** 比精确匹配命中率高得多，用 0.95 相似度阈值是个好的起点。
3. 缓存要有**失效机制**，文档更新时清空查询缓存，但 embedding 缓存可以保留。
4. 持久化缓存到磁盘，重启进程后不丢失，但要注意文件大小。
5. 上线前测一下缓存命中率，<30% 说明问题分布太分散，缓存价值有限。
