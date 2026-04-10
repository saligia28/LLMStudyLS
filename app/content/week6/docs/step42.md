# Step 42: ReAct 多步 Agent｜整理 Agent Demo

## 学习目标

这个任务的本质是回答一个核心问题：**当你把 ReAct、工具选择、评测和安全控制都做完之后，怎样把它整理成一个真正能展示、能复盘、能继续扩展的 Demo？**

通过本教程，你将：

1. 回顾整套 ReAct Agent 的架构
2. 学会把 prompt、loop、tool、bench、guard 组合成 Demo
3. 明白如何输出一份能演示、能调试的执行报告
4. 为下一周的更大规模 Agent 能力做好衔接

---

## 一、先回头看：一个完整 Demo 应该包含什么？

到这一节为止，你已经有了几块关键能力：

```
Prompt 模板
   ↓
Thought / Action / Observation 循环
   ↓
工具路由
   ↓
复杂任务评测
   ↓
超时 / maxSteps / fail-safe
   ↓
Demo 输出
```

### 1.1 Demo 不是“能跑一次”，而是“能被看懂”

一个好的 Agent Demo 至少要让人看见三件事：

1. 它为什么这么想
2. 它为什么选这个工具
3. 它为什么在这里停下或继续

如果最后只有一句答案，没有 trace、没有指标、没有失败解释，那就还不算完整 Demo。

---

## 二、机制：把所有能力拼成一个执行链

你可以把 Demo 的主流程理解成下面这张图：

```
用户问题
   ↓
Planner 解析任务
   ↓
Tool Router 选工具
   ↓
Runner 执行循环
   ↓
Guard 负责超时/步数
   ↓
Bench 记录结果
   ↓
Trace / Report 输出
```

### 2.1 这不是“模块堆砌”，而是顺序依赖

- 没有 Planner，系统不知道先做什么
- 没有 Router，系统不知道用哪个工具
- 没有 Runner，系统不会循环
- 没有 Guard，系统可能失控
- 没有 Bench，系统没法证明自己变好了

---

## 三、代码：一个 Demo 入口怎么组织？

下面示例展示一个“总入口”式的 Agent Demo 组织方式。

```js
async function runAgentDemo(question, { planner, router, runner, guard, bench }) {
  const trace = []

  const plan = await planner(question)
  trace.push({ stage: 'plan', plan })

  const tool = router(question, plan)
  trace.push({ stage: 'route', tool: tool?.name })

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

### 3.1 这段代码的价值

它把 Demo 的边界定清楚了：

- `planner` 负责看任务
- `router` 负责选工具
- `runner` 负责执行
- `guard` 负责安全
- `bench` 负责验证

也就是说，Demo 不只是一个“聊天接口”，而是一个**可解释的 Agent 执行器**。

### 3.2 建议输出什么结果？

```js
{
  ok: true,
  answer: '...',
  trace: [...],
  report: {
    correctness: 1,
    steps: 3,
    latencyMs: 842
  }
}
```

这样一来，你演示时就不只是展示“答案”，而是展示“怎么做出来的”。

---

## 四、实验与验收：怎么判断 Demo 整理得够不够好？

你可以用下面这份清单验收：

| 项目 | 是否满足 |
|---|---|
| 能解释每一步 Thought / Action / Observation |  |
| 能看出工具是怎么被选中的 |  |
| 能在超时或步数耗尽时安全退出 |  |
| 能对复杂任务输出简单报告 |  |
| 能复现、能调试、能扩展 |  |

### 4.1 Demo 的“好看”不是关键，“可复用”才是关键

一个好 Demo 不应该只是“某次运行效果不错”，而应该是：

- 新任务能接进来
- 新工具能挂进去
- 新评测能加进去
- 新限制能拦住它

---

## 五、小结与衔接：这周学完，你已经有了一个完整 Agent 骨架

Week 6 的终点不是“我知道 ReAct 是什么”，而是：

> **我已经能把 ReAct 做成一套可运行、可观察、可评测、可控制的 Agent Demo。**

往下一周走时，最自然的延伸方向通常会是：

- 更长任务的状态管理
- 更稳的记忆或上下文组织
- 更细的计划与执行分离
- 更完整的端到端工作流

只要你把这一周的 Demo 整理好，后面的 Agent 能力就不是重新开始，而是在同一套骨架上继续长大。

