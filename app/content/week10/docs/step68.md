# Step 68: Chunking｜实验 chunk 对召回率影响

## 学习目标

这一节要把 Chunking 从“看起来合理”推进到“有证据支持”。

完成后你应该能：

1. 搭一个最小可跑的召回评估流程
2. 用 `recall@k`、`MRR`、命中率等指标观察 chunk 策略
3. 看懂 chunk 大小、overlap 与召回表现之间的关系
4. 把实验结果转成下一步优化方向

> 召回率不是唯一指标，但它是最容易让你先看见 chunk 策略好坏的指标。先把“能不能找到”搞清楚，再谈“找到后答得好不好”。

---

## 一、为什么要专门测召回

RAG 里最常见的误区之一，是把“回答不行”直接归咎于模型。

但很多时候真正的问题在更前面：

```text
文档切坏了
  → chunk 没包含完整答案
  → 向量召回没命中
  → LLM 只能在错误上下文里生成
```

所以召回实验的重点不是“模型聪不聪明”，而是：

- chunk 有没有被检索到
- 正确 chunk 排名靠不靠前
- 召回上来的是不是噪声块
- 答案需要的信息是不是被完整覆盖

---

## 二、应该测哪些指标

### 2.1 检索指标

| 指标 | 作用 |
| --- | --- |
| `recall@k` | 正确 chunk 是否出现在 Top-K |
| `precision@k` | Top-K 里有多少是真相关 |
| `MRR` | 正确 chunk 排名越靠前越好 |
| `hit rate` | 问题是否被命中 |

### 2.2 成本指标

| 指标 | 作用 |
| --- | --- |
| `chunkCount` | 说明索引压力 |
| `avgTokens` | 影响上下文成本 |
| `ingestTime` | 切分与入库耗时 |
| `retrievalLatency` | 检索速度 |

### 2.3 质量指标

| 指标 | 作用 |
| --- | --- |
| `coverage` | 答案所需信息是否齐全 |
| `faithfulness` | 回答是否忠实于检索内容 |
| `citation accuracy` | 引用来源是否正确 |

如果只看 recall@k，你可能会误以为“大 chunk 一定更好”，因为它更容易覆盖答案；但实际上它也可能带来更高噪声，让答案更散。

---

## 三、一个可执行的评估框架

评估流程可以很简单：

```text
文档集
  ↓
按不同参数切分
  ↓
建立索引
  ↓
准备问题集 + 正确答案位置
  ↓
逐题检索 Top-K
  ↓
计算 recall@k / MRR / coverage
```

### 3.1 问题集应该怎么准备

好的问题集一般长这样：

- 答案明确、可定位
- 能对应到具体 chunk 或具体页码
- 尽量覆盖不同结构：标题、段落、列表、表格、代码

例如：

- “overlap 的作用是什么？”
- “chunkSize 过大有什么副作用？”
- “哪一段解释了 metadata 对回溯的帮助？”

### 3.2 一个最小实验脚本

```js
function scoreHit(retrieved, goldenChunkId, k = 5) {
  const topK = retrieved.slice(0, k)
  const rank = topK.findIndex(chunk => chunk.id === goldenChunkId)
  return {
    hit: rank >= 0 ? 1 : 0,
    mrr: rank >= 0 ? 1 / (rank + 1) : 0,
  }
}

async function evaluateConfig({ docs, questions, config, buildChunks, search }) {
  const chunks = buildChunks(docs, config)
  const rows = []

  for (const question of questions) {
    const retrieved = await search(question.text, chunks, 5)
    const score = scoreHit(retrieved, question.goldenChunkId, 5)
    rows.push({
      questionId: question.id,
      hit: score.hit,
      mrr: score.mrr,
      coverage: question.coverage ?? 1,
    })
  }

  return {
    ...config,
    recallAt5: rows.reduce((sum, row) => sum + row.hit, 0) / rows.length,
    mrr: rows.reduce((sum, row) => sum + row.mrr, 0) / rows.length,
    avgCoverage: rows.reduce((sum, row) => sum + row.coverage, 0) / rows.length,
  }
}
```

这个脚本的意义是：先把“切分参数变化后，召回有没有变好”单独抽出来。

---

## 四、怎么看实验结果

下面是一组**示意数据**，帮助你理解怎么读表：

| chunkSize | overlap | recall@5 | mrr | avgCoverage | 观察 |
| ---: | ---: | ---: | ---: | ---: | --- |
| 200 | 0 | 0.61 | 0.37 | 0.55 | chunk 太碎，容易命中但上下文不稳 |
| 400 | 80 | 0.76 | 0.52 | 0.71 | 边界补足明显更好 |
| 600 | 120 | 0.81 | 0.58 | 0.79 | 常见的平衡区间 |
| 900 | 180 | 0.82 | 0.54 | 0.86 | 覆盖更完整，但噪声开始上升 |

### 你该怎么解释这张表

1. **小 chunk**：更容易命中局部关键词，但答案上下文不完整。
2. **中等 chunk**：通常是经验上的平衡区间，召回和上下文都比较稳。
3. **大 chunk**：覆盖率更高，但主题混杂和噪声也更重。
4. **overlap 适中**：能显著改善边界命中，但过大就会让索引重复爆炸。

---

## 五、召回高，不等于答案一定好

这是最容易踩的坑。

### 情况一：recall 高，答案差

可能原因：

- chunk 太大，里面混了太多无关内容
- Top-K 拿到的是正确 chunk，但上下文噪声很重
- rerank 没做好，真正关键的 chunk 排名不够靠前

### 情况二：recall 低，答案差

可能原因：

- chunk 太小，把答案拆散了
- overlap 不够，边界信息丢了
- 问题集和文档结构不匹配

### 情况三：recall 还行，答案也还行

这通常说明你的 chunk 策略已经接近一个可用区间。接下来不要急着换花样，应该继续看：

- 是否还能降低成本
- 是否还能提升可解释性
- 是否还能减少重复召回

---

## 六、小结

Chunking 的好坏，不能靠感觉判断，必须拿问题集和指标说话。

如果说 Step 64 解决了“切法”，Step 65 解决了“实验”，那 Step 68 解决的就是“证据”。

而在 RAG 系统里，真正值得保留的，不是某一次高分，而是你能复现、能解释、能持续优化的那套实验方法。
