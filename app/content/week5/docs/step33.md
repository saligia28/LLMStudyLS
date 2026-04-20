# Step 33: Function Calling｜实现 Function 执行循环

## 学习目标

这一节回答的核心问题是：**如果模型一次回答里还想继续调用工具，链路该怎么继续推进？**

完成后你应该能：

1. 把单次 `if` 处理升级成 `while` 循环
2. 理解多轮工具调用的停止条件
3. 看懂 stream 模式下 `tool_calls` 参数为什么会碎片化
4. 给工具调用链路加上循环保护

> **本节默认模型**：`deepseek-chat`。工具循环与流式工具调用都继续使用它。

---

## 一、为什么单次 `if` 不够

上一节的最小链路只处理一次工具调用，但真实问题可能是这样的：

- “先查上海时间，再算 19 + 23”
- “先搜资料，再总结”
- “先查天气，再判断是否适合出门”

这类问题的特点是：**模型收到第一个工具结果之后，还可能继续调用下一个工具。**

所以流程应该从：

```js
if (message.tool_calls?.length) {
  // 只处理一次
}
```

升级成：

```js
while (message.tool_calls?.length) {
  // 处理直到没有新的工具调用
}
```

---

## 二、一个最小可用的循环版本

```js
async function runToolLoop(messages, { maxIterations = 5 } = {}) {
  let iterations = 0

  while (iterations < maxIterations) {
    const response = await ask(messages)
    const message = response.choices[0].message

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return message.content || ''
    }

    const toolMessages = []

    for (const toolCall of message.tool_calls) {
      const result = safeExecuteToolCall(toolCall)
      toolMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      })
    }

    messages.push({
      role: 'assistant',
      content: message.content,
      tool_calls: message.tool_calls,
    })
    messages.push(...toolMessages)

    iterations += 1
  }

  throw new Error('工具调用超过最大轮数，已主动停止')
}
```

这里有两个升级点：

1. 支持一轮里多个 `tool_calls`
2. 支持多轮循环，直到模型不再请求工具

---

## 三、停止条件要从一开始就定义

至少准备下面三种：

1. **没有新的 `tool_calls`**：说明可以输出最终答案
2. **达到 `maxIterations`**：防止无限循环
3. **出现不可恢复错误**：例如核心工具持续失败

推荐把保护参数做成配置：

```js
const TOOL_LOOP_CONFIG = {
  maxIterations: 5,
  abortOnToolError: false,
}
```

---

## 四、stream 模式为什么更麻烦

普通模式下，模型会一次性返回完整 `tool_calls`。  
stream 模式下，参数可能是分片吐出来的：

```js
chunk1: { delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'getTime', arguments: '' } }] } }
chunk2: { delta: { tool_calls: [{ index: 0, function: { arguments: '{"time' } }] } }
chunk3: { delta: { tool_calls: [{ index: 0, function: { arguments: 'zone":"Asia/Shanghai"}' } }] } }
chunk4: { finish_reason: 'tool_calls' }
```

也就是说你不能在第一个 chunk 就 `JSON.parse()`。

---

## 五、stream 模式下的拼接思路

```js
function mergeToolCallDelta(state, deltaToolCall) {
  const current = state[deltaToolCall.index] || {
    id: '',
    type: 'function',
    function: { name: '', arguments: '' },
  }

  if (deltaToolCall.id) current.id = deltaToolCall.id
  if (deltaToolCall.function?.name) current.function.name = deltaToolCall.function.name
  if (deltaToolCall.function?.arguments) {
    current.function.arguments += deltaToolCall.function.arguments
  }

  state[deltaToolCall.index] = current
  return state
}
```

最小原则是：

- 先按 `index` 聚合
- 等 `finish_reason === "tool_calls"` 再当成完整数据处理
- 最后统一进入和普通模式相同的执行循环

---

## 六、小结

这一节真正解决的是“工具调用不是一次性行为，而是一个循环系统”。

你需要记住：

1. 普通模式用 `while` 驱动多轮工具调用
2. 一轮里可能不止一个 `tool_calls`
3. stream 模式要先拼接，再解析
4. 循环一定要有限制，不能让模型无限打工具

下一节我们把这些能力放进一个完整 demo：天气查询。
