# Step 75: RAG Pipeline｜测试不同问答

## 学习目标

这一节解决的是：**你的 RAG 系统"好不好用"怎么衡量？**

完成后你应该能：

1. 设计一套可重复运行的 RAG 测试套件
2. 实现自动化的问答评估循环
3. 理解 precision、recall、faithfulness 三个核心指标
4. 用 LLM-as-judge 方法自动评估答案质量
5. 定位 RAG 系统的薄弱环节

> RAG 系统最常见的死法不是代码 bug，而是"看起来能跑"但答案质量没人测。这一节给你建立第一道质量关。

---

## 一、为什么要专门测 RAG

RAG 有两条链路，任何一条出问题都会导致最终答案变差：

```text
用户问题
   ↓
[检索链路] → 召回了哪些 chunk？召回对了吗？
   ↓
[生成链路] → LLM 有没有忠实使用召回内容？有没有幻觉？
   ↓
最终答案
```

传统单元测试只覆盖代码逻辑，不覆盖这两层的语义质量。你需要一套专门的 RAG 评估框架。

### 三个核心问题

1. **检索对了吗？**（相关 chunk 有没有被召回）
2. **答案忠实吗？**（答案内容能否在召回的 chunk 里找到依据）
3. **答案正确吗？**（和期望答案相比，信息是否准确）

---

## 二、测试数据集的设计

### 2.1 测试集结构

一个最小可用的测试集，每条记录包含：

```js
const testCase = {
  id: 'tc_001',
  question: '什么是 PagedAttention？',
  expectedAnswer: 'PagedAttention 是 vLLM 提出的 KV cache 管理方法，将显存分页分配，避免碎片化。',
  relevantChunkIds: ['chunk_023', 'chunk_024'], // 可选，用于检索评估
  category: 'factual', // factual / reasoning / comparison
}
```

### 2.2 测试集规模建议

| 阶段 | 数量 | 目的 |
| --- | --- | --- |
| 开发期 | 10–20 条 | 快速迭代，发现明显问题 |
| 集成测试 | 50–100 条 | 覆盖主要场景 |
| 上线前 | 200+ 条 | 全面质量验收 |

### 2.3 覆盖哪些问题类型

```text
事实型：   "X 是什么？" → 答案在文档里直接能找到
推理型：   "为什么 X 比 Y 快？" → 需要跨 chunk 推理
对比型：   "X 和 Y 的区别是什么？" → 需要综合多个来源
边界型：   "文档里没提到 Z" → 测试模型是否乱编
```

---

## 三、实现评估循环

### 3.1 基础评估器

```js
import OpenAI from 'openai'
import { RagPipeline } from './rag-pipeline.js'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})

async function runEvaluation(pipeline, testCases) {
  const results = []

  for (const tc of testCases) {
    console.log(`\n评估: ${tc.id} - ${tc.question}`)

    // 运行 RAG
    const ragResult = await pipeline.query(tc.question)

    // 评估结果
    const evaluation = await evaluateAnswer({
      question: tc.question,
      expectedAnswer: tc.expectedAnswer,
      actualAnswer: ragResult.answer,
      retrievedChunks: ragResult.chunks,
    })

    results.push({
      ...tc,
      actualAnswer: ragResult.answer,
      retrievedChunks: ragResult.chunks.map(c => c.id),
      scores: evaluation,
    })

    // 避免 API rate limit
    await new Promise(r => setTimeout(r, 500))
  }

  return results
}
```

### 3.2 LLM-as-Judge 评估函数

用 LLM 来评估答案质量是目前最实用的自动评估方法：

```js
async function evaluateAnswer({ question, expectedAnswer, actualAnswer, retrievedChunks }) {
  const chunkTexts = retrievedChunks.map((c, i) => `[chunk${i + 1}]: ${c.text}`).join('\n')

  const prompt = `你是一个严格的 RAG 系统评估员。请对以下问答进行评分。

## 问题
${question}

## 参考答案
${expectedAnswer}

## 实际答案
${actualAnswer}

## 召回的 chunk（答案应基于这些内容生成）
${chunkTexts}

请从以下三个维度各给出 1-5 分的评分，并简要说明理由：

1. **faithfulness（忠实度）**：实际答案中的陈述是否都能在召回 chunk 中找到依据？（1=大量幻觉, 5=完全忠实）
2. **relevance（相关性）**：实际答案是否回答了问题？（1=完全偏题, 5=精准回答）
3. **correctness（正确性）**：与参考答案对比，信息是否准确？（1=严重错误, 5=完全正确）

输出格式（严格 JSON）：
{
  "faithfulness": { "score": <1-5>, "reason": "<简短说明>" },
  "relevance": { "score": <1-5>, "reason": "<简短说明>" },
  "correctness": { "score": <1-5>, "reason": "<简短说明>" }
}`

  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
    response_format: { type: 'json_object' },
  })

  return JSON.parse(response.choices[0].message.content)
}
```

---

## 四、测量检索质量

### 4.1 召回率（Recall@k）

如果你在测试集里标注了"应该召回哪些 chunk"，可以直接计算召回率：

```js
function computeRecallAtK(retrievedIds, relevantIds, k = 5) {
  const topK = retrievedIds.slice(0, k)
  const hits = topK.filter(id => relevantIds.includes(id))
  return hits.length / relevantIds.length
}

// 示例
const retrieved = ['chunk_023', 'chunk_101', 'chunk_024', 'chunk_055']
const relevant  = ['chunk_023', 'chunk_024']
console.log(computeRecallAtK(retrieved, relevant, 5))
// → 1.0（两个相关 chunk 都在 top-5 里）
```

