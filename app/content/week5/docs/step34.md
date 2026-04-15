# Step 34: Function Calling｜基于 AI-backend 的天气查询 Demo

## 学习目标

这个任务的本质是回答一个核心问题:**如何基于 AI-backend 的企业级架构,构建一个完整的 Function Calling 应用**。

通过本教程,你将:

1. 基于 AI-backend 架构实现天气查询功能
2. 应用前面学习的所有知识:Adapter、Validator、Executor、Zod
3. 构建完整的多轮对话流程
4. 实现生产级的错误处理和日志记录
5. 理解如何在真实项目中集成 Function Calling

> **实战项目**: 本教程将在 AI-backend 的基础上构建完整的天气查询应用,展示企业级的最佳实践。

---

## 一、项目架构

### 1.1 在 AI-backend 中的位置

```
AI-backend/
├── functions/                    # 函数实现
│   ├── getTime.js               # ✓ 已有
│   ├── sum.js                   # ✓ 已有
│   └── getWeather.js            # ← 新增 (本节实现)
│
├── schemas/                      # Function Schema
│   ├── getTime.schema.js        # ✓ 已有
│   ├── sum.schema.js            # ✓ 已有
│   └── getWeather.schema.js     # ← 新增
│
├── src/
│   ├── controllers/
│   │   └── chat.controller.js   # ✓ 已支持 Function Calling
│   ├── services/
│   │   └── ai.service.js        # ✓ 已支持 tools 参数
│   ├── adapters/
│   │   ├── deepseek.adapter.js  # ✓ 已支持 tools
│   │   └── openai.adapter.js    # ✓ 已支持 tools
│   ├── utils/
│   │   ├── functionExecutor.js  # ✓ 已实现
│   │   └── logger.js            # ✓ 完整日志
│   └── validators/
│       └── chatValidator.js     # ✓ 已支持 tools 验证
│
└── server.js                     # 应用入口

完整的 Function Calling 基础架构已就绪
只需添加新函数即可扩展功能!
```

### 1.2 完整的请求流程

```
┌─────────────────────────────────────────────────────────────┐
│     AI-backend 天气查询完整流程                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   1. 用户请求                                                │
│      POST /api/chat                                         │
│      {                                                      │
│        messages: [{ role: "user", content: "北京天气?" }],  │
│        tools: [{ type: "function", function: getWeatherSchema }] │
│      }                                                      │
│      ↓                                                      │
│   2. ChatController.chat()                                  │
│      - validateChatRequest() [Joi 验证]                    │
│      - 调用 aiService.chat()                                │
│      ↓                                                      │
│   3. AIService.chat()                                       │
│      - 获取 provider (deepseek/openai)                      │
│      - factory.get(provider)                               │
│      - adapter.chat(messages, { tools })                   │
│      ↓                                                      │
│   4. DeepSeekAdapter.chat()                                 │
│      - 格式化 messages                                       │
│      - 调用 DeepSeek API                                     │
│      - 格式化响应                                            │
│      ↓                                                      │
│   5. AI 返回 tool_calls                                     │
│      {                                                      │
│        tool_calls: [{                                      │
│          id: "call_abc123",                                │
│          type: "function",                                 │
│          function: {                                       │
│            name: "getWeather",                             │
│            arguments: '{"city":"北京"}'                     │
│          }                                                 │
│        }]                                                  │
│      }                                                      │
│      ↓                                                      │
│   6. ChatController 解析并执行                               │
│      - functionExecutor.execute("getWeather", args)        │
│      - [Zod 验证参数]                                        │
│      - 执行函数 → 返回天气数据                               │
│      ↓                                                      │
│   7. 添加 tool 消息,再次调用 AI                              │
│      messages.push({ role: "assistant", content: null,    │
│        tool_calls: result.tool_calls })                    │
│      messages.push({                                       │
│        role: "tool",                                       │
│        tool_call_id: "call_abc123",                        │
│        content: JSON.stringify(weatherData)                │
│      })                                                    │
│      ↓                                                      │
│   8. AI 生成最终回复                                         │
│      "北京今天天气晴朗,温度15°C,适合外出..."                 │
│      ↓                                                      │
│   9. 返回给用户                                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、实现天气查询函数

### 2.1 创建函数实现 (带 Zod 验证)

**文件路径**: `/Users/jianglin/Desktop/backend/AI-backend/functions/getWeather.js`

```javascript
import { z } from 'zod'

