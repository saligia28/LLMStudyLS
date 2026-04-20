# Step 40: ReAct 多步 Agent｜测试复杂任务（翻译、问答、推理）

> **本节默认模型**：继续使用 `deepseek-chat` 跑复杂任务评测，重点看过程是否可观测、工具是否用对，而不是输出了多长的思考文本。

## 学习目标

这个任务的本质是回答一个核心问题：**复杂任务的 Agent，到底应该怎么测，才能看出它是真会做事，还是只是在某些例子上碰巧答对？**

通过本教程，你将：

1. 理解为什么复杂任务不能只看最终答案
2. 学会设计适合 ReAct 的任务基准
3. 学会给复杂任务定义可观察指标
4. 用 benchmark 思维验证 Agent 的真实能力

---

## 一、为什么复杂任务不能只看“答对没”？

在 ReAct 系统里，很多任务不是单轮问答，而是包含：

- 多步搜索
- 多轮判断
- 工具选择
- 证据整合

所以“最终答案看起来对”并不代表过程健康。一个 Agent 可能：

1. 走了很多冤枉路
2. 选错工具但碰巧答对
3. 结果正确，但没有可解释性

这就是为什么我们需要一套更像“实验设计”的测试方法。

### 1.1 复杂任务的评测目标

- 看答案是否正确
- 看过程是否合理
- 看工具是否用对
- 看是不是稳定可复现

---

## 二、机制：把复杂任务拆成可测项

推荐把任务分成三类：

| 类型 | 例子 | 重点 |
|---|---|---|
| 翻译 | 中英互译 | 准确性、语义保持 |
| 问答 | 查资料后回答 | 证据使用、引用 |
| 推理 | 比较、归纳、判断 | 多步过程、工具选择 |

### 2.1 一条好的 benchmark 记录应该包含什么？

```js
{
  id: 'task-01',
  type: 'qa',
  question: '北京和上海今天哪个更适合户外活动？',
  goldAnswer: '上海更适合',
  evidence: ['北京多云有风', '上海晴朗微风'],
  allowedTools: ['search'],
  expectedSteps: 2
}
```

这样设计的好处是，后面你不仅能测“对不对”，还能测“有没有按预期方式解决”。

---

## 三、代码：一个简单的任务基准跑分器

下面的例子展示如何跑一组任务，并记录结果。

```js
const benchmarks = [
  {
    id: 't1',
    type: 'translation',
    input: 'Translate: ReAct enables reasoning and acting.',
    gold: 'ReAct 让推理和行动结合起来。',
  },
  {
    id: 't2',
    type: 'qa',
    input: 'Which city is better for outdoor activities today?',
    goldKeywords: ['Shanghai', 'better'],
  },
]

function evaluateText(answer, task) {
  if (task.gold) return answer.includes(task.gold) ? 1 : 0
  if (task.goldKeywords) {
    return task.goldKeywords.every((k) => answer.toLowerCase().includes(k.toLowerCase())) ? 1 : 0
  }
  return 0
}

async function runBench(agent) {
  const results = []

  for (const task of benchmarks) {
    const start = Date.now()
    const output = await agent(task.input)
    results.push({
      id: task.id,
      type: task.type,
      score: evaluateText(output.answer ?? output, task),
      steps: output.trace?.length ?? 0,
      latencyMs: Date.now() - start,
    })
  }

  return results
}
```

### 3.1 为什么要记录 `steps` 和 `latencyMs`？

因为复杂任务的质量不只取决于“有没有答对”，还取决于：

- 过程是不是过长
- 是否频繁浪费工具调用
- 是否因为策略问题变慢

这些指标能帮助你定位问题是出在 prompt、路由，还是循环控制。

---

## 四、实验与调试：看评测时要看什么？

建议你把结果拆成四个维度：

| 指标 | 看什么 |
|---|---|
| 正确率 | 最终答案是否命中 |
| 工具命中率 | 该用的工具有没有用 |
| 过程长度 | 是否过长、是否绕路 |
| 稳定性 | 换几次输入是否都能答对 |

### 4.1 最有价值的对比

你可以做一个很简单的 A/B：

- A：直接问模型
- B：走 ReAct 循环

如果 B 在复杂问题上更稳定、可解释、可复现，那就说明你的 Agent 设计是有效的。

---

## 五、小结：测试复杂任务，本质是在测“系统行为”

复杂任务评测不是为了把答案抄成标准答案，而是为了回答：

> **这个 Agent 在面对多步任务时，是不是有稳定的解决路径？**

只要你把任务、证据、指标这三件事做扎实，后面每次改 prompt、改工具、改路由，都会有可比较的基线。
