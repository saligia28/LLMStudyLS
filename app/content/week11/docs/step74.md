# Step 74: RAG Pipeline｜加入"来源引用"

## 学习目标

RAG 的核心价值之一，是让答案有据可查。但如果用户看到答案后不知道"这句话从哪来的"，就失去了 RAG 相对于纯 LLM 的一个关键优势。这一节要解决的是：**如何把 chunk 的来源信息跟着答案一起呈现出来。**

完成后你应该能：

1. 理解 chunk metadata 是实现来源引用的基础
2. 在 Prompt 中加入引用编号，引导 LLM 在答案中标注来源
3. 从 LLM 的回答中提取引用列表
4. 格式化并展示来源引用（文档名、章节、位置）
5. 将来源引用模块完整接入 `RagPipeline`

> 来源引用让 RAG 的答案从"我说的"变成"文档里这样说"，这是 RAG 可信度的核心。

---

## 一、来源引用的整体思路

```text
【Ingest 阶段：metadata 随 chunk 一起存入】

chunk 文本 + { source, title, section, page, chunkIndex }
  ↓
embedding
  ↓
向量存储（每条记录携带完整 metadata）

【Query 阶段：引用信息随 context 传入 Prompt】

Top-K chunks（带 metadata）
  ↓
Prompt 组装（加入引用编号 [1][2][3]...）
  ↓
LLM 生成带引用标注的答案
  ↓
从答案中提取引用编号
  ↓
映射回 metadata，格式化展示
```

关键点：**metadata 必须在 ingest 阶段就写入，不能事后追加。**

---

## 二、丰富 ingest 阶段的 metadata

在 Step 71 基础上，扩展 `ingest` 方法，支持更完整的文档元数据：

```js
// RagPipeline.js（ingest 扩展）

/**
 * 入库时支持的 metadata 字段：
 * @param {string} docText
 * @param {object} docMeta
 * @param {string} docMeta.source    - 文档标识符，如文件名
 * @param {string} docMeta.title     - 文档标题
 * @param {string} [docMeta.url]     - 文档链接（可选）
 * @param {number} [docMeta.page]    - 页码（可选，适用于 PDF）
 * @param {string} [docMeta.author]  - 作者（可选）
 */
async ingest(docText, docMeta = {}) {
  const chunks = chunkMarkdown(docText, {
    maxSize: this.chunkSize,
    overlap:  this.overlap
  })

  const texts = chunks.map(c => c.text)
  const embeddings = await embedBatch(texts, this.embedModel)

  for (let i = 0; i < chunks.length; i++) {
    const id = `${docMeta.source ?? 'doc'}_chunk_${i}`

    // 尝试从 chunk 文本中提取 section 标题
    const sectionMatch = chunks[i].text.match(/^(#{1,6})\s+(.+)/m)
    const section = sectionMatch ? sectionMatch[2].trim() : null

    this.store.add(id, chunks[i].text, embeddings[i], {
      ...docMeta,
      chunkIndex: i,
      section,             // 从 chunk 文本提取的章节标题
      charStart: null,     // 可选：在原文中的字符位置
    })
  }

  console.log(`[Ingest] "${docMeta.title ?? docMeta.source}" 入库完成，${chunks.length} 个 chunk`)
  return chunks.length
}
```

---

## 三、带引用编号的 Prompt 模板

这是来源引用的核心：在 Prompt 里明确告诉 LLM 每段内容的编号，并要求它在回答中标注。

```js
// citation.js

/**
 * 构建带引用编号的 Prompt
 * @param {string} question
 * @param {Array<{text, metadata}>} results
 * @returns {{systemPrompt: string, userPrompt: string, sourceMap: Map}}
 */
export function buildCitationPrompt(question, results) {
  // sourceMap: 编号 → metadata，用于后续解析
  const sourceMap = new Map()

  const contextParts = results.map((r, i) => {
    const num = i + 1
    sourceMap.set(num, r.metadata)

    // 格式化来源标签
    const source = r.metadata?.title ?? r.metadata?.source ?? '未知来源'
    const section = r.metadata?.section ? ` > ${r.metadata.section}` : ''
    const page = r.metadata?.page ? ` 第 ${r.metadata.page} 页` : ''

    return `[${num}] 来源：${source}${section}${page}\n${r.text}`
  })

  const systemPrompt = `你是一个专业的问答助手，回答需要基于提供的参考内容。