// ========== 模拟天气数据库 ==========
const weatherDatabase = {
  北京: {
    city: '北京',
    temperature: 15,
    weather: '晴天',
    humidity: 45,
    windSpeed: 12,
    aqi: 85,
    updateTime: '2024-01-27 14:00:00',
  },
  上海: {
    city: '上海',
    temperature: 20,
    weather: '多云',
    humidity: 65,
    windSpeed: 8,
    aqi: 65,
    updateTime: '2024-01-27 14:00:00',
  },
  深圳: {
    city: '深圳',
    temperature: 28,
    weather: '阴天',
    humidity: 80,
    windSpeed: 15,
    aqi: 45,
    updateTime: '2024-01-27 14:00:00',
  },
  广州: {
    city: '广州',
    temperature: 27,
    weather: '小雨',
    humidity: 75,
    windSpeed: 10,
    aqi: 55,
    updateTime: '2024-01-27 14:00:00',
  },
  杭州: {
    city: '杭州',
    temperature: 18,
    weather: '晴天',
    humidity: 55,
    windSpeed: 6,
    aqi: 70,
    updateTime: '2024-01-27 14:00:00',
  },
}

// 城市名称映射 (支持多种表达方式)
const cityNameMap = {
  // 英文
  beijing: '北京',
  shanghai: '上海',
  shenzhen: '深圳',
  guangzhou: '广州',
  hangzhou: '杭州',
  // 别名
  帝都: '北京',
  魔都: '上海',
  鹏城: '深圳',
}

// ========== Zod Schema 定义 ==========

// 参数 Schema
export const GetWeatherParamsSchema = z.object({
  city: z.string()
    .min(1, '城市名称不能为空')
    .max(20, '城市名称过长')
    .describe('城市名称,例如: 北京、上海、深圳'),
})

// 返回值 Schema
export const GetWeatherResultSchema = z.object({
  city: z.string(),
  temperature: z.number(),
  weather: z.string(),
  humidity: z.number().min(0).max(100),
  windSpeed: z.number().min(0),
  aqi: z.number().min(0).max(500),
  updateTime: z.string(),
})

// ========== 函数实现 ==========

/**
 * 获取指定城市的天气信息
 * @param {Object} params - 参数对象
 * @returns {Object} 天气信息
 */
export function getWeather(params) {
  // 1. Zod 验证参数
  const { city } = GetWeatherParamsSchema.parse(params)

  // 2. 标准化城市名称
  const normalizedCity = cityNameMap[city.toLowerCase()] || city

  // 3. 查询天气数据
  const weatherData = weatherDatabase[normalizedCity]

  if (!weatherData) {
    const supportedCities = Object.keys(weatherDatabase).join('、')
    throw new Error(
      `暂不支持查询 ${city} 的天气信息。` +
      `目前支持的城市: ${supportedCities}`
    )
  }

  // 4. 验证返回值
  return GetWeatherResultSchema.parse(weatherData)
}

// ========== 自测试 ==========
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('=== 测试 getWeather 函数 ===\n')

  console.log('测试 1: 查询北京天气')
  console.log(getWeather({ city: '北京' }))

  console.log('\n测试 2: 查询上海天气 (英文)')
  console.log(getWeather({ city: 'shanghai' }))

  console.log('\n测试 3: 查询深圳天气 (别名)')
  console.log(getWeather({ city: '鹏城' }))

  console.log('\n测试 4: 查询不支持的城市')
  try {
    getWeather({ city: '火星' })
  } catch (error) {
    console.log('错误捕获:', error.message)
  }

  console.log('\n测试 5: 空城市名')
  try {
    getWeather({ city: '' })
  } catch (error) {
    console.log('错误捕获:', error.issues[0].message)
  }
}
```

### 2.2 创建 Function Schema

**文件路径**: `/Users/jianglin/Desktop/backend/AI-backend/schemas/getWeather.schema.js`

```javascript
export const getWeatherSchema = {
  name: 'getWeather',
  description: '获取指定城市的实时天气信息,包括温度、天气状况、湿度、风速和空气质量指数(AQI)。支持的城市:北京、上海、深圳、广州、杭州。',
  parameters: {
    type: 'object',
    properties: {
      city: {
        type: 'string',
        description: '城市名称,支持中文(如"北京")、英文(如"beijing")和别名(如"帝都")',
        examples: ['北京', '上海', '深圳', 'beijing', 'shanghai'],
      },
    },
    required: ['city'],
  },
}

