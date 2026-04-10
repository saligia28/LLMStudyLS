# Step 41: ReAct 多步 Agent｜做任务超时、循环限制

## 学习目标

这个任务的本质是回答一个核心问题：**一个会多步推理的 Agent，怎样才能既能做事，又不会无限循环、拖垮系统？**

通过本教程，你将：

1. 理解 Agent 为什么会失控
2. 学会设计 `timeout`、`maxSteps` 和重复检测
3. 学会给失败场景准备 fail-safe 策略
4. 把安全控制变成代码，而不是口头约束

---

## 一、为什么多步 Agent 特别需要保护？

ReAct 的强项是“能继续想下一步”，但这也带来风险：

- 工具失败后一直重试
- 模型总觉得“再查一次就有答案”
- 某些输入会触发无限重复
- 外部工具响应过慢，导致整个请求挂起

所以安全控制不是附加项，而是 Agent 能上线的前提。

### 1.1 最常见的失控模式

```
Thought -> Action -> Observation -> Thought -> Action -> Observation -> ...
                ↑
                └── 没有停止条件，就会一直跑
```

---

## 二、机制：把控制面放到循环外层

建议把控制分成四层：

| 控制项 | 作用 |
|---|---|
| `timeout` | 限定整体任务最多跑多久 |
| `maxSteps` | 限定最多执行几轮 |
| 重复检测 | 同一 Action 是否反复出现 |
| fallback | 失败后返回什么 |

### 2.1 什么时候该停？

常见停止条件有：

1. 已经输出 Final Answer
2. 达到最大步数
3. 总耗时超过阈值
4. 连续重复同一工具调用
5. 工具返回不可恢复错误

---

## 三、代码：给循环套上安全壳

下面是一个简单的保护层示例。核心思路是：**先设边界，再让循环跑**。

```js
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms)
    ),
  ])
}

async function runAgentSafely(agent, input, {
  timeoutMs = 10000,
  maxSteps = 5,
} = {}) {
  const seen = new Map()
  const start = Date.now()

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
      return { ok: true, result, elapsedMs: Date.now() - start }
    }
  }

  return {
    ok: false,
    reason: 'max_steps',
    fallback: '已达到最大步数，未能稳定收敛。',
  }
}
```

### 3.1 这段代码解决了什么？

1. `withTimeout()` 防止单次调用卡死
2. `maxSteps` 防止循环无边界
3. `seen` 防止重复动作
4. `fallback` 让系统在失败时仍然有可用输出

### 3.2 为什么 fail-safe 很重要？

因为真实业务里，最怕的不是“没答对”，而是“卡住了”。卡住的 Agent 会占资源、堆请求、影响整条链路。一个不完美但能优雅退出的系统，通常比一个“理论上很强但偶尔无限循环”的系统更可用。

---

## 四、实验与调试：怎么验证保护真的生效？

你可以做三个故意破坏性的测试：

1. 把工具延迟拉长，验证 timeout 是否触发
2. 让模型反复输出同一个 Action，验证重复检测是否生效
3. 把 maxSteps 设很小，验证循环是否会按边界退出

### 4.1 你要看的是退出原因，不只是退出结果

建议返回结构至少包含：

```js
{
  ok: false,
  reason: 'timeout' | 'max_steps' | 'repeated_action',
  fallback: '...',
  trace: []
}
```

这样你后面分析问题时，能一眼看出是“慢了”、“绕了”还是“卡了”。

---

## 五、小结：控制 Agent 的关键，是给它一个体面退出的方式

ReAct 不是放飞模型，而是给模型一个可控的执行轨道。真正成熟的 Agent 系统，必须同时具备：

- 能继续做事
- 能判断何时停止
- 能在失败时安全落地

这三点齐了，Agent 才算真的能放到工程里。