规则：
1. 每引用一段参考内容时，在句末用方括号标注来源编号，例如：某功能使用步骤如下 [1]。
2. 不同来源的信息用不同编号区分。
3. 如果参考内容中没有相关信息，如实说明，不要编造。
4. 回答结束后不要再列引用列表，引用编号已经在正文中标注。`

  const userPrompt = `参考内容：

${contextParts.join('\n\n---\n\n')}

用户问题：${question}`

  return { systemPrompt, userPrompt, sourceMap }
}

/**
 * 从 LLM 回答中提取引用编号
 * @param {string} answer
 * @returns {number[]} - 不重复的引用编号数组，按出现顺序
 */
export function extractCitationNumbers(answer) {
  const matches = answer.matchAll(/\[(\d+)\]/g)
  const seen = new Set()
  const result = []

  for (const m of matches) {
    const num = parseInt(m[1], 10)
    if (!seen.has(num)) {
      seen.add(num)
      result.push(num)
    }
  }

  return result
}

/**
 * 格式化引用列表，用于在答案下方展示
 * @param {number[]} citedNums - 实际被引用的编号
 * @param {Map<number, object>} sourceMap - 编号 → metadata
 * @returns {string}
 */
export function formatCitations(citedNums, sourceMap) {
  if (citedNums.length === 0) return ''

  const lines = ['', '---', '**参考来源：**']

  for (const num of citedNums) {
    const meta = sourceMap.get(num)
    if (!meta) continue

    const title   = meta.title   ?? meta.source ?? '未知来源'
    const section = meta.section ? ` — ${meta.section}` : ''
    const page    = meta.page    ? `，第 ${meta.page} 页` : ''
    const url     = meta.url     ? `\n   链接: ${meta.url}` : ''

    lines.push(`[${num}] ${title}${section}${page}${url}`)
  }

  return lines.join('\n')
}
```

---

## 四、接入 RagPipeline

```js
// RagPipeline.js（新增 citation 支持）
import {
  buildCitationPrompt,
  extractCitationNumbers,
  formatCitations
} from './citation.js'

export class RagPipeline {
  constructor(options = {}) {
    // ...
    this.citation = options.citation ?? false  // 是否开启来源引用
  }

  async query(question) {
    const queryVec = await embedText(question, this.embedModel)
    const results  = this.store.search(queryVec, this.topK)

    let systemPrompt, userPrompt, sourceMap

    if (this.citation) {
      // 带引用编号的 Prompt
      ({ systemPrompt, userPrompt, sourceMap } = buildCitationPrompt(question, results))
    } else {
      // 普通 Prompt（Step 71 原版）
      systemPrompt = '请根据参考内容回答用户问题，不要编造信息。'
      const contextText = results.map((r, i) => `[参考 ${i+1}]\n${r.text}`).join('\n\n---\n\n')
      userPrompt = `参考内容：\n${contextText}\n\n用户问题：${question}`
    }

    const response = await client.chat.completions.create({
      model: this.chatModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt }
      ],
      temperature: 0.3
    })

    const answer = response.choices[0].message.content

    // 提取并格式化引用
    let citations = []
    let citationText = ''
    if (this.citation && sourceMap) {
      const citedNums = extractCitationNumbers(answer)
      citations    = citedNums.map(n => ({ num: n, meta: sourceMap.get(n) }))
      citationText = formatCitations(citedNums, sourceMap)
    }

    return {
      answer,
      citations,
      formattedAnswer: answer + citationText,
      context: results
    }
  }
}
```

---

## 五、多文档入库示例

来源引用在多文档场景下价值最大。用两篇文档验证：

```js
// multi-doc-example.js
import 'dotenv/config'
import { RagPipeline } from './RagPipeline.js'

const DOC_A = `
# Node.js 性能优化

## 异步 I/O

