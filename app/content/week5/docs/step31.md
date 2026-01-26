# Step 31: Function Calling｜让模型根据内容自动调用函数

## 学习目标

这个任务的本质是回答一个核心问题:**如何让 AI 模型根据用户输入自动选择并调用合适的函数**。

通过本教程,你将:

1. 学会在 API 请求中传入函数定义
2. 理解 AI 如何分析用户意图并选择函数
3. 掌握解析 AI 返回的函数调用指令
4. 实现完整的函数调用流程

---

## 一、核心认知:AI 如何决定调用哪个函数?

### 1.1 AI 的决策过程

```
┌─────────────────────────────────────────────────────────────┐
│              AI 函数调用决策流程                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   输入:用户消息 + 可用函数列表                                 │
│   ┌─────────────────────────────────────────────────┐       │
│   │  用户: "现在几点了?"                             │       │
│   │                                                 │       │
│   │  可用函数:                                       │       │
│   │  - getTime: "获取当前时间"                       │       │
│   │  - sum: "计算两个数的和"                         │       │
│   └─────────────────────────────────────────────────┘       │
│                         ↓                                   │
│   AI 分析:                                                   │
│   ┌─────────────────────────────────────────────────┐       │
│   │  1. 理解用户意图: 查询时间                       │       │
│   │  2. 匹配函数描述:                                │       │
│   │     - getTime ✓ (匹配!)                         │       │
│   │     - sum ✗ (不匹配,这是计算功能)                │       │
│   │  3. 决定: 调用 getTime                          │       │
│   └─────────────────────────────────────────────────┘       │
│                         ↓                                   │
│   输出:函数调用指令                                           │
│   ┌─────────────────────────────────────────────────┐       │
│   │  {                                              │       │
│   │    role: "assistant",                          │       │
│   │    content: null,                              │       │
│   │    function_call: {                            │       │
│   │      name: "getTime",                          │       │
│   │      arguments: "{}"                           │       │
│   │    }                                           │       │
│   │  }                                             │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 匹配的关键:函数描述

```
┌─────────────────────────────────────────────────────────────┐
│         函数描述对 AI 决策的影响                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   场景 1: 描述清晰 → AI 准确匹配                              │
│   ┌─────────────────────────────────────────────────┐       │
│   │  用户: "帮我算一下 10 加 20 等于多少"            │       │
│   │                                                 │       │
│   │  函数:                                          │       │
│   │  {                                              │       │
│   │    name: "sum",                                │       │
│   │    description: "计算两个数字的和"               │       │
│   │  }                                              │       │
│   │                                                 │       │
│   │  结果: ✓ AI 正确调用 sum(10, 20)                │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   场景 2: 描述模糊 → AI 可能误判                              │
│   ┌─────────────────────────────────────────────────┐       │
│   │  用户: "帮我算一下 10 加 20 等于多少"            │       │
│   │                                                 │       │
│   │  函数:                                          │       │
│   │  {                                              │       │
│   │    name: "sum",                                │       │
│   │    description: "处理数字"  // ✗ 太模糊!        │       │
│   │  }                                              │       │
│   │                                                 │       │
│   │  结果: ✗ AI 可能不知道该调用这个函数             │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   关键原则:                                                  │
│   - 描述要准确,说明函数的具体功能                             │
│   - 描述要详细,包含关键词(如"加法"、"时间"等)                 │
│   - 描述要明确,避免歧义                                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、实现完整的函数调用流程

### 2.1 准备工作

假设我们已经有了以下文件(来自 Step 30):

```
week5-function-calling/
├── functions/
│   ├── getTime.js
│   └── sum.js
└── schemas/
    ├── getTime.schema.js
    └── sum.schema.js
```

### 2.2 创建函数调用主程序

创建 `main.js`:

