# Step 38: ReAct 多步 Agent｜构建一个能自动搜索 + 再处理的 Agent

## 学习目标

这个任务的本质是回答一个核心问题：**为什么很多 Agent 不是“一步问答”，而是必须先搜索、再筛选、再综合？**

通过本教程，你将：

1. 理解“搜索 + 再处理”的两阶段 Agent 设计
2. 学会让第一阶段只负责找证据，第二阶段只负责组织答案
3. 掌握搜索结果如何进入 Observation 并驱动下一轮思考
4. 学会记录证据链，避免模型凭感觉回答

---

## 一、为什么要把任务拆成两阶段？

很多任务本身就不是“直接答题”：

- 先查资料，再总结
- 先搜候选项，再比较
- 先找证据，再推断结论

如果把所有事都塞进一次推理里，模型很容易：

1. 直接编答案
2. 只看第一个搜索结果
3. 忽略证据之间的冲突

所以两阶段 Agent 的关键思想是：

```
Stage 1: Search / Retrieve
Stage 2: Process / Synthesize
```

### 1.1 两阶段各自负责什么

| 阶段 | 目标 | 输出 |
|---|---|---|
| Search | 找到相关信息 | 候选结果、证据片段、链接 |
| Process | 基于证据生成答案 | 结论、理由、引用 |

这样做的好处是：搜索阶段尽量“窄”，处理阶段尽量“稳”。

---

## 二、机制：搜索结果如何变成 Observation？

两阶段 Agent 的核心不是搜索本身，而是**搜索结果如何进入下一轮思考**。

```
用户问题
   ↓
Thought: 先找资料
Action: search(query)
   ↓
Observation: 返回候选证据
   ↓
Thought: 证据够不够，是否还要继续搜
Action: search(query2) / finish
   ↓
Observation: 更多证据
   ↓
Thought: 基于证据综合
Final Answer
```

### 2.1 不要把搜索结果直接当答案

搜索结果只是原料，不是结论。你需要明确告诉模型：

- 先收集
- 再判断
- 最后总结

否则它会把“看见的第一个片段”误当成最终答案。

---

## 三、代码：一个搜索 + 处理的最小 Agent

下面示例展示一个简单的两阶段结构。第一阶段搜索候选，第二阶段只基于候选生成答案。

```js
const knowledgeBase = [
  { title: 'ReAct', text: 'ReAct combines reasoning and acting.' },
  { title: 'Tool use', text: 'Tools are for external actions and fresh data.' },
  { title: 'Trace', text: 'Trace helps debugging and evaluation.' },
]

function search(query) {
  return knowledgeBase.filter((item) =>
    `${item.title} ${item.text}`.toLowerCase().includes(query.toLowerCase())
  )
}

async function searchThenAnswer(question, llm) {
  const trace = []

  const hits = search(question)
  trace.push({ step: 1, action: 'search', observation: hits })

  if (hits.length === 0) {
    return {
      ok: false,
      answer: '没有找到足够证据，建议换关键词再搜。',
      trace,
    }
  }

  const answer = await llm({
    question,
    evidence: hits,
    instruction: '只基于证据回答，不要补充无依据内容',
  })

  trace.push({ step: 2, action: 'process', observation: answer })
  return { ok: true, answer, trace }
}
```

### 3.1 这段代码强调了什么？

1. `search()` 只负责找候选
2. `llm()` 只负责基于证据组织语言
3. `trace` 把“证据链”固定下来
4. 没有证据时要允许失败，而不是硬答

### 3.2 两阶段比“一步到位”更稳的原因

因为它把难题切成了两个低风险任务：

- 找信息时尽量不推理太多
- 生成答案时尽量不再凭空扩展

这就是 ReAct 在搜索类 Agent 中最实用的落地方式。

---

## 四、实验与调试：搜索类 Agent 重点看什么？

### 4.1 重点看“检索质量”和“证据使用率”

你可以拿这三个问题来检查：

1. 搜到的内容和问题是否相关
2. 模型有没有把证据写进答案
3. 如果证据不足，Agent 有没有主动补搜

### 4.2 常见问题

| 问题 | 现象 | 处理方式 |
|---|---|---|
| 搜索词太泛 | 返回一堆无关结果 | 先做 query 改写 |
| 搜到结果不看 | 答案还是靠猜 | 在 prompt 里要求引用证据 |
| 证据不够还硬答 | 结论看着像真的 | 增加“无证据则拒答”规则 |

---

## 五、小结：搜索 + 再处理的核心价值

这一节的重点不是“加了一个搜索工具”，而是你把任务拆成了更可靠的两步：

> **先把信息找全，再让模型基于信息做判断。**

这类 Agent 往往比纯聊天更适合真实业务，因为它更容易解释、也更容易调试。

