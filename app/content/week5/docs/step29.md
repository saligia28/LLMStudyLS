# Step 29: Function Calling｜理解 function schema

## 学习目标

这一节回答的核心问题是：**模型为什么需要 schema，才能稳定地调用工具？**

完成后你应该能：

1. 理解 `tools` / `tool_calls` 在对话接口里的角色
2. 看懂一个 function schema 由哪些字段组成
3. 区分“模型决定调用什么”与“代码真正执行什么”
4. 建立本仓库内可复用的工具调用心智模型

> **本节默认模型**：所有可运行示例默认使用 `deepseek-chat`。`deepseek-reasoner` 只适合补充阅读，不放进工具调用主链路。

---

## 一、Function Calling 到底在解决什么问题

普通聊天模型只能“生成文本”。当用户问的是：

- “现在上海几点？”
- “把 19 和 23 相加”
- “查一下今天北京天气”

模型如果没有工具，就只能猜。Function Calling 的价值是：**让模型先返回一条结构化调用指令，再由你的程序执行真实函数。**

```text
用户问题
  ↓
模型判断是否需要工具
  ↓
assistant 消息中返回 tool_calls
  ↓
你的程序执行真实函数
  ↓
把结果作为 role:"tool" 消息回写
  ↓
模型生成最终自然语言答案
```

这里最关键的边界是：

- 模型不会真的执行函数
- 模型只负责“决定调用什么、参数长什么样”
- 你的代码负责验证参数、执行函数、处理错误

---

## 二、为什么一定要有 schema

schema 不是“写给人看的文档”，而是“写给模型看的接口契约”。

一个好的 schema 至少告诉模型三件事：

1. 工具叫什么
2. 这个工具适合在什么场景下使用
3. 参数有哪些，类型和约束是什么

如果 schema 太弱，模型常见的问题是：

- 该用工具时不用
- 用错工具
- 参数名拼错
- 传入不符合预期的数据类型

---

## 三、一个最小可用的 schema

```js
const tools = [
  {
    type: 'function',
    function: {
      name: 'getTime',
      description: '获取指定时区的当前时间。如果用户只问“现在几点”，优先调用这个工具。',
      parameters: {
        type: 'object',
        properties: {
          timezone: {
            type: 'string',
            description: 'IANA 时区，例如 Asia/Shanghai、UTC',
          },
        },
        required: [],
      },
    },
  },
]
```

这里每个字段都很重要：

- `type: "function"`：告诉接口这是一个函数工具
- `name`：后续真正执行时要靠这个名字匹配本地函数
- `description`：帮助模型判断“什么时候该用它”
- `parameters`：描述参数的 JSON Schema

---

## 四、用 DeepSeek 发起一次工具调用

```js
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL || 'https://api.deepseek.com',
})

const response = await client.chat.completions.create({
  model: process.env.LLM_MODEL || 'deepseek-chat',
  messages: [
    { role: 'system', content: '你是一个会按需调用工具的助手。' },
    { role: 'user', content: '现在上海几点？' },
  ],
  tools,
  tool_choice: 'auto',
})

console.log(response.choices[0].message)
```

当模型决定调用工具时，典型返回会长这样：

```js
{
  role: 'assistant',
  content: null,
  tool_calls: [
    {
      id: 'call_xxx',
      type: 'function',
      function: {
        name: 'getTime',
        arguments: '{"timezone":"Asia/Shanghai"}'
      }
    }
  ]
}
```

注意两点：

1. `tool_calls` 是数组
2. `arguments` 是 JSON 字符串，不是对象

---

## 五、Schema 设计的三个经验

### 5.1 描述要写触发条件

差的描述：

```js
description: '获取时间'
```

更好的描述：

```js
description: '获取指定时区的当前时间。如果用户询问现在几点、当前时间、某地时间，优先调用此工具。'
```

### 5.2 参数尽量少而准

不要让第一个工具就有一大堆可选参数。对初学阶段来说：

- 必填参数少一些
- 默认行为明确一些
- 能从上下文推断的就别全暴露给模型

### 5.3 名称要和业务动作一致

推荐：

- `getTime`
- `sum`
- `getWeather`
- `searchDocs`

不推荐：

- `tool1`
- `runFn`
- `handleData`

---

## 六、本周建议的最小工具集

为了后面几节能连续推进，这一周建议只围绕这三个工具：

1. `getTime`
2. `sum`
3. `getWeather`

这样有三个好处：

- 足够覆盖“查询 / 计算 / 外部信息”三类场景
- schema 简单，便于把注意力放在协议本身
- 后续天气 demo 能直接复用

---

## 七、小结

这一节真正要带走的是：

1. Function Calling 的本质是“模型返回调用指令，程序负责执行”
2. schema 是模型理解工具边界的唯一正式入口
3. DeepSeek 主线里默认使用 `deepseek-chat`，工具调用不要混入 `deepseek-reasoner`

下一节我们就把 schema 落到两个最小函数上：`getTime` 和 `sum`。