```javascript
import OpenAI from 'openai'
import { getTime } from './functions/getTime.js'
import { sum } from './functions/sum.js'
import { getTimeSchema } from './schemas/getTime.schema.js'
import { sumSchema } from './schemas/sum.schema.js'

// 初始化 OpenAI 客户端
const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})

// 定义可用的函数映射
const availableFunctions = {
  getTime: getTime,
  sum: sum,
}

/**
 * 主函数:处理用户消息并自动调用函数
 */
async function chat(userMessage) {
  console.log(`\n用户: ${userMessage}\n`)

  // 1. 构建消息数组
  const messages = [
    { role: 'user', content: userMessage },
  ]

  // 2. 调用 AI,传入函数定义
  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: messages,
    functions: [getTimeSchema, sumSchema],  // 告诉 AI 有哪些函数可用
  })

  const assistantMessage = response.choices[0].message
  console.log('AI 返回:', JSON.stringify(assistantMessage, null, 2))

  // 3. 判断 AI 是否要调用函数
  if (assistantMessage.function_call) {
    // AI 决定调用函数
    const functionName = assistantMessage.function_call.name
    const functionArgs = JSON.parse(assistantMessage.function_call.arguments)

    console.log(`\n→ AI 决定调用函数: ${functionName}`)
    console.log(`→ 参数: ${JSON.stringify(functionArgs)}`)

    // 4. 执行真正的函数
    const functionToCall = availableFunctions[functionName]
    const functionResult = functionToCall(...Object.values(functionArgs))

    console.log(`→ 函数执行结果: ${functionResult}\n`)

    // 5. 将函数结果返回给 AI,让 AI 生成自然语言回复
    messages.push(assistantMessage)  // 添加 AI 的函数调用消息
    messages.push({
      role: 'function',
      name: functionName,
      content: String(functionResult),
    })

    // 6. 再次调用 AI,获取最终回复
    const finalResponse = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: messages,
    })

    const finalMessage = finalResponse.choices[0].message.content
    console.log(`AI: ${finalMessage}`)
  } else {
    // AI 直接回复,不需要调用函数
    console.log(`AI: ${assistantMessage.content}`)
  }
}

// 测试
chat('现在几点了?')
```

**代码流程解析**:

```
┌─────────────────────────────────────────────────────────────┐
│              完整函数调用流程                                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Step 1: 构建消息数组                                       │
│   ┌─────────────────────────────────────────────────┐       │
│   │  messages = [                                   │       │
│   │    { role: 'user', content: '现在几点了?' }     │       │
│   │  ]                                              │       │
│   └─────────────────────────────────────────────────┘       │
│                         ↓                                   │
│   Step 2: 调用 AI + 传入函数定义                             │
│   ┌─────────────────────────────────────────────────┐       │
│   │  const response = await client.chat             │       │
│   │    .completions.create({                        │       │
│   │      model: 'deepseek-chat',                    │       │
│   │      messages: messages,                        │       │
│   │      functions: [getTimeSchema, sumSchema]      │       │
│   │    })                                           │       │
│   └─────────────────────────────────────────────────┘       │
│                         ↓                                   │
│   Step 3: AI 返回函数调用指令                                │
│   ┌─────────────────────────────────────────────────┐       │
│   │  {                                              │       │
│   │    function_call: {                             │       │
│   │      name: "getTime",                           │       │
│   │      arguments: "{}"                            │       │
│   │    }                                            │       │
│   │  }                                              │       │
│   └─────────────────────────────────────────────────┘       │
│                         ↓                                   │
│   Step 4: 解析并执行函数                                     │
│   ┌─────────────────────────────────────────────────┐       │
│   │  const functionName = "getTime"                 │       │
│   │  const functionArgs = JSON.parse("{}")          │       │
│   │  const result = getTime()                       │       │
│   │  // "当前时间 (Asia/Shanghai): 2024-01-26 ..."  │       │
│   └─────────────────────────────────────────────────┘       │
│                         ↓                                   │
│   Step 5: 将结果返回给 AI                                    │
│   ┌─────────────────────────────────────────────────┐       │
│   │  messages.push({                                │       │
│   │    role: 'function',                            │       │
│   │    name: 'getTime',                             │       │
│   │    content: '当前时间 (Asia/Shanghai): ...'      │       │
│   │  })                                             │       │
│   └─────────────────────────────────────────────────┘       │
│                         ↓                                   │
│   Step 6: AI 生成自然语言回复                                │
│   ┌─────────────────────────────────────────────────┐       │
│   │  "现在是北京时间 2024 年 1 月 26 日 14:30"       │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 关键代码详解

**1. 解析函数参数**

```javascript
// AI 返回的 arguments 是 JSON 字符串
const arguments = '{"a": 10, "b": 20}'

// 需要解析成对象
const functionArgs = JSON.parse(arguments)  // { a: 10, b: 20 }

// 转换成函数参数数组
const args = Object.values(functionArgs)  // [10, 20]

