# Step 73: RAG Pipeline｜添加 query 重写（retrieval-augmented）

## 学习目标

用户的原始问题往往模糊、简短、甚至带有口语化表达，而文档里的内容是正式、结构化的专业写法。这种表述差距会导致向量检索找不到最相关的 chunk。这一节要解决的是：**在把问题送入 embedding 之前，先让 LLM 把它重写得更适合检索。**

完成后你应该能：

1. 理解 query 重写的动机：弥合用户问题与文档表述的词汇鸿沟
2. 实现基于 LLM 的 query 扩写（expansion）和改写（rewriting）
3. 理解 HyDE（Hypothetical Document Embedding）策略并实现它
4. 对比三种检索策略的召回效果
5. 将 query 重写模块接入 `RagPipeline`

> query 重写是 RAG 中最直接影响"召回率"的优化手段，成本低但效果显著。

---

## 一、为什么需要 query 重写

### 词汇鸿沟（Vocabulary Mismatch）

用户说的话和文档里写的话，可能语义相同但词汇完全不同：

```text
用户问题: "程序跑得太慢怎么办"
文档内容: "性能优化策略：减少不必要的 I/O 操作，使用连接池..."
```

"跑得太慢"和"性能优化"在向量空间里可能距离不算近，但语义上是同一个问题。

### 问题过于简短

```text
用户: "缓存怎么用"
文档: "Redis 缓存配置：设置 maxmemory-policy 为 allkeys-lru，TTL 建议..."
```

"怎么用"太通用，向量方向散，检索时容易召回不相关内容。

### 三种改善策略

```text
策略 A：Query Expansion   — 把短问题扩展成多个相关问题
策略 B：Query Rewriting   — 改写成更专业、更适合检索的表述
策略 C：HyDE              — 直接生成"假设答案"，用答案的向量去检索
```

---

## 二、策略 A：Query Expansion（扩展）

让 LLM 把一个问题扩展成 3-5 个相关子问题，然后用所有问题的向量分别检索，取并集。

```js
// queryRewriter.js
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL || 'https://api.deepseek.com'
})

/**
 * Query Expansion：将原始问题扩展为多个子问题
 * @param {string} query
 * @param {number} count - 扩展子问题数量，默认 3
 * @returns {Promise<string[]>} - 原始问题 + 扩展问题数组
 */
export async function expandQuery(query, count = 3, model = 'deepseek-chat') {
  const prompt = `你是一个信息检索专家。请将用户的问题扩展为 ${count} 个不同角度的相关子问题，以便在文档中检索到更全面的信息。

要求：
1. 每个子问题独占一行
2. 只输出子问题，不要编号，不要解释
3. 子问题应覆盖不同角度（定义、使用方法、原因、对比、注意事项等）

用户问题：${query}`

  const response = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.5
  })

  const raw = response.choices[0].message.content.trim()
  const expanded = raw.split('\n').map(l => l.trim()).filter(Boolean)

  // 将原始问题放在第一位
  return [query, ...expanded.slice(0, count)]
}
```

### 多查询检索

```js
/**
 * 使用多个查询向量检索，取结果并集（去重）
 */
export async function multiQuerySearch(queries, vectorStore, embedder, topK = 5) {
  const allResults = new Map()  // id → result

  for (const q of queries) {
    const qVec = await embedder(q)
    const results = vectorStore.search(qVec, topK)
    for (const r of results) {
      const key = r.text.slice(0, 50)  // 用文本前缀作去重 key
      if (!allResults.has(key) || allResults.get(key).score < r.score) {
        allResults.set(key, r)
      }
    }
  }

  // 按分数降序返回
  return Array.from(allResults.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}
```

---

## 三、策略 B：Query Rewriting（改写）

把口语化的问题改写成接近文档语言的专业表述。

```js
/**
 * Query Rewriting：将口语问题改写为更专业的检索友好表述
 */
export async function rewriteQuery(query, model = 'deepseek-chat') {
  const prompt = `你是一个文档检索专家。请将用户的口语化问题改写为一个更专业、更适合在技术文档中检索的表述。

要求：
1. 只输出改写后的问题，不要解释
2. 保留原始问题的核心意图
3. 使用更准确的技术术语
4. 适当补全缺失的上下文

原始问题：${query}
改写后：`

  const response = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3
  })

  const rewritten = response.choices[0].message.content.trim()
  console.log(`[QueryRewrite] "${query}" → "${rewritten}"`)
  return rewritten
}
```

### 实际效果示例

```text
原始：  "程序跑得太慢怎么办"
改写后："Node.js 应用性能优化方法与最佳实践"

原始：  "缓存怎么用"
改写后："Redis 缓存配置、使用策略与 TTL 设置方法"

原始：  "出错了如何排查"
改写后："应用错误调试与日志分析方法"
```

---

## 四、策略 C：HyDE（Hypothetical Document Embedding）

HyDE 的核心思路是：**不用问题的向量去检索，而是先让 LLM 生成一个假设性的答案，然后用这个假设答案的向量去检索。**

```text
直觉解释：
  - 问题的向量：方向散，因为问题本身是短句且口语化
  - 假设答案的向量：方向更接近文档，因为答案的表述风格和文档相似
```

```js
/**
 * HyDE：生成假设答案，用答案向量替代问题向量检索
 * @param {string} query
 * @returns {Promise<string>} - 假设答案文本
 */
export async function generateHypotheticalAnswer(query, model = 'deepseek-chat') {
  const prompt = `请根据以下问题，生成一段简洁的假设性回答（100-200字）。
