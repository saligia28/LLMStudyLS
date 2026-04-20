# Step 32: Function Calling｜调试 arguments 的 JSON 解析与错误处理

## 学习目标

这一节回答的核心问题是：**当模型给出的参数不够干净时，怎样安全地把它变成可执行输入？**

完成后你应该能：

1. 理解 `tool_calls[].function.arguments` 的真实格式
2. 安全地解析 JSON 字符串
3. 为参数错误、未知工具、执行失败设计清晰错误信息
4. 让你的工具调用链路更接近真实工程

> **本节默认模型**：`deepseek-chat`。本节不是在比较模型能力，而是在补强协议处理层。

---

## 一、arguments 的真实样子

工具调用返回里最容易踩坑的字段就是：

```js
toolCall.function.arguments
```

它通常长这样：

```js
'{"timezone":"Asia/Shanghai"}'
```

注意：这是**字符串**，不是对象。

---

## 二、写一个安全解析函数

```js
export function parseToolArguments(raw) {
  if (raw == null || raw === '') {
    return {}
  }

  if (typeof raw === 'object') {
    return raw
  }

  if (typeof raw !== 'string') {
    throw new Error('arguments 必须是 JSON 字符串或对象')
  }

  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new Error(`arguments 不是合法 JSON: ${error.message}`)
  }
}
```

这样做的收益是：

- 对空参数有默认行为
- 对已经是对象的情况有容错
- 对 JSON 解析错误给出明确报错

---

## 三、把解析和执行拆开

```js
import { parseToolArguments } from './parseToolArguments.js'
import { toolRegistry } from './tools.js'

export function executeToolCall(toolCall) {
  const name = toolCall?.function?.name
  const rawArgs = toolCall?.function?.arguments

  if (!name) {
    throw new Error('缺少工具名称')
  }

  const fn = toolRegistry[name]
  if (!fn) {
    throw new Error(`未知工具: ${name}`)
  }

  const args = parseToolArguments(rawArgs)
  return fn(args)
}
```

拆开的好处是：

- JSON 解析问题和业务执行问题分开定位
- 单元测试更容易写
- 后面要接日志、监控、重试时边界清楚

---

## 四、建议覆盖的错误场景

至少要考虑这几类：

1. `tool_calls` 为空
2. `name` 不存在
3. `arguments` 不是合法 JSON
4. 参数类型不对
5. 函数执行时抛异常

一个比较实用的包装方式：

```js
export function safeExecuteToolCall(toolCall) {
  try {
    return {
      ok: true,
      data: executeToolCall(toolCall),
    }
  } catch (error) {
    return {
      ok: false,
      error: error.message,
    }
  }
}
```

如果你想把错误继续交给模型解释，可以把错误也作为 `role: "tool"` 的 `content` 回写：

```js
{
  role: 'tool',
  tool_call_id: toolCall.id,
  content: JSON.stringify({
    ok: false,
    error: '无效时区: Mars/Base',
  }),
}
```

---

## 五、结构化返回比裸字符串更稳

推荐函数返回这种结构：

```js
{
  ok: true,
  data: {
    timezone: 'Asia/Shanghai',
    currentTime: '2026/04/16 20:15:03',
  }
}
```

而不是单纯：

```js
'当前时间是 20:15:03'
```

原因是：

- 模型更容易从结构化字段里取值
- 出错时格式也统一
- 后面想接前端或日志都更方便

---

## 六、和 JSON 输出能力的关系

本周主线里你会同时遇到两种“结构化”需求：

1. **工具调用参数**：由 `tool_calls[].function.arguments` 承载
2. **普通结构化答案**：由 `response_format: { type: "json_object" }` 约束

这两者不要混淆：

- 工具参数用于“给程序执行”
- JSON 输出用于“给程序解析结果”

---

## 七、小结

这一节最重要的工程原则只有一句：

**永远不要直接信任模型产出的 arguments。**

你需要做的最小防线是：

1. 先解析
2. 再校验
3. 再执行
4. 出错时把错误形状也做成结构化

下一节我们把链路继续补齐，处理“连续多次工具调用”和 stream 模式下的碎片化参数。