// 也可以从 Zod Schema 自动生成
import { GetWeatherParamsSchema } from '../functions/getWeather.js'

// 如果使用 zodToFunctionSchema (见 Step 33)
// export const getWeatherSchema = zodToFunctionSchema(
//   'getWeather',
//   '获取指定城市的实时天气信息...',
//   GetWeatherParamsSchema
// )
```

---

## 三、注册函数到执行器

### 3.1 更新函数注册配置

**文件路径**: `/Users/jianglin/Desktop/backend/AI-backend/src/config/functions.js`

```javascript
import functionExecutor from '../utils/functionExecutor.js'
import { getTime } from '../../functions/getTime.js'
import { sum } from '../../functions/sum.js'
import { getWeather } from '../../functions/getWeather.js'  // ← 新增

/**
 * 初始化函数执行器
 * 注册所有可用函数
 */
export function initFunctions() {
  // 注册现有函数
  functionExecutor.register('getTime', (args) => {
    return getTime(args.timezone)
  })

  functionExecutor.register('sum', (args) => {
    return sum(args.a, args.b)
  })

  // 注册天气查询函数
  functionExecutor.register('getWeather', (args) => {
    return getWeather(args)  // ← 新增
  })

  console.log(`✓ Registered functions: ${functionExecutor.list().join(', ')}`)
}
```

### 3.2 在应用启动时初始化

**文件路径**: `/Users/jianglin/Desktop/backend/AI-backend/server.js`

```javascript
import app from './src/app.js'
import config from './src/config/index.js'
import logger from './src/utils/logger.js'
import { initFunctions } from './src/config/functions.js'  // ← 确保导入

const PORT = config.port

// 初始化函数执行器
initFunctions()  // ← 确保调用

const server = app.listen(PORT, () => {
  logger.info(`Server is running on http://localhost:${PORT}`)
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`)
  console.log(`🚀 Server ready at http://localhost:${PORT}`)
})

process.on('SIGABRT', () => {
  logger.info('SIGABRT signal received: closing HTTP server')
  server.close(() => {
    logger.info('HTTP server closed')
  })
})
```

---

## 四、测试天气查询

### 4.1 HTTP 测试

创建 `test-weather.http`:

```http
### 测试 1: 查询单个城市天气
POST http://localhost:3000/api/chat
Content-Type: application/json

{
  "messages": [
    { "role": "user", "content": "北京今天天气怎么样?" }
  ],
  "provider": "deepseek",
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "getWeather",
        "description": "获取指定城市的实时天气信息",
        "parameters": {
          "type": "object",
          "properties": {
            "city": {
              "type": "string",
              "description": "城市名称"
            }
          },
          "required": ["city"]
        }
      }
    }
  ]
}

### 测试 2: 比较多个城市天气
POST http://localhost:3000/api/chat
Content-Type: application/json

{
  "messages": [
    { "role": "user", "content": "上海和深圳哪里更热?" }
  ],
  "provider": "deepseek",
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "getWeather",
        "description": "获取指定城市的实时天气信息",
        "parameters": {
          "type": "object",
          "properties": {
            "city": { "type": "string" }
          },
          "required": ["city"]
        }
      }
    }
  ]
}

### 测试 3: 不支持的城市
POST http://localhost:3000/api/chat
Content-Type: application/json

{
  "messages": [
    { "role": "user", "content": "火星的天气如何?" }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "getWeather",
        "description": "获取指定城市的实时天气信息",
        "parameters": {
          "type": "object",
          "properties": {
            "city": { "type": "string" }
          },
          "required": ["city"]
        }
      }
    }
  ]
}
```

### 4.2 预期响应

**测试 1 的完整流程**:

```json
// 1. AI 调用 tool (getWeather),执行后返回最终结果
{
  "status": "success",
  "data": {
    "content": "北京今天天气晴朗,温度为 15°C,湿度 45%,风速 12 km/h,空气质量指数为 85(良好)。是个适合外出的好天气!"
  }
}