这个回答不需要完全准确，只需要覆盖可能的答案范围，用于辅助文档检索。

问题：${query}
假设回答：`

  const response = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 300
  })

  return response.choices[0].message.content.trim()
}
```

---

## 五、接入 RagPipeline

```js
// RagPipeline.js（新增 queryMode 支持）
import {
  expandQuery,
  rewriteQuery,
  generateHypotheticalAnswer,
  multiQuerySearch
} from './queryRewriter.js'

export class RagPipeline {
  constructor(options = {}) {
    // ... 原有配置 ...
    // queryMode: 'none' | 'expand' | 'rewrite' | 'hyde'
    this.queryMode = options.queryMode ?? 'none'
  }

  async query(question) {
    let context

    if (this.queryMode === 'expand') {
      // 扩展为多个子问题，多路检索取并集
      console.log(`[QueryMode] expand — 扩展 "${question}"`)
      const queries = await expandQuery(question, 3)
      console.log(`[QueryMode] 扩展后 ${queries.length} 个查询:`, queries)
      context = await multiQuerySearch(queries, this.store, (q) => embedText(q, this.embedModel), this.topK)

    } else if (this.queryMode === 'rewrite') {
      // 改写问题后单路检索
      console.log(`[QueryMode] rewrite — 改写 "${question}"`)
      const rewritten = await rewriteQuery(question)
      const qVec = await embedText(rewritten, this.embedModel)
      context = this.store.search(qVec, this.topK)

    } else if (this.queryMode === 'hyde') {
      // 生成假设答案，用答案向量检索
      console.log(`[QueryMode] hyde — 生成假设答案`)
      const hypothesis = await generateHypotheticalAnswer(question)
      console.log(`[QueryMode] 假设答案: ${hypothesis.slice(0, 100)}...`)
      const hypoVec = await embedText(hypothesis, this.embedModel)
      context = this.store.search(hypoVec, this.topK)

    } else {
      // 默认：直接用原始问题
      const qVec = await embedText(question, this.embedModel)
      context = this.store.search(qVec, this.topK)
    }

    // Prompt 组装 + LLM 生成（同 Step 71）
    const contextText = context
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
      context
    }
  }
}
```

---

## 六、三种策略的对比实验

```js
// compare-query-modes.js
import 'dotenv/config'
import { RagPipeline } from './RagPipeline.js'

const DOC = `
# Redis 使用指南

## 基础命令

SET key value：设置键值
GET key：获取键值
DEL key：删除键
EXPIRE key seconds：设置过期时间（TTL）
TTL key：查询剩余过期时间

## 缓存策略

allkeys-lru：所有键按最近最少使用淘汰，适合缓存场景
volatile-lru：只对设有 TTL 的键做 LRU 淘汰
noeviction：不淘汰，内存满时返回错误

## 持久化

RDB：定期快照，重启恢复快，但可能丢失最近数据
AOF：记录每条写命令，数据更安全，文件较大
两种方式可同时开启，优先使用 AOF 恢复

## 连接池

生产环境建议使用连接池避免频繁建立 TCP 连接。
推荐配置：maxConnections = CPU 核数 × 4
`

const QUESTION = '缓存满了怎么处理'

async function compare() {
  console.log(`测试问题: "${QUESTION}"\n`)

  for (const mode of ['none', 'rewrite', 'expand', 'hyde']) {
    const pipeline = new RagPipeline({ queryMode: mode, topK: 3 })
    await pipeline.ingest(DOC, { source: 'redis-guide' })

    console.log('\n' + '─'.repeat(50))
    console.log(`[模式: ${mode.toUpperCase()}]`)

    const { context, answer } = await pipeline.query(QUESTION)

    console.log('召回的 context:')
    context.forEach((r, i) => {
      console.log(`  [${i+1}] ${r.text.slice(0, 80).replace(/\n/g, ' ')}`)
    })
    console.log(`\n答案: ${answer.slice(0, 150)}...`)
  }
}

compare().catch(console.error)
```

### 预期结论

| 模式 | 适合场景 | 主要代价 |
| --- | --- | --- |
| none | 问题清晰，词汇与文档一致 | 无额外成本 |
| rewrite | 口语化问题，技术文档场景 | 1 次额外 LLM 调用 |
| expand | 宽泛问题，需要多角度覆盖 | N 次额外 LLM + embedding |
| hyde | 问题和文档表述差异极大 | 1 次额外 LLM 调用 |

> **核心**：query 重写的本质是"用 LLM 帮用户把问题翻译成文档的语言"。成本只有一两次额外 LLM 调用，但召回率的提升在模糊问题上往往超过 20%。

---

## 七、组合使用建议

生产中可以将 rewrite 和 rerank 组合：

```text
原始问题
  ↓
Query Rewriting（改写为专业表述）
  ↓
向量检索（取 3 × TopN 候选）
  ↓
Rerank（LLM 或关键词二次排序）
  ↓
Top-N 结果 → LLM 生成答案
```

这个组合是目前工业界 RAG 系统的主流架构之一，兼顾召回率和精度。

---

## 小结

1. 词汇鸿沟是 RAG 召回率不高的主要原因之一，query 重写直接从源头缓解这个问题。
2. Query Expansion 适合宽泛问题，通过多路检索取并集提高覆盖面。
3. Query Rewriting 适合口语化问题，将其改写为贴近文档的专业表述。
4. HyDE 适合问题与文档表述差距极大的场景，用"假设答案"的向量替代问题向量。
5. 三种策略都只需 1-2 次额外 LLM 调用，在召回率有明显提升的场景下，性价比很高。
