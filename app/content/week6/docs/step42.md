# Step 42: ReAct 多步 Agent｜整理 Agent Demo

## 学习目标

这一节要把 Week 6 的能力组合成一个真正能展示、能复盘、能扩展的 Demo。

完成后你应该能：

1. 回顾整套 Agent 架构
2. 把 planner、router、runner、guard、bench 串起来
3. 输出一份可读的 trace 报告
4. 带着一套可迁移模板进入下一阶段

> **本节默认模型**：工具型 Agent 继续使用 `deepseek-chat`，trace 只保留最小可观测计划状态，不展示长篇完整 CoT。

---

## 一、完整 Demo 应该包含什么

```text
用户问题
  ↓
Planner（下一步计划）
  ↓
Router（选工具）
  ↓
Runner（执行循环）
  ↓
Guard（超时 / 步数 / 重复动作）
  ↓
Bench（记录结果）
  ↓
Trace / Report
```

---

## 二、推荐的 trace 结构

```js
[
  { stage: 'plan', value: '先找文档证据' },
  { stage: 'route', value: 'searchDocs' },
  {
    stage: 'step',
    step: 1,
    plan: '搜索第一轮证据',
    action: { tool: 'searchDocs', input: 'RAG 优势' },
    observation: ['...'],
  },
]
```

Demo 要让人看见的不是“模型想了多少”，而是：

1. 当前计划是什么
2. 为什么选这个工具
3. observation 如何改变了下一步

---

## 三、Demo 入口示例

```js
async function runAgentDemo(question, { planner, router, runner, guard, bench }) {
  const trace = []

  const plan = await planner(question)
  trace.push({ stage: 'plan', value: plan })

  const tool = router(question, plan)
  trace.push({ stage: 'route', value: tool?.name || 'none' })

  const result = await guard(() =>
    runner({
      question,
      tool,
      onTrace: (item) => trace.push(item),
    })
  )

  const report = bench
    ? await bench({ question, result, trace })
    : { score: null }

  return {
    ok: result.ok,
    answer: result.answer,
    trace,
    report,
  }
}
```

---

## 四、小结

这一节收尾后，Week 6 的主线应该被你理解成：

1. Agent 是“计划状态驱动的工具循环”
2. trace 要足够调试，但不需要暴露完整 CoT
3. `deepseek-chat` 继续承担工具型 Agent 的默认主线

后面无论接 RAG、应用落地还是更复杂的路由，这套结构都能继续复用。
