# Step 72: RAG Pipeline｜加入 rerank（可选）

## 学习目标

向量检索给的是"语义相似度"，但相似度不等于相关性。这一节要解决的是：**在向量检索之后，如何对结果做二次排序，让真正有用的 chunk 排到最前面。**

完成后你应该能：

1. 说明向量相似度与语义相关性之间的差距
2. 理解 cross-encoder reranker 的工作原理
3. 实现一个基于 LLM 评分的轻量 reranker
4. 实现一个基于关键词重叠的快速 reranker（zero-cost）
5. 将 rerank 模块接入 Step 71 的 `RagPipeline`

> rerank 是 RAG Pipeline 的可选增强层，但在问题模糊或文档重复度高时，它的收益非常明显。

---

## 一、为什么向量检索的结果需要 rerank

向量检索基于余弦相似度，找的是"向量空间里的邻居"。但有几个场景下它会失效：

### 场景 1：语义相近但话题不同

问题："Python 怎么读取文件？"

| chunk | 相似度 | 实际相关性 |
| --- | --- | --- |
| "Python 的文件 I/O 操作详解" | 0.92 | 高 |
| "Python 的文件路径处理" | 0.88 | 中（不直接回答） |
| "Python 读取 CSV 文件" | 0.86 | 低（问的是通用文件） |

靠相似度排，第一条最有用。但在真实文档中，这三条的向量可能非常接近，排序经常乱。

### 场景 2：泛化问题 vs. 具体 chunk

问题："如何优化性能？"

这个问题的向量几乎和任何带"性能"字眼的 chunk 都有不低的相似度。reranker 能根据"问题 + chunk"的组合判断真实相关性，而不是单独看 chunk 向量。

### 核心区别

```text
向量检索:   query_vec ↔ chunk_vec （各自独立）
Reranker:  (query, chunk) → score  （联合建模）
```

联合建模能看到 query 和 chunk 的交互，排序更准。

---

## 二、两种主流 rerank 方案

### 方案 A：Cross-Encoder（专用 rerank 模型）

真实工业方案，用专门训练的 cross-encoder 模型给 (query, chunk) 打分。
需要独立部署模型服务（如 Cohere Rerank、BGE-Reranker、ms-marco-MiniLM 等）。

```text
优点：精度最高
缺点：需要额外服务，有延迟和成本
```

### 方案 B：LLM 评分（本节实现）

直接用 LLM（如 DeepSeek）对每个 (query, chunk) 打相关性分。
零依赖，适合快速验证和中小规模场景。

```text
优点：无需额外服务，直接复用已有 LLM
缺点：每个 chunk 需一次 LLM 调用，Top-K 大时成本上升
```

### 方案 C：关键词重叠（本节实现）

统计 query 中的关键词在 chunk 中出现的频率，作为快速过滤和粗排。

```text
优点：零成本，无 API 调用
缺点：精度较低，对同义词无效
```

---

## 三、实现 LLM 评分 Reranker

```js
// reranker.js
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL || 'https://api.deepseek.com'
})

/**
 * 使用 LLM 对单个 (query, chunk) 打相关性分
 * 返回 0-10 的整数分
 */
async function scoreSingle(query, chunk, model = 'deepseek-chat') {
  const prompt = `请评估以下"参考内容"对回答"用户问题"的相关程度。
只输出一个 0 到 10 的整数分，不要输出任何其他内容。

评分标准：
- 10: 内容直接、完整地回答了问题
- 7-9: 内容高度相关，能帮助回答问题
- 4-6: 内容部分相关
- 1-3: 内容几乎不相关
- 0: 内容完全无关

用户问题：${query}