### 4.2 精确率（Precision@k）

```js
function computePrecisionAtK(retrievedIds, relevantIds, k = 5) {
  const topK = retrievedIds.slice(0, k)
  const hits = topK.filter(id => relevantIds.includes(id))
  return hits.length / topK.length
}
```

### 4.3 没有标注数据怎么办

大多数情况下你没有"真实相关 chunk"的标注。替代方案：

1. **人工抽查** 10-20 条，看召回内容是否和问题相关
2. **用 LLM 打分** 召回的 chunk 与问题的相关性（0/1 标签）
3. **看最终答案** 如果 faithfulness 分低，通常是召回质量差

---

## 五、汇总报告

### 5.1 生成评估报告

```js
function generateReport(results) {
  const totalCases = results.length

  // 平均分
  const avgScores = {
    faithfulness: 0,
    relevance: 0,
    correctness: 0,
  }

  for (const r of results) {
    avgScores.faithfulness += r.scores.faithfulness.score
    avgScores.relevance    += r.scores.relevance.score
    avgScores.correctness  += r.scores.correctness.score
  }

  for (const key of Object.keys(avgScores)) {
    avgScores[key] = (avgScores[key] / totalCases).toFixed(2)
  }

  // 找出低分案例
  const lowFaithfulness = results.filter(r => r.scores.faithfulness.score <= 2)
  const lowRelevance    = results.filter(r => r.scores.relevance.score <= 2)
  const lowCorrectness  = results.filter(r => r.scores.correctness.score <= 2)

  console.log('\n========== RAG 评估报告 ==========')
  console.log(`总测试用例: ${totalCases}`)
  console.log(`\n平均分:`)
  console.log(`  忠实度 (faithfulness): ${avgScores.faithfulness} / 5`)
  console.log(`  相关性 (relevance):    ${avgScores.relevance} / 5`)
  console.log(`  正确性 (correctness):  ${avgScores.correctness} / 5`)
  console.log(`\n低分案例:`)
  console.log(`  忠实度 ≤ 2: ${lowFaithfulness.length} 条`)
  console.log(`  相关性 ≤ 2: ${lowRelevance.length} 条`)
  console.log(`  正确性 ≤ 2: ${lowCorrectness.length} 条`)

  if (lowFaithfulness.length > 0) {
    console.log('\n⚠️  幻觉问题（忠实度低）:')
    for (const r of lowFaithfulness) {
      console.log(`  [${r.id}] ${r.question}`)
      console.log(`       原因: ${r.scores.faithfulness.reason}`)
    }
  }

  return { avgScores, lowFaithfulness, lowRelevance, lowCorrectness }
}
```

### 5.2 样例测试集

```js
const testCases = [
  {
    id: 'tc_001',
    question: '什么是 RAG？',
    expectedAnswer: 'RAG（Retrieval-Augmented Generation）是一种将检索系统与语言模型结合的方法，先检索相关文档，再由 LLM 基于检索结果生成回答。',
    category: 'factual',
  },
  {
    id: 'tc_002',
    question: 'chunking 的目的是什么？',
    expectedAnswer: 'Chunking 是将长文档切分为较小的语义块，使每个块能被 embedding 模型准确表示，同时避免检索时召回无关内容。',
    category: 'factual',
  },
  {
    id: 'tc_003',
    question: 'overlap 设置太大有什么问题？',
    expectedAnswer: 'Overlap 设置过大会导致重复召回、存储空间增加，并使 rerank 负担加重。',
    category: 'reasoning',
  },
  {
    id: 'tc_004',
    question: '飞船的推进系统如何工作？',  // 文档中没有这个话题
    expectedAnswer: '文档中未涉及相关内容。',
    category: 'out-of-scope',
  },
]
```

---

## 六、常见问题分析

### 6.1 faithfulness 分低 → 幻觉问题

**表现**：LLM 说的内容在召回的 chunk 里找不到依据

**排查步骤**：
1. 检查 system prompt 是否明确要求"只基于提供内容回答"
2. 检查召回的 chunk 质量（可能根本没召回相关内容）
3. 降低 temperature（减少模型"发挥"）

### 6.2 relevance 分低 → 召回偏题

**表现**：召回的 chunk 与问题不相关

**排查步骤**：
1. 检查 embedding 模型是否适合中文语义
2. 考虑加 query 重写（Step 73）
3. 调整相似度阈值

### 6.3 correctness 分低 → 信息错误

**表现**：答案方向对但细节不准确

**排查步骤**：
1. 增大 `topK` 召回更多候选
2. 检查 chunking 是否把关键信息切碎了
3. 加入 rerank 提升相关性

---

## 七、小结

1. RAG 评估需要同时覆盖**检索质量**（召回率）和**生成质量**（忠实度、正确性）。
2. **LLM-as-judge** 是目前最实用的自动评估方案，配合参考答案效果更好。
3. 低 faithfulness = 幻觉，先查 prompt；低 relevance = 召回偏题，先查 embedding。
4. 测试集至少 20 条，覆盖事实型、推理型和超出文档范围的边界情况。
5. 评估是持续工作，每次改动 Pipeline 都应重新跑评估，防止退化。
