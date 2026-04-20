# Step 39: ReAct 多步 Agent｜加入多工具选择逻辑

> **本节默认模型**：继续使用 `deepseek-chat` 做工具路由。这里关注的是“如何选工具”，不是展示完整思维链。

## 学习目标

这个任务的本质是回答一个核心问题：**当 Agent 手里不止一个工具时，它怎么知道该先用谁、后用谁，或者干脆不用？**

通过本教程，你将：

1. 理解多工具路由为什么是 Agent 的核心能力之一
2. 学会给工具建立能力标签和选择规则
3. 学会设计可解释的 tool routing 逻辑
4. 避免“模型会选工具，但选得很玄学”

---

## 一、为什么多工具选择会变成问题？

单工具系统很好做，因为模型几乎没有选择成本。但一旦你有了：

- 搜索工具
- 计算工具
- 总结工具
- 数据查询工具
- 写入工具

问题就变成：**现在到底该调用哪个？**

### 1.1 工具多了之后，Agent 容易犯的错

- 该搜的时候去计算
- 该算的时候去搜索
- 明明已经够了，还继续打工具
- 需要写入时却只会总结

所以，多工具系统本质上不是“多几个函数”，而是要有一套**选择策略**。

---

## 二、机制：给每个工具加上能力标签

你可以把工具看成有元数据的能力块，而不是裸函数。

```js
const tools = [
  {
    name: 'search',
    capabilities: ['fresh_data', 'lookup', 'evidence'],
    cost: 'low',
    latency: 'medium',
  },
  {
    name: 'calc',
    capabilities: ['math', 'deterministic'],
    cost: 'low',
    latency: 'low',
  },
  {
    name: 'database',
    capabilities: ['structured_query', 'internal_state'],
    cost: 'medium',
    latency: 'medium',
  },
]
```

### 2.1 选择规则通常来自四类信号

| 信号 | 含义 | 例子 |
|---|---|---|
| 任务意图 | 用户要查、算、写还是总结 | “比较天气”偏搜索 |
| 能力匹配 | 工具是否真的能做这件事 | 数学问题用 calc |
| 代价 | 哪个工具更便宜、更快 | 先选低成本工具 |
| 状态依赖 | 是否需要前一轮结果 | 有上下文时选 database |

这意味着路由不是“看哪个工具名字顺眼”，而是一个带约束的决策过程。

---

## 三、代码：一个可解释的工具路由器

下面是一个简单但很实用的工具选择器。它不追求花哨，追求可读、可调、可解释。

```js
function scoreTool(tool, task) {
  let score = 0
  const text = task.toLowerCase()

  if (tool.capabilities.includes('math') && /计算|加|减|乘|除|sum|calc/.test(text)) score += 5
  if (tool.capabilities.includes('fresh_data') && /今天|最新|实时|天气|新闻/.test(text)) score += 5
  if (tool.capabilities.includes('structured_query') && /表|数据库|订单|记录/.test(text)) score += 5

  if (tool.cost === 'low') score += 1
  if (tool.latency === 'low') score += 1

  return score
}

function selectTool(task, tools) {
  const ranked = tools
    .map((tool) => ({ tool, score: scoreTool(tool, task) }))
    .sort((a, b) => b.score - a.score)

  return ranked[0]?.score > 0 ? ranked[0].tool : null
}
```

### 3.1 为什么先用规则路由？

因为在很多场景里，最难的不是“能不能让模型选工具”，而是“你能不能解释它为什么选这个工具”。规则路由有三个优点：

- 可调试
- 可回放
- 可做基线对比

### 3.2 再把路由结果喂给模型

```js
const chosen = selectTool(task, tools)
trace.push({ step, thought: '先选择最匹配的工具', action: chosen?.name })
```

这样模型不是在盲选，而是在一个可控的候选集里做决策。

---

## 四、实验与调试：多工具系统怎么验？

### 4.1 你要测试的是“选得对不对”，不是“调用过没过”

建议准备三类题：

1. 明确型：一眼知道该用哪个工具
2. 组合型：需要先搜再算
3. 歧义型：看模型能不能先问澄清问题

### 4.2 常见问题

| 问题 | 现象 | 处理方式 |
|---|---|---|
| 工具描述不清 | 模型总选错 | 给能力标签 |
| 多个工具分数相同 | 每次选法不稳定 | 加 tie-breaker |
| 模型过度自信 | 不该用工具也硬答 | 在 prompt 里要求先判断是否需要工具 |

---

## 五、小结：路由不是“选一个名字”，而是“选一种能力”

多工具选择逻辑真正要解决的是：**在不同任务类型下，让 Agent 走最合适的路径。**

如果你把路由设计好，后面扩新工具就会轻松很多，因为系统已经知道“该用什么信号来决定下一步”。
