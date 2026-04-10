# Step 65: Chunking｜对不同 chunk 长度做实验

## 学习目标

这一节要把“我感觉这个参数差不多”变成“我知道这个参数为什么更好”。

完成后你应该能：

1. 设计 chunk size 与 overlap 的对照实验
2. 选出适合自己文档类型的观测指标
3. 用 Node.js 写出一个最小实验脚本
4. 读懂实验结果，并把结果转成下一轮优化方向

> 如果说 Step 64 是“理解怎么切”，那么这一步就是“证明为什么这么切”。没有实验，chunk 讨论很容易停留在玄学。

---

## 一、实验到底在验证什么

chunk 长度不是越大越好，也不是越小越好。我们真正想验证的是：

```text
不同 chunkSize / overlap / 切分策略
  会怎样影响
检索命中率、召回排名、上下文噪声、索引成本、答案完整度
```

### 实验里最重要的变量

| 变量 | 说明 |
| --- | --- |
| `chunkSize` | 每个 chunk 的长度，通常先按 token 或近似 token 估算 |
| `overlap` | 相邻 chunk 共享的内容长度 |
| `strategy` | fixed / sliding / semantic |
| `k` | 召回 Top-K 的数量 |
| `corpus` | 你用于测试的文档集合 |
| `questions` | 你为文档准备的测试问题 |

### 实验里最重要的指标

| 指标 | 看什么 |
| --- | --- |
| `recall@k` | 正确答案是否出现在 Top-K 召回里 |
| `MRR` | 正确 chunk 越靠前越好 |
| `coverage` | 回答需要的信息是否被 chunk 覆盖完整 |
| `chunk_count` | 切完以后生成了多少条 chunk |
| `avg_tokens` | 每个 chunk 的平均长度 |
| `ingest_time` | 切分与入库耗时 |
| `retrieval_noise` | 召回结果里无关 chunk 的比例 |

实验的关键不是“指标越多越专业”，而是你要知道每个指标回答的是哪类问题。

---

## 二、先做实验设计，再写代码

### 2.1 推荐的对照方式

先固定文档、固定问题集、固定 embedding 模型、固定向量库，只改变 chunk 参数。

```text
唯一可变因素：chunkSize / overlap / strategy
其余条件：全部保持一致
```

这样你才能把结果和 chunk 本身绑定起来，而不是把模型波动、索引波动、问题集波动都混进去。

### 2.2 一个可直接使用的实验矩阵

```js
const configs = [
  { strategy: 'fixed', chunkSize: 256, overlap: 0 },
  { strategy: 'sliding', chunkSize: 256, overlap: 64 },
  { strategy: 'fixed', chunkSize: 512, overlap: 0 },
  { strategy: 'sliding', chunkSize: 512, overlap: 128 },
  { strategy: 'semantic', chunkSize: 700, overlap: 120 },
]
```

### 2.3 先准备“金标准问题集”

问题集最好来自真实文档，而不是泛泛而谈的“这个文档讲了什么”。更推荐这类题目：

- 某个概念定义是什么
- 某个参数范围是多少
- 某个步骤的前后关系是什么
- 某个表格里的值是多少
- 某段代码的作用是什么

好的问题集应该能明确判断“命中”与“未命中”。

---

## 三、一个最小实验脚本

下面这个脚本不依赖复杂框架，核心是把“切分 -> 检索 -> 评分”串起来。

```js
function evaluateRecallAtK(retrievedChunks, goldenChunkId, k = 5) {
  const topK = retrievedChunks.slice(0, k)
  return topK.some(chunk => chunk.id === goldenChunkId) ? 1 : 0
}

async function runChunkExperiment({ docs, questions, configs, buildChunks, search }) {
  const rows = []

  for (const config of configs) {
    const chunks = buildChunks(docs, config)
    const metrics = {
      hits: 0,
      mrrSum: 0,
      questionCount: questions.length,
      chunkCount: chunks.length,
      totalTokens: 0,
    }

    for (const chunk of chunks) {
      metrics.totalTokens += chunk.tokenCount ?? 0
    }

    for (const question of questions) {
      const retrieved = await search(question.text, chunks, 5)
      const hit = evaluateRecallAtK(retrieved, question.goldenChunkId, 5)
      metrics.hits += hit

      const rank = retrieved.findIndex(chunk => chunk.id === question.goldenChunkId)
      if (rank >= 0) metrics.mrrSum += 1 / (rank + 1)
    }

    rows.push({
      strategy: config.strategy,
      chunkSize: config.chunkSize,
      overlap: config.overlap,
      recallAt5: metrics.hits / metrics.questionCount,
      mrr: metrics.mrrSum / metrics.questionCount,
      avgTokens: Math.round(metrics.totalTokens / metrics.chunkCount),
      chunkCount: metrics.chunkCount,
    })
  }

  console.table(rows)
  return rows
}
```

这个脚本只负责实验框架，不负责 embedding 的细节。这样做的好处是：你能先把 chunk 策略本身的影响看清楚。

---

## 四、怎么看结果

实验结果不要只看“谁最高”，还要看“为什么最高”。

### 一个示意表

| strategy | chunkSize | overlap | recall@5 | mrr | avgTokens | 观察 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| fixed | 256 | 0 | 0.62 | 0.38 | 180 | 很碎，命中容易但上下文不完整 |
| sliding | 256 | 64 | 0.74 | 0.49 | 190 | 边界命中明显更稳 |
| fixed | 512 | 0 | 0.71 | 0.45 | 365 | 上下文更完整，但噪声也更多 |
| sliding | 512 | 128 | 0.81 | 0.58 | 380 | 常见的比较平衡区间 |
| semantic | 700 | 120 | 0.84 | 0.63 | 430 | 结构化文档通常更占优 |

> 上表是示意，不是结论。你自己的文档类型、问题类型和 embedding 模型不同，最优点也会不同。

### 如何解释这些结果

1. **chunk 太小**：召回可能高一点，但答案上下文不完整，LLM 还要自己补。
2. **chunk 太大**：chunk 内主题混杂，检索结果噪声更大。
3. **有 overlap**：边界命中会更稳，但索引和 rerank 成本会上升。
4. **语义切分**：对结构良好的 Markdown、教程、规范类文档通常更占优势。

---

## 五、把实验结果转成下一步动作

实验做完，不是为了写一张漂亮表格，而是为了回答下一轮问题：

- 如果 recall@5 很高，但答案质量差，说明 chunk 可能太大、噪声太高
- 如果 recall@5 很低，但 chunk 很小，说明你切碎了关键语义
- 如果 semantic 比 fixed 明显好，说明你的文档结构本身适合按标题和段落切
- 如果 overlap 提升不明显，就不要盲目加大 overlap

### 一句话原则

**先用实验找到“最低成本的足够好”，再去追求更复杂的切分策略。**

这比一开始就上最复杂的语义切分更稳，也更符合真实工程。
