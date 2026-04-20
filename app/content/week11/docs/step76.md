# Step 76: RAG Pipeline｜加入缓存策略

## 学习目标

这一节解决的核心问题是：**在“本地 embedding + DeepSeek 生成”的主线下，哪些地方最值得缓存？**

完成后你应该能：

1. 区分 embedding 缓存、检索缓存、答案缓存
2. 给本地 embedding 结果加内存缓存和文件缓存
3. 为重复查询加上检索结果缓存
4. 理解为什么答案缓存要比 embedding 缓存更谨慎

> **本节默认能力边界**：embedding 缓存只针对本地向量服务；DeepSeek 侧主要缓存 query rewrite / rerank / answer 的上游结果，而不是盲目缓存最终回答。

---

## 一、RAG 主线里最值得缓存的层

```text
用户问题
  ↓
Query Embedding  ← 强烈建议缓存
  ↓
向量检索结果    ← 建议缓存
  ↓
DeepSeek 回答    ← 谨慎缓存

文档入库时的 Chunk Embedding ← 强烈建议缓存
```

推荐优先级：

1. 文档 embedding 缓存
2. query embedding 缓存
3. 检索结果缓存
4. 最终答案缓存

---

## 二、最小 embedding 缓存

```js
class EmbeddingCache {
  constructor() {
    this.cache = new Map()
  }

  normalize(text) {
    return text.trim().replace(/\s+/g, ' ')
  }

  get(text) {
    return this.cache.get(this.normalize(text)) || null
  }

  set(text, vector) {
    this.cache.set(this.normalize(text), vector)
  }
}
```

接进本地 embedding 服务：

```js
const embeddingCache = new EmbeddingCache()

async function embedWithCache(text) {
  const cached = embeddingCache.get(text)
  if (cached) return cached

  const response = await embeddingClient.embeddings.create({
    model: process.env.EMBEDDING_MODEL,
    input: text,
  })

  const vector = response.data[0].embedding
  embeddingCache.set(text, vector)
  return vector
}
```

---

## 三、持久化缓存文件

```js
import fs from 'fs'
import path from 'path'

class PersistentEmbeddingCache {
  constructor(cacheFile = process.env.EMBEDDING_CACHE_FILE || './.cache/embeddings.json') {
    this.cacheFile = cacheFile
    this.cache = this.load()
  }

  load() {
    try {
      if (fs.existsSync(this.cacheFile)) {
        return JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'))
      }
    } catch (error) {
      console.warn('加载 embedding 缓存失败:', error.message)
    }
    return {}
  }

  flush() {
    fs.mkdirSync(path.dirname(this.cacheFile), { recursive: true })
    fs.writeFileSync(this.cacheFile, JSON.stringify(this.cache))
  }
}
```

这个缓存的收益尤其体现在：

- 文档重复入库
- 开发环境反复重启
- 大量调试 query rewrite / rerank 时不想重复 embed

---

## 四、检索结果缓存

如果 query embedding 已经稳定，下一层可以缓存的是检索结果：

```js
class QueryCache {
  constructor(ttlMs = 10 * 60 * 1000) {
    this.cache = new Map()
    this.ttlMs = ttlMs
  }

  get(key) {
    const item = this.cache.get(key)
    if (!item) return null
    if (Date.now() - item.createdAt > this.ttlMs) {
      this.cache.delete(key)
      return null
    }
    return item.value
  }

  set(key, value) {
    this.cache.set(key, {
      value,
      createdAt: Date.now(),
    })
  }
}
```

注意：**文档有变更时，检索缓存必须失效。**

---

## 五、为什么最终答案缓存更谨慎

答案缓存确实省钱，但风险也更大：

- 文档一变，答案就可能过时
- 不同 prompt 模板可能得到不同输出
- 加入 citation 后，引用编号也会受上下文影响

所以学习阶段更建议：

- 先缓存 embedding
- 再缓存检索结果
- 最后才考虑缓存最终答案

---

## 六、小结

这一节的关键结论很简单：

1. 本地 embedding 缓存是 RAG 主线里 ROI 最高的一层
2. 检索缓存次之，但要有失效策略
3. 最终答案缓存不要一上来就做

下一节我们把这条 DeepSeek + 本地 embedding 的主线整理成一份可复用文档。