// 日志输出 (logger 记录)
[2024-01-27 14:30:00] INFO: Chat request validated
[2024-01-27 14:30:01] INFO: AI requested function call { name: 'getWeather', args: '{"city":"北京"}' }
[2024-01-27 14:30:01] INFO: Function getWeather executed successfully
[2024-01-27 14:30:02] INFO: Final response generated
```

---

## 五、构建交互式命令行工具 (可选)

### 5.1 创建 CLI 工具

**文件路径**: `/Users/jianglin/Desktop/backend/AI-backend/cli-weather-chat.js`

```javascript
import OpenAI from 'openai'
import readline from 'readline'
import config from './src/config/index.js'
import { getWeather } from './functions/getWeather.js'
import { getWeatherSchema } from './schemas/getWeather.schema.js'

// 初始化 OpenAI 客户端
const client = new OpenAI({
  apiKey: config.ai.deepseek.apiKey,
  baseURL: config.ai.deepseek.baseURL,
})

// 消息历史
const messages = [
  {
    role: 'system',
    content: '你是一个友好的天气助手,可以帮用户查询天气信息。当用户询问天气时,调用 getWeather 函数获取数据,然后用自然语言回复。提供天气建议(如是否需要带伞、防晒等)。',
  },
]

/**
 * 处理用户消息
 */
async function chat(userMessage) {
  // 添加用户消息
  messages.push({
    role: 'user',
    content: userMessage,
  })

  console.log(`\n用户: ${userMessage}`)

  try {
    // 第一次调用 AI
    const response = await client.chat.completions.create({
      model: config.ai.deepseek.model,
      messages: messages,
      tools: [{ type: 'function', function: getWeatherSchema }],
      tool_choice: 'auto',
    })

    const assistantMessage = response.choices[0].message

    // 判断是否需要调用函数
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      const toolCall = assistantMessage.tool_calls[0]
      const name = toolCall.function.name
      const args = toolCall.function.arguments

      console.log(`\n→ AI 决定调用函数: ${name}`)
      console.log(`→ 参数: ${args}`)

      try {
        // 执行函数
        const params = JSON.parse(args)
        const result = getWeather(params)
        console.log(`→ 执行结果:`, result)

        // 添加 AI 的 tool_calls 消息
        messages.push(assistantMessage)

        // 添加函数执行结果 (role: "tool", 携带 tool_call_id)
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result, null, 2),
        })

        // 再次调用 AI,获取最终回复
        const finalResponse = await client.chat.completions.create({
          model: config.ai.deepseek.model,
          messages: messages,
        })

        const finalMessage = finalResponse.choices[0].message
        messages.push(finalMessage)

        console.log(`\nAI: ${finalMessage.content}`)
      } catch (error) {
        console.log(`\n✗ 函数执行失败: ${error.message}`)

        // 告诉 AI 函数执行失败
        messages.push(assistantMessage)
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: error.message }),
        })

        // 让 AI 生成错误回复
        const errorResponse = await client.chat.completions.create({
          model: config.ai.deepseek.model,
          messages: messages,
        })

        const errorMessage = errorResponse.choices[0].message
        messages.push(errorMessage)

        console.log(`\nAI: ${errorMessage.content}`)
      }
    } else {
      // 直接回复,不需要调用函数
      messages.push(assistantMessage)
      console.log(`\nAI: ${assistantMessage.content}`)
    }
  } catch (error) {
    console.log(`\n✗ 错误: ${error.message}`)
  }
}

/**
 * 交互式聊天
 */
async function startChat() {
  console.log('╔════════════════════════════════════════════════╗')
  console.log('║   AI-backend 天气查询助手 (输入 exit 退出)      ║')
  console.log('╚════════════════════════════════════════════════╝')

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const askQuestion = () => {
    rl.question('\n你: ', async input => {
      const userInput = input.trim()

      if (userInput === 'exit' || userInput === '退出') {
        console.log('\n再见!')
        rl.close()
        return
      }

      if (!userInput) {
        askQuestion()
        return
      }

      await chat(userInput)
      askQuestion()
    })
  }

  askQuestion()
}

// 启动聊天
startChat()
```

### 5.2 运行 CLI 工具

```bash
# 进入 AI-backend 项目
cd /Users/jianglin/Desktop/backend/AI-backend

# 运行 CLI 工具
node cli-weather-chat.js
```

**预期交互**:

```
╔════════════════════════════════════════════════╗
║   AI-backend 天气查询助手 (输入 exit 退出)      ║
╚════════════════════════════════════════════════╝

