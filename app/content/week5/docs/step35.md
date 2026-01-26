# Step 35: Function Calling｜整理文档

## 学习目标

这个任务的本质是回答一个核心问题:**如何总结 Function Calling 的完整知识体系,并形成可复用的最佳实践**。

通过本教程,你将:

1. 梳理 Function Calling 的完整流程
2. 总结常见问题和解决方案
3. 整理代码模板和最佳实践
4. 构建知识体系和参考文档

---

## 一、Function Calling 完整知识体系

### 1.1 核心概念地图

```
┌─────────────────────────────────────────────────────────────┐
│         Function Calling 知识体系                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   第一层:基础概念                                             │
│   ┌─────────────────────────────────────────────────┐       │
│   │  • Function Schema (函数定义)                   │       │
│   │    - name: 函数名称                              │       │
│   │    - description: 函数描述                       │       │
│   │    - parameters: 参数定义                        │       │
│   │                                                 │       │
│   │  • Function Call (函数调用指令)                  │       │
│   │    - name: 要调用的函数名                        │       │
│   │    - arguments: 参数 JSON 字符串                │       │
│   │                                                 │       │
│   │  • Function Implementation (函数实现)           │       │
│   │    - 真正执行的 JavaScript 函数                 │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   第二层:核心流程                                             │
│   ┌─────────────────────────────────────────────────┐       │
│   │  1. 定义函数 Schema                              │       │
│   │  2. 发送用户消息 + functions 参数                │       │
│   │  3. AI 返回函数调用指令                          │       │
│   │  4. 解析 arguments 并执行函数                    │       │
│   │  5. 将结果返回给 AI                              │       │
│   │  6. AI 生成自然语言回复                          │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   第三层:工程实践                                             │
│   ┌─────────────────────────────────────────────────┐       │
│   │  • 参数验证 (Zod)                                │       │
│   │  • 错误处理                                      │       │
│   │  • 函数执行器封装                                │       │
│   │  • Schema 自动生成                               │       │
│   │  • 多轮对话管理                                  │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 学习路线回顾

```
Step 29: 理解 Function Schema
  ↓
  掌握了如何定义函数描述,让 AI 理解函数的作用

Step 30: 实现最小函数 (getTime / sum)
  ↓
  学会了编写实际可执行的函数,并定义对应的 Schema

Step 31: 自动调用函数
  ↓
  理解了完整的函数调用流程,实现了端到端的调用

Step 32: 调试 arguments JSON 化
  ↓
  掌握了参数解析和验证,处理各种边界情况

Step 33: 使用 Zod 结构化验证
  ↓
  引入类型安全,提升代码质量和可维护性

Step 34: 天气查询 Demo
  ↓
  构建了完整的实际应用,集成所有知识点

Step 35: 整理文档 (当前)
  ↓
  总结最佳实践,形成可复用的知识库
```

---

## 二、Function Calling 最佳实践

### 2.1 Schema 设计原则

```javascript
// ✓ 好的 Schema 设计
{
  name: 'getWeather',  // ← 清晰的动词 + 名词
  description: '获取指定城市的实时天气信息,包括温度、天气状况、湿度、风速和 AQI。支持的城市:北京、上海、深圳等。',  // ← 详细且准确
  parameters: {
    type: 'object',
    properties: {
      city: {
        type: 'string',
        description: '城市名称,支持中文和拼音,例如:北京、beijing',  // ← 说明格式要求
      },
    },
    required: ['city'],  // ← 明确必填参数
  },
}

// ✗ 不好的 Schema 设计
{
  name: 'weather',  // ✗ 不清楚是查询还是设置
  description: '天气',  // ✗ 太简单
  parameters: {
    type: 'object',
    properties: {
      c: {  // ✗ 参数名不清晰
        type: 'string',
        description: '城市',  // ✗ 没有说明格式
      },
    },
    required: [],  // ✗ 没有标记必填参数
  },
}
```

**设计检查清单**:

- [ ] 函数名使用动词开头,清晰表达功能
- [ ] description 详细说明功能、参数格式、支持范围
- [ ] 参数名有意义,不使用缩写
- [ ] 每个参数都有清晰的 description
- [ ] 正确标记 required 参数
- [ ] 使用 enum 限制可选值

### 2.2 函数实现原则

```javascript
// ✓ 好的函数实现
export function getWeather(params) {
  // 1. 参数验证
  const { city } = GetWeatherParamsSchema.parse(params)

  // 2. 业务逻辑
  const weatherData = queryWeatherFromDB(city)

  // 3. 错误处理
  if (!weatherData) {
    throw new Error(`暂不支持查询 ${city} 的天气`)
  }

  // 4. 返回值验证
  return GetWeatherResultSchema.parse(weatherData)
}

