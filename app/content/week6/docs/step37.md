# Step 37: ReAct 多步 Agent｜实现 action → observation → next action 循环

## 学习目标

这一节要把 ReAct 从概念变成一个真正能跑起来的最小循环。

完成后你应该能：

1. 设计最小 runner 的职责边界
2. 让模型输出结构化动作
3. 把工具结果写回上下文形成 observation
4. 保留足够调试的计划状态与 trace

> **本节默认模型**：`deepseek-chat`。循环里不引入 `deepseek-reasoner`。

---

## 一、最小 runner 需要什么

```text
用户输入
  ↓
Planner（输出下一步动作）
  ↓
Tool Registry（执行动作）
  ↓
Trace（记录计划状态 / 动作 / observation）
  ↓
Runner（驱动循环）
```

这里的重点是“最小可观测”，而不是让模型输出一长串 thought。

---

## 二、一个更适合当前主线的 prompt 约束

```js
function buildAgentPrompt(question, toolList) {
  return `
你是一个会调用工具完成任务的 Agent。

可用工具：
${toolList.map((t) => `- ${t.name}: ${t.description}`).join('\n')}

请输出 JSON：
{
  "plan": "一句话说明当前下一步计划",
  "action": {
    "tool": "工具名，或 finish",
    "input": "工具输入，或最终答案"
  }
}

问题：${question}
`
}
```

这样做好处是：

- 模型输出更稳定
- 程序更容易解析
- 不依赖公开完整思维链

---

## 三、最小循环实现

```js
async function runAgent(question, llm, tools, { maxSteps = 5 } = {}) {
  const trace = []
  let context = question

  for (let step = 1; step <= maxSteps; step++) {
    const raw = await llm(context)
    const parsed = JSON.parse(raw)

    if (parsed.action.tool === 'finish') {
      trace.push({ step, plan: parsed.plan, action: parsed.action, observation: 'done' })
      return { ok: true, answer: parsed.action.input, trace }
    }

    const observation = await tools[parsed.action.tool](parsed.action.input)

    trace.push({
      step,
      plan: parsed.plan,
      action: parsed.action,
      observation,
    })

    context += `\n\n上一步 observation: ${JSON.stringify(observation)}`
  }

  return { ok: false, reason: 'max_steps', trace }
}
```

---

## 四、小结

这一节的关键变化是：

1. trace 记录“计划状态 + 动作 + observation”
2. 不再依赖长篇 Thought 文本
3. runner 的目标是“稳定推进任务”，不是“展示模型内心戏”

下一节我们把这套循环放进“先搜索、再处理”的两阶段 Agent。