参考内容：
${chunk.slice(0, 600)}`

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 5
    })
    const raw = response.choices[0].message.content.trim()
    const score = parseInt(raw, 10)
    return isNaN(score) ? 5 : Math.min(10, Math.max(0, score))
  } catch (e) {
    console.warn(`[Reranker] 评分失败: ${e.message}，默认返回 5`)
    return 5
  }
}

/**
 * LLM reranker：对 Top-K 结果重新排序
 * @param {string} query
 * @param {Array<{text, metadata, score}>} results - 向量检索结果
 * @param {object} options
 * @param {number} options.topN - 重排后保留几条
 * @returns {Promise<Array<{text, metadata, score, rerankScore}>>}
 */
export async function llmRerank(query, results, { topN = 3, model = 'deepseek-chat' } = {}) {
  console.log(`[Reranker] 开始 LLM rerank，共 ${results.length} 条候选`)

  // 并发打分（有限并发，避免 rate limit）
  const scored = await Promise.all(
    results.map(async (r) => {
      const rerankScore = await scoreSingle(query, r.text, model)
      return { ...r, rerankScore }
    })
  )

  // 按 rerankScore 降序
  const reranked = scored
    .sort((a, b) => b.rerankScore - a.rerankScore)
    .slice(0, topN)

  console.log('[Reranker] 重排结果:')
  reranked.forEach((r, i) => {
    console.log(`  [${i + 1}] vectorScore=${r.score.toFixed(3)}  rerankScore=${r.rerankScore}  ${r.text.slice(0, 50)}...`)
  })

  return reranked
}
```

---

## 四、实现关键词 Reranker（零成本）

```js
/**
 * 关键词重叠 reranker
 * 统计 query 关键词在 chunk 中的命中率，与向量分做加权融合
 *
 * @param {string} query
 * @param {Array<{text, metadata, score}>} results
 * @param {object} options
 * @param {number} options.keywordWeight  - 关键词分权重，默认 0.3
 * @param {number} options.vectorWeight   - 向量分权重，默认 0.7
 * @param {number} options.topN
 */
export function keywordRerank(query, results, {
  keywordWeight = 0.3,
  vectorWeight  = 0.7,
  topN          = 3
} = {}) {
  // 简单分词：按空格、标点切词，过滤长度 < 2 的词
  const keywords = query
    .replace(/[，。？！,?.!]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2)

  const scored = results.map(r => {
    const textLower = r.text.toLowerCase()
    const hitCount  = keywords.filter(kw => textLower.includes(kw.toLowerCase())).length
    const keywordScore = keywords.length > 0 ? hitCount / keywords.length : 0
    const combinedScore = vectorWeight * r.score + keywordWeight * keywordScore

    return { ...r, keywordScore, combinedScore }
  })

  return scored
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, topN)
}
```

---

## 五、接入 RagPipeline

在 Step 71 的 `RagPipeline` 中加入 rerank 支持：

```js
// RagPipeline.js（新增 rerank 支持）
import { llmRerank, keywordRerank } from './reranker.js'

export class RagPipeline {
  constructor(options = {}) {
    // ... 原有配置 ...
    this.rerankMode = options.rerankMode ?? 'none'  // 'none' | 'keyword' | 'llm'
    this.topN       = options.topN       ?? 3
  }

  async query(question) {
    // Step 1: Query Embedding
    const queryVec = await embedText(question, this.embedModel)

    // Step 2: 向量检索（取更多候选以便 rerank）
    const fetchK    = this.rerankMode !== 'none' ? this.topK * 3 : this.topK
    const candidates = this.store.search(queryVec, fetchK)

    // Step 3: Rerank（可选）
    let results
    if (this.rerankMode === 'llm') {
      results = await llmRerank(question, candidates, { topN: this.topN })
    } else if (this.rerankMode === 'keyword') {
      results = keywordRerank(question, candidates, { topN: this.topN })
    } else {
      results = candidates.slice(0, this.topN)
    }

    // Step 4: Prompt 组装 + LLM 生成
    const contextText = results
      .map((r, i) => `[参考 ${i + 1}]\n${r.text}`)
      .join('\n\n---\n\n')

    const response = await client.chat.completions.create({
      model: this.chatModel,
      messages: [
        { role: 'system', content: '请根据参考内容回答用户问题，不要编造信息。' },
        { role: 'user',   content: `参考内容：\n${contextText}\n\n用户问题：${question}` }
      ],
      temperature: 0.3
    })

    return {
      answer: response.choices[0].message.content,
      context: results
    }
  }
}
```