// ✗ 不好的函数实现
export function getWeather(city) {  // ✗ 直接接受参数,不验证
  return weatherDB[city]  // ✗ 没有错误处理,可能返回 undefined
}
```

**实现检查清单**:

- [ ] 使用 Zod 验证输入参数
- [ ] 处理所有可能的错误情况
- [ ] 抛出清晰的错误信息
- [ ] 验证返回值格式
- [ ] 编写测试用例

### 2.3 参数解析原则

```javascript
// ✓ 安全的参数解析
function parseArguments(argumentsJson) {
  // 1. 类型检查
  if (typeof argumentsJson !== 'string') {
    throw new Error('arguments must be string')
  }

  // 2. JSON 解析 + 错误处理
  try {
    const args = JSON.parse(argumentsJson)
    return args
  } catch (error) {
    throw new Error(`Invalid JSON: ${argumentsJson}`)
  }
}

// ✗ 不安全的解析
function parseArguments(argumentsJson) {
  return JSON.parse(argumentsJson)  // ✗ 可能抛出异常
}
```

**解析检查清单**:

- [ ] 验证 arguments 是字符串类型
- [ ] 使用 try-catch 包裹 JSON.parse
- [ ] 验证解析结果是对象
- [ ] 验证必填参数存在
- [ ] 验证参数类型正确

### 2.4 错误处理原则

```javascript
// ✓ 完善的错误处理
async function chat(userMessage) {
  try {
    // 1. API 调用错误
    const response = await client.chat.completions.create({...})

    // 2. 函数执行错误
    if (assistantMessage.function_call) {
      try {
        const result = executor.execute(name, args)
      } catch (funcError) {
        // 告诉用户函数执行失败
        console.log(`函数执行失败: ${funcError.message}`)
        // 可以让 AI 尝试其他方案
        return
      }
    }
  } catch (apiError) {
    // API 调用失败
    console.log(`API 调用失败: ${apiError.message}`)
    // 可以重试或提示用户
  }
}
```

**错误处理层级**:

1. **API 调用错误**: 网络问题、鉴权失败等
2. **参数解析错误**: JSON 格式错误、缺少参数等
3. **函数执行错误**: 业务逻辑错误、数据不存在等
4. **返回值验证错误**: 返回数据格式不正确

---

## 三、代码模板

### 3.1 标准函数模板

```javascript
import { z } from 'zod'

// 1. 定义参数 Schema
export const FunctionNameParamsSchema = z.object({
  param1: z.string().describe('参数 1 的描述'),
  param2: z.number().optional().describe('参数 2 的描述 (可选)'),
})

// 2. 定义返回值 Schema
export const FunctionNameResultSchema = z.object({
  // 根据实际返回值定义
})

/**
 * 函数功能描述
 * @param {Object} params - 参数对象
 * @returns {Object} 返回值
 */
export function functionName(params) {
  // 验证参数
  const validatedParams = FunctionNameParamsSchema.parse(params)

  // 执行业务逻辑
  try {
    const result = doSomething(validatedParams)

    // 验证返回值
    return FunctionNameResultSchema.parse(result)
  } catch (error) {
    throw new Error(`函数执行失败: ${error.message}`)
  }
}

// 3. 生成 Function Schema (可选,如果使用 zodToFunctionSchema)
export const functionNameSchema = zodToFunctionSchema(
  'functionName',
  '详细的函数功能描述',
  FunctionNameParamsSchema
)
```

### 3.2 聊天流程模板

```javascript
import OpenAI from 'openai'
import { ZodFunctionExecutor } from './utils/functionExecutor.zod.js'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})

// 注册函数
const executor = new ZodFunctionExecutor({
  functionName: {
    fn: functionImplementation,
    paramsSchema: FunctionParamsSchema,
    resultSchema: FunctionResultSchema,
  },
})

// 定义可用函数列表
const functions = [functionSchema]

// 消息历史
const messages = [
  { role: 'system', content: '系统提示词' },
]

