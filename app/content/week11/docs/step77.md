# Step 77: RAG Pipeline｜整理 Pipeline 文档

## 学习目标

这一节是 Week 11 的收尾，目标是：**把过去 7 天构建的 RAG Pipeline 整理成一份可以交付和复用的技术文档。**

完成后你应该能：

1. 用架构图清晰描述整条 RAG 流水线
2. 总结 RAG 各模块的最佳实践
3. 列出常见的失败模式和修复方法
4. 写出一份完整的 Pipeline 技术文档模板
5. 理解 RAG 系统的扩展方向

---

## 一、完整架构回顾

```text
┌──────────────────────────────────────────────────────┐
│                   RAG Pipeline                       │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │              Ingest（入库流程）                  │ │
│  │                                                 │ │
│  │  原始文档                                       │ │
│  │     ↓ 清洗 / 解析                              │ │
│  │  纯文本                                         │ │
│  │     ↓ Chunking（Week 10）                      │ │
│  │  Chunks + Metadata                              │ │
│  │     ↓ Embedding（Week 9）                      │ │
│  │  向量                                           │ │
│  │     ↓ 存入向量库（Week 9）                     │ │
│  │  索引完成                                       │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │              Query（问答流程）                   │ │
│  │                                                 │ │
│  │  用户问题                                       │ │
│  │     ↓ Query 重写（Step 73）                    │ │
│  │  扩展问题                                       │ │
│  │     ↓ Embedding                                │ │
│  │  Query 向量                                     │ │
│  │     ↓ 向量搜索 → 召回 Top-K Chunks             │ │
│  │     ↓ Rerank（Step 72）                        │ │
│  │  排序后的 Chunks                                │ │
│  │     ↓ 构建 Prompt（含来源引用 Step 74）        │ │
│  │     ↓ LLM 生成                                 │ │
│  │  最终答案 + 引用列表                            │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌──────────────────┐   ┌──────────────────────────┐ │
│  │  Embedding 缓存  │   │  Query 语义缓存（Step 76）│ │
│  └──────────────────┘   └──────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

---

## 二、各模块最佳实践清单

### 2.1 Chunking

- [ ] chunk size 在 400–800 token 之间（中文约 800–1600 字符）
- [ ] overlap 设为 chunk size 的 10%–20%
- [ ] 优先按 markdown 标题/段落切分，再用长度约束
- [ ] 每个 chunk 附带 metadata（文档名、section、页码）
- [ ] 切分后人工抽查 10–20 个 chunk，确认语义完整

### 2.2 Embedding

- [ ] 对相同文本不调用两次 API（使用缓存）
- [ ] 使用与查询语言匹配的 embedding 模型（中文用支持中文的模型）
- [ ] embedding 维度与向量库配置一致
- [ ] 批量 embed 时注意 API rate limit，加适当延迟

### 2.3 向量搜索

- [ ] 默认 topK = 5，根据任务调整（factual 可低，comprehensive 可高）
- [ ] 设置相似度阈值（< 0.7 的结果不纳入 context）
- [ ] 向量库选型：小规模用内存（Chroma/hnswlib），大规模用 Pinecone/Weaviate

### 2.4 Rerank（可选）

- [ ] 向量搜索 topK 召回 10–20 个，rerank 后取 3–5 个
- [ ] LLM rerank 比关键词 rerank 效果好，但成本更高
- [ ] 没有 GPU 的情况下用轻量 cross-encoder 模型（如 ms-marco-MiniLM）

### 2.5 Prompt 工程

- [ ] System prompt 明确要求"只基于提供内容回答"
- [ ] Context 中为每个 chunk 标注来源
- [ ] 指令让模型在不确定时说"文档中未提及"而非编造
- [ ] Prompt 中包含引用格式示例（shot prompting）

### 2.6 缓存

- [ ] embedding 缓存持久化到磁盘（重启不丢失）
- [ ] 查询语义缓存相似度阈值 0.92–0.97
- [ ] 文档更新时主动清空查询缓存
- [ ] 定期监控缓存命中率

---

## 三、常见失败模式

### 3.1 召回不到相关内容

**症状**：答案总是"文档中未找到相关信息"

**可能原因**：
- chunk 太大，语义被稀释
- embedding 模型不适合该语言
- 相似度阈值设置过高
- 用户问题和文档表述差异大（换词不换意）

**修复**：
1. 降低相似度阈值（从 0.8 → 0.6）
2. 加入 query 重写（Step 73）
3. 换 embedding 模型（中文建议 text-embedding-3-small 或 bge-m3）
4. 减小 chunk size，增加 topK

### 3.2 答案有幻觉

**症状**：答案内容无法在召回 chunk 中找到依据

**可能原因**：
- System prompt 没有严格限定"只基于提供内容"
- temperature 设置过高
- 召回了不相关 chunk，LLM 被混淆

**修复**：
1. 加强 system prompt 约束
2. 降低 temperature（0.3 → 0）
3. 提高 rerank 质量，清理无关 chunk

### 3.3 答案质量忽高忽低

**症状**：有些问题答得很好，有些问题答得很差

**可能原因**：
- chunking 对某类文档结构支持不好（表格、代码块被切断）
- 部分话题的文档覆盖不足

**修复**：
1. 检查问题分布，找出低质量类别
2. 对该类别的文档做专项 chunking 优化
3. 补充相关文档

---

## 四、完整 Pipeline 代码汇总

```js
// rag-pipeline-complete.js
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})

