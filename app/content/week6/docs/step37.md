# Step 37: ReAct 多步 Agent｜实现 action → observation → next action 循环

## 学习目标

这个任务的本质是回答一个核心问题：**怎么把 ReAct 真的做成一个“能一直跑、能停、能留下过程记录”的最小循环？**

通过本教程，你将：

1. 搞清楚最小 ReAct runner 需要哪些模块
2. 学会把模型输出解析成 Action
3. 学会把工具结果写回上下文形成 Observation
4. 做出一个能跑通多轮决策的最小 Node.js 循环

---

## 一、先搭骨架：一个最小 runner 需要什么？

最小可运行的 ReAct 循环，通常只有四个角色：

```
用户输入
   ↓
LLM Planner
   ↓
Tool Registry
   ↓
Trace Log
```

- **LLM Planner**：根据上下文决定下一步
- **Tool Registry**：管理可用工具和调用方式
- **Trace Log**：保存 Thought / Action / Observation
- **Runner**：把这三者串成循环

如果少了 Runner，模型只能“说”；如果少了 Registry，模型不知道“能做什么”；如果少了 Trace，后面你连为什么失败都看不出来。

### 1.1 最小职责划分

```js
// planner：决定下一步
// dispatch：执行工具
// runner：驱动循环
// trace：记录过程
```

这一节最重要的不是 API 细节，而是**职责分离**。ReAct 是循环系统，不是单个函数。

---

## 二、机制：从一次调用变成多轮推进

### 2.1 循环流程

```
step N
  Thought -> Action -> Observation
       ↓                     ↑
       └────── 更新上下文 ────┘
```

每一轮都做三件事：

1. 让模型观察当前上下文
2. 解析出下一步 Action
3. 执行工具，把结果写回上下文

### 2.2 停止条件不要等最后才想

最小循环必须从一开始就定义停止条件：

- 模型已经输出 Final Answer
- 达到 `maxSteps`
- 工具超时或失败
- 模型重复同一个 Action 太多次

没有停止条件的 Agent，通常不是“更强”，而是“更会卡住”。

---

## 三、代码：一个最小可运行的 ReAct 循环

下面这个示例不依赖复杂框架，只演示核心流程。

```js
const tools = {
  search: async (query) => `search result for "${query}"`,
  calc: async (expr) => String(eval(expr)),
}

function parseAction(text) {
  const match = text.match(/Action:\s*(\{.*\})/s)
  return match ? JSON.parse(match[1]) : null
}

async function runReAct(question, llm, { maxSteps = 5 } = {}) {
  const trace = []
  let context = `Question: ${question}`

  for (let step = 1; step <= maxSteps; step++) {
    const output = await llm(context)
    const action = parseAction(output)

    if (!action) {
      return { ok: false, reason: 'invalid_action', trace, output }
    }

    if (action.tool === 'finish') {
      trace.push({ step, output })
      return { ok: true, trace, final: action.input }
    }

    const observation = await tools[action.tool](action.input)
    trace.push({ step, thought: output, action, observation })
    context += `\nObservation: ${observation}`
  }

  return { ok: false, reason: 'max_steps', trace }
}
```

### 3.1 这段代码的关键点

1. `context` 每轮都会追加 Observation
2. `parseAction()` 把模型输出限制成结构化动作
3. `trace` 保存每一轮的完整过程
4. `maxSteps` 防止无限循环

### 3.2 为什么不要把逻辑写死在 prompt 里？

因为 prompt 只能“引导”模型，不能真正“执行控制”。真正的循环控制要在代码里完成，比如：

- 是否继续
- 是否中止
- 是否换工具
- 是否落入兜底回答

这就是 ReAct 从“语言模式”变成“工程系统”的地方。

---

## 四、实验与调试：先让它可见，再让它变强

### 4.1 你应该看 trace，而不是只看最终答案

调 ReAct 时，最有价值的是 trace：

```js
[
  { step: 1, action: 'search', observation: '...' },
  { step: 2, action: 'search', observation: '...' },
  { step: 3, action: 'finish', observation: '...' }
]
```

如果最终答案错了，trace 能告诉你错在：

- 工具选错了
- Observation 没被利用
- 循环太短
- 输出格式坏了

### 4.2 最常见的两个坑

| 坑 | 表现 | 处理方式 |
|---|---|---|
| 输出不可解析 | 模型把 JSON 写坏了 | 严格限制 Action 模板 |
| 重复调用 | 同一工具同一参数反复出现 | 加重复检测和 step 上限 |

---

## 五、小结：最小循环的价值

这一节真正要拿走的，不是“某段代码”，而是这套思维：

> **ReAct 不是把模型包起来就完了，而是要把“思考、行动、观察、再思考”变成受控循环。**

最小 runner 写通后，后面你再加记忆、规划、评测、复杂路由，都是在同一个骨架上长出来的。