async function chat(userMessage) {
  messages.push({ role: 'user', content: userMessage })

  // 第一次调用 AI
  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: messages,
    functions: functions,
  })

  const assistantMessage = response.choices[0].message

  if (assistantMessage.function_call) {
    const { name, arguments: args } = assistantMessage.function_call

    try {
      // 执行函数
      const result = executor.execute(name, args)

      // 添加消息
      messages.push(assistantMessage)
      messages.push({
        role: 'function',
        name: name,
        content: JSON.stringify(result),
      })

      // 第二次调用 AI
      const finalResponse = await client.chat.completions.create({
        model: 'deepseek-chat',
        messages: messages,
      })

      const finalMessage = finalResponse.choices[0].message
      messages.push(finalMessage)

      console.log(`AI: ${finalMessage.content}`)
    } catch (error) {
      console.log(`错误: ${error.message}`)
    }
  } else {
    messages.push(assistantMessage)
    console.log(`AI: ${assistantMessage.content}`)
  }
}
```

---

## 四、常见问题解决方案

### 4.1 AI 没有调用函数

**问题**: 用户说"查天气",AI 却直接回复而不调用函数

**解决方案**:

```javascript
// 1. 优化 Schema 描述
{
  description: '获取指定城市的实时天气。当用户询问天气、温度、是否下雨等问题时,使用此函数查询。'
}

// 2. 优化系统提示词
{
  role: 'system',
  content: '你是天气助手。当用户询问天气相关问题时,必须调用 getWeather 函数获取实时数据,不要编造信息。'
}

// 3. 强制函数调用 (可选)
const response = await client.chat.completions.create({
  model: 'deepseek-chat',
  messages: messages,
  functions: functions,
  function_call: { name: 'getWeather' },  // ← 强制调用
})
```

### 4.2 AI 提取错误的参数

**问题**: 用户说"帝都天气",AI 提取参数为 `{city: "帝都"}`

**解决方案**:

```javascript
// 方案 1: 在函数中添加城市名修正
const cityAliases = {
  '帝都': '北京',
  '魔都': '上海',
  '鹏城': '深圳',
}

function getWeather(params) {
  let city = params.city
  city = cityAliases[city] || city
  // 继续查询...
}

// 方案 2: 在 Schema 中说明
{
  description: '城市名称,请使用标准名称,如"北京"而不是"帝都"'
}
```

### 4.3 函数返回复杂对象,AI 理解不了

**问题**: 函数返回大量数据,AI 生成的回复不完整

**解决方案**:

```javascript
// 方案 1: 简化返回值
function getWeather(params) {
  const fullData = queryWeather(params.city)

  // 只返回关键信息
  return {
    city: fullData.city,
    temperature: fullData.temperature,
    weather: fullData.weather,
    // 省略不重要的字段
  }
}

// 方案 2: 格式化为文本
function getWeather(params) {
  const data = queryWeather(params.city)

  // 返回格式化的文本,而不是对象
  return `${data.city}当前温度 ${data.temperature}°C,${data.weather},湿度 ${data.humidity}%`
}
```

### 4.4 需要多次调用函数

**问题**: 用户问"北京和上海哪里更热?",需要调用两次 getWeather

**解决方案**:

```javascript
// 方案 1: 修改 Schema 支持数组
{
  parameters: {
    type: 'object',
    properties: {
      cities: {
        type: 'array',
        items: { type: 'string' },
        description: '城市列表'
      }
    }
  }
}

function getWeather(params) {
  const results = params.cities.map(city => queryWeather(city))
  return results
}

