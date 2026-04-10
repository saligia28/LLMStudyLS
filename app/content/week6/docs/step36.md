# Step 36: ReAct 多步 Agent｜理解 ReAct（思维链 + 行动）模式

## 学习目标

这个任务的本质是回答一个核心问题：**ReAct 为什么不是“更会聊天的 LLM”，而是“能把思考接到行动上的 Agent”？**

通过本教程，你将：

1. 明白 ReAct 和普通 function calling 的本质区别
2. 看懂 Thought / Action / Observation 是怎么串成循环的
3. 理解为什么 ReAct 天然适合多步任务与工具调用
4. 学会写一个最小 ReAct prompt 模板和 trace 记录结构

---

## 一、先想清楚：ReAct 解决的到底是什么问题？

普通 LLM 最擅长的是“补全文本”，但很多真实任务并不是一次性写答案就结束，而是要先查、再算、再判断、最后总结。比如：

> “帮我比较北京和上海今天哪个更适合户外活动。”

如果没有外部工具，模型只能靠记忆猜；如果只有 function calling，它能调用工具，但**不一定知道什么时候该停、什么时候该继续、下一步该做什么**。ReAct 解决的就是这个“从想法到行动”的过渡问题。

### 1.1 ReAct 的核心不是“调用工具”，而是“循环驱动”

```
用户问题
   ↓
Thought: 先判断信息缺口
   ↓
Action: 选择一个工具
   ↓
Observation: 读取工具返回
   ↓
Thought: 根据结果调整策略
   ↓
Action: 继续调用下一个工具
   ↓
...
   ↓
Final Answer
```

这意味着 ReAct 的重点不是某一次调用，而是**一轮一轮地纠偏**。它把“推理”和“执行”绑在一起，让模型在每次观察后重新决策。

### 1.2 和普通 function calling 的区别

| 维度 | 普通 function calling | ReAct |
|---|---|---|
| 目标 | 让模型发起一次工具调用 | 让模型在循环中完成任务 |
| 过程 | 通常是单次或少次调用 | Thought / Action / Observation 多轮推进 |
| 控制重点 | 参数是否正确 | 下一步是否该继续、换工具还是结束 |
| 失败处理 | 常见是一次失败就结束 | 可根据 Observation 纠偏 |
| 适合场景 | 明确、短链路任务 | 搜索、比较、规划、推理、综合 |

你可以把 function calling 理解成“给模型一把扳手”，把 ReAct 理解成“给模型一整套现场施工流程”。

---

## 二、机制：Thought / Action / Observation 怎么协同？

ReAct 最容易被误解成“把思维链打印出来”。其实不是。真正有价值的是三层语义分工：

### 2.1 Thought：决定下一步为什么这么做

Thought 不等于长篇大论，它更像一个短小的工作判断：

- 现在信息够不够
- 需要哪个工具
- 要不要先搜索再计算
- 结果是否已经可以收尾

### 2.2 Action：把判断变成可执行动作

Action 不是自然语言感叹，而是结构化指令，例如：

```json
{ "tool": "search", "input": "北京 今天 天气" }
```

### 2.3 Observation：把真实世界的反馈接回系统

Observation 是工具执行后的结果，它是 ReAct 能“修正自己”的关键。没有 Observation，模型就只是自言自语；有了 Observation，下一轮 Thought 才有依据。

```
Thought 1: 先查北京天气
Action 1:  调用 search/weather
Observation 1: 北京，多云，8°C，风大
Thought 2: 继续查上海天气再比较
Action 2:  调用 search/weather
Observation 2: 上海，晴，18°C，风小
Thought 3: 结果足够了，可以回答
Final Answer: 上海更适合户外活动
```

---

## 三、代码：最小 ReAct Prompt 模板

ReAct 的“发动机”通常不是复杂代码，而是一个足够清晰的 prompt 约束。下面是一个最小可用模板：

```js
function buildReActPrompt({ tools, question }) {
  const toolText = tools
    .map((t) => `- ${t.name}: ${t.description}`)
    .join('\n')

  return `
你是一个 ReAct Agent。

你可以使用这些工具：
${toolText}

规则：
1. 每轮先写 Thought，再写 Action。
2. Action 必须是结构化 JSON。
3. 工具返回后，再根据 Observation 决定下一步。
4. 如果信息足够，输出 Final Answer。

输出格式：
Thought: ...
Action: {"tool":"...","input":"..."}
Observation: ...
Final Answer: ...

问题：${question}
`
}
```

### 3.1 为什么 prompt 里要写规则？

因为 ReAct 的难点不是“模型会不会说”，而是“模型会不会按循环格式输出”。如果不把格式约束写清楚，模型很容易：

- 把 Thought 写成长篇解释
- 在 Action 里夹带自然语言
- 在没观察结果前直接下结论

### 3.2 还要准备 trace 结构

建议从第一天就记录每一轮：

```js
const trace = [
  { step: 1, thought: '先查北京天气', action: 'search', observation: '...' },
  { step: 2, thought: '再查上海天气', action: 'search', observation: '...' },
]
```

Trace 不是“日志装饰”，它是你后面调 prompt、做评测、定位幻觉的核心证据。

---

## 四、实验与调试：你应该重点看什么？

### 4.1 先区分“看起来在推理”和“真的在循环”

有些模型会输出很长的思考过程，但如果它没有基于 Observation 改变策略，那就不是 ReAct，而是“写作风格像 ReAct”。

你可以检查三件事：

1. 是否真的出现了 Action
2. Observation 是否进入了下一轮上下文
3. 下一轮 Thought 是否参考了前一轮结果

### 4.2 常见问题

| 问题 | 典型现象 | 修复方向 |
|---|---|---|
| 工具描述太弱 | 模型乱选工具 | 把工具能力写具体 |
| 输出格式漂移 | Action 无法解析 | 强化模板和示例 |
| 一步就结束 | 没有循环 | 提示模型“只要信息不够就继续” |
| 观察结果没用上 | 重复调用同一工具 | 在上下文里保留 trace |

---

## 五、小结：ReAct 的最佳实践

ReAct 的本质不是“更聪明”，而是“更会在过程中纠偏”。如果你记住一句话，那就是：

> **ReAct = 让模型在每次观察后重新决策，而不是一次性猜完整答案。**

实操时建议遵守三条：

1. 工具能力要写清楚，别让模型猜
2. 每轮都记录 trace，别把过程藏起来
3. 先保证循环成立，再谈更复杂的规划和优化