你: 北京今天天气怎么样?

用户: 北京今天天气怎么样?

→ AI 决定调用函数: getWeather
→ 参数: {"city":"北京"}
→ 执行结果: {
  city: '北京',
  temperature: 15,
  weather: '晴天',
  humidity: 45,
  windSpeed: 12,
  aqi: 85,
  updateTime: '2024-01-27 14:00:00'
}

AI: 北京今天天气晴朗,温度为 15°C,湿度 45%,风速 12 km/h,空气质量指数为 85,属于良好水平。是个适合外出的好天气!建议做好防晒措施。

你: 上海和深圳哪里更热?

用户: 上海和深圳哪里更热?

→ AI 决定调用函数: getWeather
→ 参数: {"city":"上海"}
→ 执行结果: { city: '上海', temperature: 20, ... }

→ AI 决定调用函数: getWeather
→ 参数: {"city":"深圳"}
→ 执行结果: { city: '深圳', temperature: 28, ... }

AI: 深圳比上海更热。深圳目前温度为 28°C,而上海为 20°C。深圳的湿度也更高,达到 80%,体感可能会更闷热一些。如果去深圳,建议穿轻薄透气的衣物并多补充水分。
```

---

## 六、增强功能 (可选)

### 6.1 添加天气建议功能

```javascript
// functions/getWeatherAdvice.js
import { z } from 'zod'

const GetWeatherAdviceParamsSchema = z.object({
  temperature: z.number(),
  weather: z.string(),
  aqi: z.number(),
})

export function getWeatherAdvice(params) {
  const { temperature, weather, aqi } = GetWeatherAdviceParamsSchema.parse(params)

  const advice = []

  // 温度建议
  if (temperature < 5) {
    advice.push('气温较低,注意保暖,建议穿羽绒服')
  } else if (temperature > 30) {
    advice.push('天气炎热,注意防暑,多喝水,避免长时间户外活动')
  }

  // 天气建议
  if (weather.includes('雨')) {
    advice.push('有降雨,记得带伞')
  } else if (weather === '晴天') {
    advice.push('天气晴朗,适合外出,但要注意防晒')
  }

  // 空气质量建议
  if (aqi > 150) {
    advice.push('空气质量较差,建议减少户外活动,外出时戴口罩')
  } else if (aqi > 100) {
    advice.push('空气质量一般,敏感人群注意防护')
  }

  return advice.length > 0 ? advice : ['天气不错,适合外出活动']
}
```

### 6.2 对接真实天气 API

```javascript
// functions/getWeather.real.js
import fetch from 'node-fetch'

/**
 * 调用真实天气 API (和风天气示例)
 */
async function getWeatherFromAPI(city) {
  const apiKey = process.env.WEATHER_API_KEY
  const baseUrl = 'https://devapi.qweather.com/v7/weather/now'

  // 1. 城市 ID 映射 (简化处理)
  const cityIdMap = {
    北京: '101010100',
    上海: '101020100',
    深圳: '101280601',
    广州: '101280101',
    杭州: '101210101',
  }

  const locationId = cityIdMap[city]
  if (!locationId) {
    throw new Error(`不支持的城市: ${city}`)
  }

  // 2. 查询天气
  const url = `${baseUrl}?location=${locationId}&key=${apiKey}`
  const response = await fetch(url)
  const data = await response.json()

  if (data.code !== '200') {
    throw new Error(`天气查询失败: ${data.code}`)
  }

  // 3. 格式化数据
  return {
    city: city,
    temperature: parseInt(data.now.temp),
    weather: data.now.text,
    humidity: parseInt(data.now.humidity),
    windSpeed: parseInt(data.now.windSpeed),
    aqi: 0,  // 需要单独调用 Air API
    updateTime: data.updateTime,
  }
}
```

---

## 七、完整的架构总结

### 7.1 AI-backend 的优势

```
┌─────────────────────────────────────────────────────────────┐
│     为什么 AI-backend 适合构建 Function Calling 应用?           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   1. 清晰的职责分离                                          │
│      Controller → Service → Adapter → Executor → Function  │
│      每一层都有明确的职责,易于维护和扩展                      │
│                                                             │
│   2. 统一的错误处理                                          │
│      ApiError 体系 → 统一的 HTTP 状态码                     │
│      函数执行错误 → BadRequestError                          │
│      AI 服务错误 → AIServiceError                           │
│                                                             │
│   3. 完整的日志记录                                          │
│      Winston + DailyRotate → 每个环节都有日志               │
│      便于调试和问题定位                                       │
│                                                             │
│   4. 多 Provider 支持                                       │
│      Adapter Pattern → 轻松切换 AI 提供商                   │
│      Factory Pattern → 动态注册新 Provider                  │
│                                                             │
│   5. 多层验证防御                                            │
│      Layer 1 (Joi) → HTTP 请求验证                          │
│      Layer 2 → JSON 解析和业务验证                           │
│      Layer 3 (Zod) → 函数参数验证                           │
│                                                             │
│   6. 易于扩展                                                │
│      添加新函数: 只需 3 步                                   │
│      - 实现函数 (functions/newFunc.js)                      │
│      - 定义 Schema (schemas/newFunc.schema.js)             │
│      - 注册到 Executor (config/functions.js)               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 关键设计模式总结