// 调用函数
const result = sum(...args)  // sum(10, 20)
```

**2. 构建 function 消息**

```javascript
// 函数执行完毕后,需要告诉 AI 结果
messages.push({
  role: 'function',      // ← 注意:role 是 'function'
  name: 'getTime',       // ← 函数名
  content: String(result)  // ← 函数返回值(必须是字符串)
})
```

**3. 第二次调用 AI**

```javascript
// 第一次调用:AI 返回函数调用指令
const response1 = await client.chat.completions.create({
  model: 'deepseek-chat',
  messages: messages,
  functions: [...]
})

// ... 执行函数,添加 function 消息 ...

// 第二次调用:AI 根据函数结果生成自然语言回复
const response2 = await client.chat.completions.create({
  model: 'deepseek-chat',
  messages: messages,  // ← 包含了 function 消息
  // 注意:第二次调用通常不需要再传 functions 参数
})
```

---

## 三、测试不同场景

### 3.1 测试场景 1:查询时间

创建 `test-scenarios.js`:

```javascript
import OpenAI from 'openai'
import { getTime } from './functions/getTime.js'
import { sum } from './functions/sum.js'
import { getTimeSchema } from './schemas/getTime.schema.js'
import { sumSchema } from './schemas/sum.schema.js'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})

const availableFunctions = {
  getTime: getTime,
  sum: sum,
}

async function chat(userMessage) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`用户: ${userMessage}`)
  console.log('='.repeat(60))

  const messages = [{ role: 'user', content: userMessage }]

  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: messages,
    functions: [getTimeSchema, sumSchema],
  })

  const assistantMessage = response.choices[0].message

  if (assistantMessage.function_call) {
    const functionName = assistantMessage.function_call.name
    const functionArgs = JSON.parse(assistantMessage.function_call.arguments)

    console.log(`\n✓ AI 选择调用函数: ${functionName}`)
    console.log(`✓ 参数: ${JSON.stringify(functionArgs)}`)

    const functionToCall = availableFunctions[functionName]
    const functionResult = functionToCall(...Object.values(functionArgs))

    console.log(`✓ 执行结果: ${functionResult}`)

    messages.push(assistantMessage)
    messages.push({
      role: 'function',
      name: functionName,
      content: String(functionResult),
    })

    const finalResponse = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: messages,
    })

    console.log(`\nAI 最终回复: ${finalResponse.choices[0].message.content}\n`)
  } else {
    console.log(`\nAI 直接回复: ${assistantMessage.content}\n`)
  }
}

// 测试场景
(async () => {
  // 场景 1: 查询时间(应该调用 getTime)
  await chat('现在几点了?')

  // 场景 2: 计算(应该调用 sum)
  await chat('帮我算一下 25 加 37 等于多少')

  // 场景 3: 指定时区(应该调用 getTime 并传参数)
  await chat('纽约现在是几点?')

  // 场景 4: 不需要函数(应该直接回复)
  await chat('你好,介绍一下你自己')
})()
```

### 3.2 运行测试

```bash
node test-scenarios.js
```

预期输出:

```
============================================================
用户: 现在几点了?
============================================================

✓ AI 选择调用函数: getTime
✓ 参数: {}
✓ 执行结果: 当前时间 (Asia/Shanghai): 2024-01-26 14:30:45

AI 最终回复: 现在是北京时间 2024 年 1 月 26 日 14 点 30 分 45 秒。

============================================================
用户: 帮我算一下 25 加 37 等于多少
============================================================

✓ AI 选择调用函数: sum
✓ 参数: {"a":25,"b":37}
✓ 执行结果: 62

AI 最终回复: 25 加 37 等于 62。

============================================================
用户: 纽约现在是几点?
============================================================

✓ AI 选择调用函数: getTime
✓ 参数: {"timezone":"America/New_York"}
✓ 执行结果: 当前时间 (America/New_York): 2024-01-26 01:30:45

AI 最终回复: 纽约现在是 2024 年 1 月 26 日凌晨 1 点 30 分 45 秒。

============================================================
用户: 你好,介绍一下你自己
============================================================

AI 直接回复: 你好!我是一个 AI 助手,可以帮助你回答问题、计算数值、查询时间等。有什么我可以帮助你的吗?
```

---

## 四、优化:封装函数执行器

### 4.1 创建通用函数执行器

创建 `utils/functionExecutor.js`:

```javascript
/**
 * 通用函数执行器
 */
export class FunctionExecutor {
  constructor(functions) {
    this.functions = functions  // { functionName: functionImplementation }
  }

