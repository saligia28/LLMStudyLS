# Step 31: Function Calling｜让模型根据内容自动调用函数

## 学习目标

这一节回答的核心问题是：**如何把“schema + 函数”接进一次完整的对话链路？**

完成后你应该能：

1. 把工具定义传给模型
2. 解析 `tool_calls`
3. 执行真实函数
4. 把工具结果作为 `role: "tool"` 回写给模型
5. 得到最终自然语言答案

> **本节默认模型**：`deepseek-chat`。工具调用主链路固定使用它，不混入 `deepseek-reasoner`。

---

## 一、完整流程先看一遍

```text
用户: “现在几点，再帮我算 19 + 23”
  ↓
模型返回 tool_calls
  ↓
代码执行工具
  ↓
把结果写回 messages
  ↓
再次调用模型
  ↓
得到最终答案
```

这里最容易忘记的是：**工具结果不是直接返回给用户，而是先回写给模型。**

---

## 二、第一次请求：把工具交给模型

```js
import OpenAI from 'openai'
import { tools } from './tools.js'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL || 'https://api.deepseek.com',
})

async function ask(messages) {
  return client.chat.completions.create({
    model: process.env.LLM_MODEL || 'deepseek-chat',
    messages,
    tools,
    tool_choice: 'auto',
  })
}
```

如果模型判断需要工具，它会在 `message.tool_calls` 里返回调用计划。

---

## 三、执行第一个工具调用

```js
import { executeTool } from './executor.js'

function getFirstToolCall(response) {
  return response.choices[0]?.message?.tool_calls?.[0] || null
}

async function runSingleToolRound(messages) {
  const firstResponse = await ask(messages)
  const assistantMessage = firstResponse.choices[0].message
  const toolCall = getFirstToolCall(firstResponse)

  if (!toolCall) {
    return assistantMessage.content || ''
  }

  const args = JSON.parse(toolCall.function.arguments || '{}')
  const toolResult = executeTool(toolCall.function.name, args)

  const secondResponse = await ask([
    ...messages,
    {
      role: 'assistant',
      content: assistantMessage.content,
      tool_calls: assistantMessage.tool_calls,
    },
    {
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify(toolResult),
    },
  ])

  return secondResponse.choices[0].message.content || ''
}
```

这里有三个协议细节必须记牢：

1. 要把原始 `assistant` 工具调用消息也塞回去
2. `role: "tool"` 必须带 `tool_call_id`
3. 工具结果建议转成 JSON 字符串，方便模型继续消费

---

## 四、为什么 `role: "tool"` 很重要

老接口里你可能见过 `role: "function"`。现在统一使用：

```js
{
  role: 'tool',
  tool_call_id: toolCall.id,
  content: JSON.stringify(toolResult),
}
```

这样做的意义是：

- 模型知道这不是普通用户消息
- 模型知道它对应的是哪一次调用
- 多工具调用时也能正确配对

---

## 五、最小示例：时间 + 加法

```js
const messages = [
  {
    role: 'user',
    content: '先告诉我上海现在几点，再帮我算 19 + 23。',
  },
]

const answer = await runSingleToolRound(messages)
console.log(answer)
```

你可以预期的行为是：

1. 模型先决定调用一个工具
2. 你的程序执行
3. 模型再组织自然语言

如果这个问题要连续调用多个工具，当前版本还不够，这就是下一节要解决的内容。

---

## 六、常见错误

### 6.1 忘了 parse arguments

错误写法：

```js
toolCall.function.arguments.a
```

正确写法：

```js
JSON.parse(toolCall.function.arguments)
```

### 6.2 忘了回写 assistant 工具调用消息

如果只回写 `role: "tool"`，模型会缺失“刚才为什么调用这个工具”的上下文。

### 6.3 把工具结果直接当用户可见答案

工具返回值通常是结构化数据，不是最终面向用户的话术。

---

## 七、小结

这一节把工具调用主链路跑通了：

1. `tools` 交给模型
2. `tool_calls` 从响应里取出来
3. 本地执行真实函数
4. 用 `role: "tool"` 回写结果
5. 再次调用模型生成最终答案

下一节我们把最脆弱的一环补强：`arguments` 的 JSON 解析和错误处理。