Node.js 的非阻塞 I/O 模型适合高并发场景。避免在事件循环中执行 CPU 密集计算。
使用 worker_threads 模块处理 CPU 密集型任务，隔离不影响主线程。

## 内存管理

定期监控 heap 使用量，超过 1.5GB 时考虑分片或重启策略。
使用 --max-old-space-size 限制最大堆内存，防止 OOM。
`

const DOC_B = `
# Redis 最佳实践

## 缓存策略

生产环境建议使用 allkeys-lru 淘汰策略，适合纯缓存场景。
为所有 key 设置合理的 TTL，避免冷数据长期占用内存。

## 持久化配置

同时开启 RDB 和 AOF，RDB 用于快速恢复，AOF 保证数据安全。
AOF 的 fsync 策略建议使用 everysec，在性能和安全之间取得平衡。
`

async function main() {
  const pipeline = new RagPipeline({ citation: true, topK: 4 })

  // 入库两篇不同来源的文档
  await pipeline.ingest(DOC_A, {
    source: 'nodejs-perf',
    title: 'Node.js 性能优化指南',
    url: 'https://example.com/nodejs-perf'
  })

  await pipeline.ingest(DOC_B, {
    source: 'redis-best-practice',
    title: 'Redis 最佳实践',
    url: 'https://example.com/redis-best'
  })

  const questions = [
    '如何处理高并发场景下的性能问题？',
    '内存满了怎么办？',
    '数据持久化应该怎么配置？'
  ]

  for (const q of questions) {
    console.log('\n' + '='.repeat(60))
    console.log(`问题: ${q}`)
    const { formattedAnswer, citations } = await pipeline.query(q)
    console.log(`\n${formattedAnswer}`)
    console.log(`\n引用来源数量: ${citations.length}`)
  }
}

main().catch(console.error)
```

### 预期输出示意

```text
问题: 如何处理高并发场景下的性能问题？

Node.js 的非阻塞 I/O 模型本身适合高并发场景 [1]。
对于 CPU 密集型任务，应使用 worker_threads 隔离处理，
避免阻塞主线程 [1]。同时，可以使用 Redis 缓存减少数据库
压力，配合 allkeys-lru 策略管理缓存内存 [2]。

---
**参考来源：**
[1] Node.js 性能优化指南 — 异步 I/O
   链接: https://example.com/nodejs-perf
[2] Redis 最佳实践 — 缓存策略
   链接: https://example.com/redis-best
```

---

## 六、常见问题与处理

### 问题 1：LLM 没有标注引用编号

可以在 systemPrompt 里加强要求，或在答案生成后做后处理：

```js
// 如果答案中没有引用编号，强制标注"来源参考"
function ensureCitations(answer, citedCount) {
  const hasCitation = /\[\d+\]/.test(answer)
  if (!hasCitation && citedCount > 0) {
    return answer + '\n\n（本答案基于参考内容 ' +
      Array.from({ length: citedCount }, (_, i) => `[${i+1}]`).join('') + '）'
  }
  return answer
}
```

### 问题 2：引用编号对应不上

建议在 sourceMap 里记录 chunk 的前 50 个字符作为额外校验：

```js
sourceMap.set(num, {
  ...r.metadata,
  textPreview: r.text.slice(0, 50)
})
```

### 问题 3：同一来源多个 chunk 被引用

将相同 source 的引用合并展示，避免重复：

```js
function dedupCitations(citations) {
  const seen = new Set()
  return citations.filter(c => {
    const key = c.meta?.source
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
```

---

## 小结

1. 来源引用的基础是 chunk 的 metadata，必须在 ingest 阶段写入，不能事后追加。
2. Prompt 里用编号标注每段 context 的来源，明确要求 LLM 在答案中标注，是引用的关键机制。
3. 从答案中用正则提取 `[N]` 编号，再映射回 sourceMap，即可得到精确的引用列表。
4. 多文档场景下，来源引用让用户能区分哪个结论来自哪篇文档，显著提升答案可信度。
5. 引用失效（LLM 没标注、编号对不上）是常见问题，需要在 Prompt 和后处理两层做容错。
