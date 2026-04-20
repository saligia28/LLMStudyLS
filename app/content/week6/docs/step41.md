# Step 41: ReAct 多步 Agent｜做任务超时、循环限制

## 学习目标

这一节回答的核心问题是：**一个会持续规划下一步的 Agent，怎样才能既能做事，又不会失控？**

完成后你应该能：

1. 给多步 Agent 加上超时与步数限制
2. 检测重复动作
3. 设计失败时的 fallback
4. 让 Agent 在异常情况下也能优雅退出

> **本节默认模型**：仍然是 `deepseek-chat` 工具型循环，安全控制放在循环外层，而不是依赖模型自觉停下。

---

## 一、为什么多步 Agent 特别需要保护

一旦系统能“继续想下一步”，就一定会遇到这些风险：

- 工具失败后一直重试
- observation 不足时无限搜索
- 相同动作来回重复
- 某个工具卡住整条链路

所以安全控制不是附加项，而是多步 Agent 的主结构之一。

---

## 二、最常见的控制项

| 控制项 | 作用 |
| --- | --- |
| `timeoutMs` | 限定单次任务总耗时 |
| `maxSteps` | 限定最多执行几轮 |
| 重复动作检测 | 防止同一动作反复出现 |
| fallback | 失败时给用户保守结果 |

---

## 三、一个最小安全壳

```js
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

async function runAgentSafely(agent, input, { timeoutMs = 10000, maxSteps = 5 } = {}) {
  const seen = new Map()

  for (let step = 1; step <= maxSteps; step++) {
    const result = await withTimeout(agent.step(input, step), timeoutMs)

    const key = JSON.stringify(result.action)
    seen.set(key, (seen.get(key) || 0) + 1)

    if (seen.get(key) >= 3) {
      return {
        ok: false,
        reason: 'repeated_action',
        fallback: '我已经多次尝试同一动作，先停止并给出保守结论。',
      }
    }

    if (result.done) {
      return { ok: true, result }
    }
  }

  return {
    ok: false,
    reason: 'max_steps',
    fallback: '已达到最大步数，未能稳定收敛。',
  }
}
```

---

## 四、小结

这一节最重要的工程结论是：

1. 控制面应该包在循环外层
2. 不要把“什么时候停”交给模型自己判断
3. 一个能优雅失败的 Agent，比一个偶尔无限循环的 Agent 更可用

下一节我们把 prompt、loop、tool、guard 和 bench 一起整理成 Demo。