// ---------- 向量工具 ----------
function cosineSimilarity(a, b) {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

// ---------- 内存向量库 ----------
class VectorStore {
  constructor() { this.docs = [] }

  add(id, text, embedding, metadata = {}) {
    this.docs.push({ id, text, embedding, metadata })
  }

  search(queryEmbedding, topK = 5, threshold = 0.5) {
    return this.docs
      .map(doc => ({ ...doc, score: cosineSimilarity(queryEmbedding, doc.embedding) }))
      .filter(d => d.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  }
}

// ---------- RagPipeline ----------
export class RagPipeline {
  constructor() {
    this.store = new VectorStore()
    this.embeddingCache = new Map()
  }

  async embed(text) {
    const key = text.trim()
    if (this.embeddingCache.has(key)) return this.embeddingCache.get(key)
    const res = await client.embeddings.create({ model: 'text-embedding-3-small', input: key })
    const emb = res.data[0].embedding
    this.embeddingCache.set(key, emb)
    return emb
  }

  async ingest(chunks) {
    for (const chunk of chunks) {
      const emb = await this.embed(chunk.text)
      this.store.add(chunk.id, chunk.text, emb, chunk.metadata || {})
    }
    console.log(`已入库 ${chunks.length} 个 chunk`)
  }

  async query(question, options = {}) {
    const { topK = 5, threshold = 0.5 } = options

    // 1. query embedding
    const queryEmb = await this.embed(question)

    // 2. 向量搜索
    const results = this.store.search(queryEmb, topK, threshold)
    if (results.length === 0) {
      return { answer: '文档中未找到相关内容。', chunks: [], sources: [] }
    }

    // 3. 构建 prompt（含引用）
    const contextParts = results.map((r, i) =>
      `[来源${i + 1}: ${r.metadata.source || r.id}]\n${r.text}`
    )
    const context = contextParts.join('\n\n---\n\n')

    const systemPrompt = `你是一个文档问答助手。
请严格基于以下文档内容回答用户问题。
如果文档中没有相关信息，请回答"文档中未提及此内容"，不要编造。
回答结尾请用 [来源X] 格式标注引用。`

    const userPrompt = `文档内容：\n${context}\n\n问题：${question}`

    // 4. LLM 生成
    const response = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0,
    })

    const answer = response.choices[0].message.content

    // 5. 提取引用
    const sources = results.map((r, i) => ({
      index: i + 1,
      id: r.id,
      source: r.metadata.source || r.id,
      score: r.score.toFixed(3),
    }))

    return { answer, chunks: results, sources }
  }
}
```

---

## 五、扩展方向

| 方向 | 做法 | 难度 |
| --- | --- | --- |
| 流式输出 | 替换 `chat.completions.create` 为 stream 模式 | 低 |
| 多文档支持 | 入库时记录 docId，查询时可按 docId 过滤 | 低 |
| 多轮对话 | 将对话历史注入 prompt，维护 session 状态 | 中 |
| 混合检索 | 向量检索 + BM25 关键词检索，结果融合 | 中 |
| 持久化向量库 | 替换内存 VectorStore 为 Chroma / Qdrant | 中 |
| 多模态 | 支持图片 embedding（CLIP 等） | 高 |

---

## 六、小结

Week 11 的核心收获：

1. RAG 的本质是**检索 + 生成的解耦**，每一层都可以独立优化。
2. Rerank 和 Query 重写是在不换模型的前提下提升质量的最快方法。
3. 来源引用让系统具备**可追溯性**，是生产级 RAG 的标配。
4. 缓存不是可选项，是控制成本的必要手段。
5. 评估框架是 RAG 系统的质量保证，没有测试就没有信心。

从 Week 9（Embedding）→ Week 10（Chunking）→ Week 11（RAG Pipeline），你已经掌握了完整的 RAG 链路。Week 12 开始把它封装成真正可用的 web 产品。