---

## 六、对比实验

用同一个问题，分别跑三种模式，观察 context 质量差异：

```js
// compare.js
import 'dotenv/config'
import { RagPipeline } from './RagPipeline.js'

const DOC = `
# Node.js 性能优化指南

## 内存管理

避免全局变量和大对象长时间存活。使用 WeakMap 存储临时关联数据。
定期检查 heap 使用量，超过 1.5GB 时考虑分片处理。

## 异步模型

Node.js 是单线程事件循环，CPU 密集型任务会阻塞事件循环。
对于 CPU 密集任务，使用 worker_threads 隔离。
对于 I/O 密集任务，使用 async/await 配合连接池。

## 缓存策略

对于重复计算结果，使用 Map 或 LRU Cache 缓存。
对于数据库查询，使用 Redis 做分布式缓存，TTL 设为业务允许的最大值。

## 监控与分析

使用 clinic.js 做 flame graph 分析热点函数。
使用 --prof 标志收集 V8 profiling 数据。
关注 event loop lag，超过 100ms 时需要排查阻塞原因。
`

async function compare(question) {
  console.log('\n' + '='.repeat(60))
  console.log(`问题: ${question}`)

  for (const mode of ['none', 'keyword', 'llm']) {
    const pipeline = new RagPipeline({ rerankMode: mode, topK: 9, topN: 3 })
    await pipeline.ingest(DOC, { source: 'nodejs-perf' })
    const { context } = await pipeline.query(question)

    console.log(`\n[${mode.toUpperCase()} Rerank] Top-3 context:`)
    context.forEach((r, i) => {
      const score = r.rerankScore ?? r.combinedScore ?? r.score
      console.log(`  [${i+1}] score=${typeof score === 'number' ? score.toFixed(3) : score}  ${r.text.slice(0, 80).replace(/\n/g, ' ')}`)
    })
  }
}

compare('Node.js 如何处理 CPU 密集型任务？').catch(console.error)
```

### 预期观察

```text
[NONE Rerank] — 纯向量排序，可能把"监控"相关内容排进来
[KEYWORD Rerank] — "CPU 密集型"关键词命中好的 chunk 上升
[LLM Rerank]  — 真正回答问题的 chunk 排第一
```

---

## 七、rerank 的代价与收益权衡

| 模式 | 精度 | 延迟 | 成本 | 适用场景 |
| --- | --- | --- | --- | --- |
| 无 rerank | 中 | 最低 | 最低 | 问题清晰、文档质量高 |
| 关键词 rerank | 中高 | 极低 | 零 | 快速过滤，关键词明确 |
| LLM rerank | 最高 | 中（N × LLM 调用） | 中 | 问题模糊、文档重复度高 |
| 专用模型 rerank | 最高 | 低（本地推理） | 部署成本 | 生产大规模场景 |

> **核心**：rerank 的价值在于"向量检索召回了，但排序错了"的场景。如果你的 Top-1 命中率已经很高，加 rerank 收益有限；如果 Top-1 经常不是最佳答案，rerank 往往是性价比最高的提升手段。

---

## 小结

1. 向量相似度和语义相关性不完全等价，rerank 是弥补这个差距的常用手段。
2. LLM rerank 对每个 (query, chunk) 联合打分，精度最高但有额外 API 成本。
3. 关键词 rerank 零成本，适合作为快速粗排或与向量分加权融合。
4. 实际工程中常用策略：先用向量检索取 3×TopN 的候选，再用 reranker 精选 TopN。
5. rerank 是可选层，对问题清晰、文档质量高的场景可以先不加，等 precision 不达标时再引入。