| 设计模式 | 应用位置 | 作用 |
|---------|---------|------|
| **Adapter Pattern** | src/adapters/ | 统一不同 AI Provider 的接口 |
| **Factory Pattern** | src/services/adapterFactory.js | 动态创建 Adapter 实例 |
| **Singleton Pattern** | functionExecutor, logger | 全局唯一实例 |
| **Middleware Pattern** | src/middlewares/ | 请求处理管道 |
| **Strategy Pattern** | functions/ | 不同函数实现不同策略 |

---

## 八、学习检查清单

### 第一层:功能实现

- [ ] 实现了完整的 getWeather 函数
- [ ] 创建了对应的 Function Schema
- [ ] 注册到了 FunctionExecutor
- [ ] 测试了基本功能

### 第二层:架构理解

- [ ] 理解 AI-backend 的完整请求流程
- [ ] 知道每一层的职责
- [ ] 理解错误处理机制
- [ ] 掌握日志记录的作用

### 第三层:扩展能力

- [ ] 能够添加新的函数
- [ ] 能够实现多轮对话
- [ ] 能够处理复杂场景
- [ ] 理解如何对接真实 API

---

## 九、实践作业

### 作业 1: 添加历史天气查询

实现 `getHistoricalWeather` 函数:
- 参数: `city` (城市), `date` (日期)
- 返回: 指定日期的天气信息
- 集成到 AI-backend

### 作业 2: 实现天气预警系统

实现 `getWeatherAlert` 函数:
- 参数: `city` (城市)
- 返回: 当前的天气预警信息(台风、暴雨等)
- 需要适当的错误处理

### 作业 3: 添加多城市对比

增强 `getWeather` 函数:
- 支持一次查询多个城市
- 返回对比结果
- 提供建议

---

## 十、常见问题

### Q1: 如何处理 AI 多次调用同一个函数?

**答**: AI-backend 的多轮对话机制已支持:

```javascript
// Controller 中的 while 循环可以处理多次函数调用
while (result.tool_calls && result.tool_calls.length > 0) {
  // 执行函数
  // 添加到 messages
  // 再次调用 AI
  result = await aiService.chat(messages, options)
}
```

### Q2: 如何限制函数调用次数防止死循环?

**答**: 添加计数器:

```javascript
let toolCallCount = 0
const MAX_TOOL_CALLS = 5

while (result.tool_calls && result.tool_calls.length > 0 && toolCallCount < MAX_TOOL_CALLS) {
  toolCallCount++
  // ... 执行函数
}

if (toolCallCount >= MAX_TOOL_CALLS) {
  logger.warn('Tool call limit reached')
  throw new Error('函数调用次数过多')
}
```

### Q3: 如何处理函数执行超时?

**答**: 使用 Promise.race:

```javascript
const timeout = (ms) => new Promise((_, reject) =>
  setTimeout(() => reject(new Error('Function execution timeout')), ms)
)

const result = await Promise.race([
  functionExecutor.execute(name, args),
  timeout(5000)  // 5 秒超时
])
```

---

## 十一、下一步

完成本节后,你已经构建了完整的 Function Calling 应用。接下来:

1. **Step 35**: 总结企业级最佳实践,整理完整的开发规范

---

**记住: 真实项目的关键是细节处理。AI-backend 提供了完整的企业级架构,让你专注于业务逻辑,而不是重复造轮子。**
