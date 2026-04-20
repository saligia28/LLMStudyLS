# Step 38: ReAct 多步 Agent｜构建一个能自动搜索 + 再处理的 Agent

## 学习目标

这一节回答的核心问题是：**为什么很多 Agent 不是“一次回答”，而要先找证据再组织答案？**

完成后你应该能：

1. 理解两阶段 Agent 的设计价值
2. 让搜索结果进入 observation
3. 用最小计划状态驱动下一步动作
4. 避免模型跳过证据、直接凭印象作答

> **本节默认模型**：`deepseek-chat` 负责规划与总结，搜索结果作为 observation 进入下一轮。

---

## 一、两阶段 Agent 的主线

```text
阶段 1：Search / Retrieve
  找证据

阶段 2：Process / Synthesize
  基于证据组织答案
```

这类结构特别适合：

- 搜索再问答
- 查资料再总结
- 拉多份结果再比较

---

## 二、Observation 真正的作用

Observation 不是“展示模型思考”，而是“让下一轮决策有事实依据”。

```text
问题
  ↓
计划状态：先查资料
  ↓
动作：search(query)
  ↓
observation：候选证据列表
  ↓
更新计划：证据够不够
  ↓
动作：继续搜索 / 直接整理答案
```

---

## 三、一个最小搜索 + 处理示例

```js
async function searchThenAnswer(question, llm, search) {
  const trace = []

  const hits = await search(question)
  trace.push({
    step: 1,
    plan: '先收集证据',
    action: { tool: 'search', input: question },
    observation: hits,
  })

  if (hits.length === 0) {
    return {
      ok: false,
      answer: '没有找到足够证据，建议换关键词重试。',
      trace,
    }
  }

  const answer = await llm({
    instruction: '只基于给定证据回答，不要补充无依据内容。',
    question,
    evidence: hits,
  })

  trace.push({
    step: 2,
    plan: '证据已足够，开始整合答案',
    action: { tool: 'finish', input: '生成最终答案' },
    observation: answer,
  })

  return { ok: true, answer, trace }
}
```

---

## 四、小结

这一节真正要建立的是：  
**搜索结果不是答案，而是下一轮动作的输入。**

也因此，trace 里最该保留的是：

1. 当前计划状态
2. 选择了什么动作
3. 返回了什么 observation

下一节继续扩展成多工具路由。