  /**
   * 执行函数
   * @param {string} functionName - 函数名
   * @param {string} argumentsJson - 参数 JSON 字符串
   * @returns {any} 函数执行结果
   */
  execute(functionName, argumentsJson) {
    // 1. 检查函数是否存在
    if (!this.functions[functionName]) {
      throw new Error(`函数 ${functionName} 不存在`)
    }

    // 2. 解析参数
    let args
    try {
      args = JSON.parse(argumentsJson)
    } catch (error) {
      throw new Error(`参数解析失败: ${error.message}`)
    }

    // 3. 执行函数
    try {
      const func = this.functions[functionName]
      const result = func(...Object.values(args))
      return result
    } catch (error) {
      throw new Error(`函数执行失败: ${error.message}`)
    }
  }
}
```

### 4.2 使用函数执行器

修改 `main.js`,使用封装好的执行器:

```javascript
import OpenAI from 'openai'
import { getTime } from './functions/getTime.js'
import { sum } from './functions/sum.js'
import { getTimeSchema } from './schemas/getTime.schema.js'
import { sumSchema } from './schemas/sum.schema.js'
import { FunctionExecutor } from './utils/functionExecutor.js'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})

// 创建函数执行器
const executor = new FunctionExecutor({
  getTime: getTime,
  sum: sum,
})

async function chat(userMessage) {
  console.log(`\n用户: ${userMessage}\n`)

  const messages = [{ role: 'user', content: userMessage }]

  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: messages,
    functions: [getTimeSchema, sumSchema],
  })

  const assistantMessage = response.choices[0].message

  if (assistantMessage.function_call) {
    const { name, arguments: args } = assistantMessage.function_call

    console.log(`→ 调用函数: ${name}(${args})`)

    // 使用执行器执行函数
    const result = executor.execute(name, args)

    console.log(`→ 执行结果: ${result}\n`)

    messages.push(assistantMessage)
    messages.push({
      role: 'function',
      name: name,
      content: String(result),
    })

    const finalResponse = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: messages,
    })

    console.log(`AI: ${finalResponse.choices[0].message.content}`)
  } else {
    console.log(`AI: ${assistantMessage.content}`)
  }
}

// 测试
chat('10 加 20 等于多少?')
```

---

## 五、学习检查清单

完成以下所有项目,说明你已掌握本节内容:

### 第一层:概念理解

- [ ] 理解 AI 如何根据函数描述选择函数
- [ ] 理解函数调用的完整流程(两次 API 调用)
- [ ] 知道 function_call.arguments 是 JSON 字符串
- [ ] 理解 role: 'function' 的消息格式

### 第二层:代码实现

- [ ] 能够在 API 请求中传入 functions 参数
- [ ] 能够判断 AI 是否返回了 function_call
- [ ] 能够解析 arguments 并执行函数
- [ ] 能够构建 function 消息并获取最终回复

### 第三层:实际应用

- [ ] 测试了查询时间的场景
- [ ] 测试了计算的场景
- [ ] 测试了不需要函数的场景
- [ ] 封装了通用的函数执行器

---

## 六、常见问题

### Q1: 为什么需要调用 AI 两次?

**答**: 第一次获取函数调用指令,第二次生成自然语言回复:

```javascript
// 第一次:获取函数调用指令
AI: { function_call: { name: "sum", arguments: "{\"a\":10,\"b\":20}" } }

// 执行函数 → 30

// 第二次:生成自然语言回复
AI: "10 加 20 等于 30。"
```

### Q2: 可以跳过第二次调用吗?

**答**: 可以,但不推荐:

```javascript
// 跳过第二次调用,直接返回结果
const result = sum(10, 20)
console.log(`结果: ${result}`)  // "结果: 30"

// 使用第二次调用,AI 生成更友好的回复
// "10 加 20 等于 30,希望对您有帮助!"
```

### Q3: 如果 AI 选错函数怎么办?

**答**: 检查函数描述是否清晰:

```javascript
// ✗ 描述不清晰,AI 可能误判
{
  name: 'process',
  description: '处理数据'
}

// ✓ 描述清晰,AI 准确匹配
{
  name: 'sum',
  description: '计算两个数字的加法和。例如:sum(10, 20) 返回 30'
}
```

---

## 七、下一步学习方向

完成本节后,你已经实现了基础的函数调用。接下来你将:

1. **Step 32**: 调试 function_call → arguments 的 JSON 化
2. **Step 33**: 加入结构化返回(zod 也可以)
3. **Step 34**: 做一个"天气查询"demo
4. **Step 35**: 整理文档

---

**记住: 函数调用的核心是"AI 提供指令,开发者执行函数",两次 API 调用缺一不可。**