// 方案 2: 支持多轮调用
// AI 会自动调用两次 getWeather,分别查询北京和上海
```

---

## 五、项目文件组织

### 5.1 推荐目录结构

```
function-calling-project/
├── functions/              # 函数实现
│   ├── getTime.js
│   ├── sum.js
│   ├── getWeather.js
│   └── index.js           # 统一导出
│
├── schemas/               # Function Schemas
│   ├── getTime.schema.js
│   ├── sum.schema.js
│   ├── getWeather.schema.js
│   └── index.js
│
├── utils/                 # 工具函数
│   ├── functionExecutor.js      # 函数执行器
│   ├── argumentParser.js        # 参数解析器
│   ├── zodToFunctionSchema.js   # Zod 转 Schema
│   └── index.js
│
├── config/                # 配置
│   └── index.js           # API keys 等
│
├── examples/              # 示例代码
│   ├── basicChat.js
│   ├── weatherChat.js
│   └── streamChat.js
│
├── tests/                 # 测试
│   ├── functions.test.js
│   └── executor.test.js
│
├── .env                   # 环境变量
├── .env.example           # 环境变量示例
├── package.json
└── README.md
```

### 5.2 统一导出

`functions/index.js`:

```javascript
export { getTime, GetTimeParamsSchema, GetTimeResultSchema } from './getTime.js'
export { sum, SumParamsSchema, SumResultSchema } from './sum.js'
export { getWeather, GetWeatherParamsSchema, GetWeatherResultSchema } from './getWeather.js'
```

`schemas/index.js`:

```javascript
export { getTimeSchema } from './getTime.schema.js'
export { sumSchema } from './sum.schema.js'
export { getWeatherSchema } from './getWeather.schema.js'

// 统一导出所有 schemas
export const allSchemas = [
  getTimeSchema,
  sumSchema,
  getWeatherSchema,
]
```

---

## 六、学习检查清单

### 完整知识点掌握

- [ ] 理解 Function Calling 的核心概念
- [ ] 掌握 Function Schema 的设计原则
- [ ] 能够实现符合规范的函数
- [ ] 掌握参数解析和验证
- [ ] 能够使用 Zod 进行类型安全
- [ ] 理解完整的函数调用流程
- [ ] 能够处理各种错误情况
- [ ] 能够构建完整的聊天应用

### 工程能力

- [ ] 能够组织清晰的项目结构
- [ ] 能够编写可复用的代码
- [ ] 能够编写单元测试
- [ ] 能够编写清晰的文档

### 实战能力

- [ ] 完成了 getTime / sum 函数
- [ ] 完成了天气查询 Demo
- [ ] 能够对接真实 API (可选)
- [ ] 能够处理实际业务场景

---

## 七、参考资源

### 官方文档

- [OpenAI Function Calling 文档](https://platform.openai.com/docs/guides/function-calling)
- [Zod 官方文档](https://zod.dev/)
- [JSON Schema 规范](https://json-schema.org/)

### 代码示例

- 本周所有 Step 的完整代码
- `examples/` 目录下的示例程序

### 进阶阅读

- Function Calling 的底层原理
- 多函数协作模式
- Agent 架构设计
- Tool Use 的未来发展

---

## 八、下一步方向

### 继续深入

1. **多函数协作**: 让 AI 自动选择调用多个函数完成复杂任务
2. **函数链式调用**: 一个函数的输出作为另一个函数的输入
3. **条件函数调用**: 根据上下文决定是否调用函数
4. **流式函数调用**: 在流式响应中处理函数调用

### 实际应用

1. **智能客服**: 查询订单、修改信息、退款等
2. **数据分析助手**: 查询数据库、生成报表、绘制图表
3. **任务管理系统**: 创建任务、分配任务、更新状态
4. **智能家居控制**: 开关灯、调节温度、查询设备状态

### 架构升级

1. **构建 Agent 框架**: 支持插件式函数注册
2. **函数权限管理**: 不同用户可调用不同函数
3. **函数调用审计**: 记录所有函数调用日志
4. **性能优化**: 函数调用缓存、并发控制

---

## 九、总结

Function Calling 是 LLM 应用开发的核心能力之一,它让 AI 从"只能聊天"升级为"能够执行任务"。

通过本周的学习,你已经掌握了:

1. **理论基础**: Function Schema、调用流程、参数验证
2. **工程实践**: Zod 集成、错误处理、代码组织
3. **实战能力**: 构建完整的天气查询应用

**关键要点回顾**:

- Function Schema 是 AI 理解函数的唯一途径,要写清晰
- arguments 是 JSON 字符串,必须解析和验证
- 函数调用需要两次 API 调用:获取指令 + 生成回复
- Zod 让类型验证变得简单和安全
- 错误处理是函数调用的重要组成部分

**持续学习建议**:

- 阅读优秀开源项目的 Function Calling 实现
- 尝试构建更复杂的多函数协作场景
- 关注 LLM 和 Function Calling 的最新发展
- 在实际项目中应用所学知识

---

**恭喜你完成了 Week 5 的所有学习!你已经具备了构建 AI 函数调用应用的完整能力。**

**继续加油,探索 LLM 应用开发的更多可能性!**
