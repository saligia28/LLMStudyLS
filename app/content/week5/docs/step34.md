# Step 34: Function Calling｜做一个"天气查询"demo

## 学习目标

这个任务的本质是回答一个核心问题:**如何结合前面所学的知识,构建一个完整的 Function Calling 应用**。

通过本教程,你将:

1. 实现一个真实的天气查询功能
2. 集成 AI 函数调用流程
3. 处理多轮对话和上下文
4. 构建用户友好的交互界面
5. 完成端到端的 Function Calling 应用

---

## 一、项目概览

### 1.1 功能需求

```
┌─────────────────────────────────────────────────────────────┐
│              天气查询 Demo 功能                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   用户输入:                                                  │
│   - "北京今天天气怎么样?"                                     │
│   - "上海会下雨吗?"                                          │
│   - "深圳和广州哪里更热?"                                    │
│                                                             │
│   系统行为:                                                  │
│   1. AI 理解用户意图,提取城市名称                             │
│   2. AI 决定调用 getWeather 函数                             │
│   3. 系统执行真实的天气查询                                   │
│   4. AI 将结果用自然语言返回给用户                            │
│                                                             │
│   特性:                                                      │
│   ✓ 支持多个城市查询                                         │
│   ✓ 支持中文和英文城市名                                      │
│   ✓ 返回温度、天气状况、湿度等信息                            │
│   ✓ 友好的对话式交互                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 技术栈

- **AI SDK**: OpenAI SDK (兼容 DeepSeek)
- **验证库**: Zod
- **天气 API**: 模拟数据 (可替换为真实 API)
- **运行时**: Node.js

---

## 二、实现天气查询函数

### 2.1 模拟天气数据

创建 `functions/getWeather.js`:

```javascript
import { z } from 'zod'

// 模拟天气数据库
const weatherDatabase = {
  北京: {
    city: '北京',
    temperature: 15,
    weather: '晴天',
    humidity: 45,
    windSpeed: 12,
    aqi: 85,
  },
  上海: {
    city: '上海',
    temperature: 20,
    weather: '多云',
    humidity: 65,
    windSpeed: 8,
    aqi: 65,
  },
  深圳: {
    city: '深圳',
    temperature: 28,
    weather: '阴天',
    humidity: 80,
    windSpeed: 15,
    aqi: 45,
  },
  广州: {
    city: '广州',
    temperature: 27,
    weather: '小雨',
    humidity: 75,
    windSpeed: 10,
    aqi: 55,
  },
  杭州: {
    city: '杭州',
    temperature: 18,
    weather: '晴天',
    humidity: 55,
    windSpeed: 6,
    aqi: 70,
  },
}

// 城市名称映射 (支持英文)
const cityNameMap = {
  beijing: '北京',
  shanghai: '上海',
  shenzhen: '深圳',
  guangzhou: '广州',
  hangzhou: '杭州',
}

// 定义参数 Schema
export const GetWeatherParamsSchema = z.object({
  city: z.string().describe('城市名称,例如: 北京、上海、深圳'),
})

// 定义返回值 Schema
export const GetWeatherResultSchema = z.object({
  city: z.string(),
  temperature: z.number(),
  weather: z.string(),
  humidity: z.number(),
  windSpeed: z.number(),
  aqi: z.number(),
})

/**
 * 获取指定城市的天气信息
 * @param {Object} params - 参数对象
 * @returns {Object} 天气信息
 */
export function getWeather(params) {
  // 验证参数
  const { city } = GetWeatherParamsSchema.parse(params)

  // 标准化城市名称
  const normalizedCity = cityNameMap[city.toLowerCase()] || city

  // 查询天气数据
  const weatherData = weatherDatabase[normalizedCity]

  if (!weatherData) {
    throw new Error(`暂不支持查询 ${city} 的天气信息`)
  }

  // 验证返回值
  return GetWeatherResultSchema.parse(weatherData)
}

// 测试
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('测试 1: 查询北京天气')
  console.log(getWeather({ city: '北京' }))

  console.log('\n测试 2: 查询上海天气 (英文)')
  console.log(getWeather({ city: 'shanghai' }))

  console.log('\n测试 3: 查询不支持的城市')
  try {
    getWeather({ city: '火星' })
  } catch (error) {
    console.log('错误:', error.message)
  }
}
```

### 2.2 生成 Function Schema

创建 `schemas/getWeather.schema.js`:

```javascript
import { GetWeatherParamsSchema } from '../functions/getWeather.js'
import { zodToFunctionSchema } from '../utils/zodToFunctionSchema.js'

export const getWeatherSchema = zodToFunctionSchema(
  'getWeather',
  '获取指定城市的实时天气信息,包括温度、天气状况、湿度、风速和空气质量指数(AQI)。支持的城市:北京、上海、深圳、广州、杭州。',
  GetWeatherParamsSchema
)

// 验证生成的 Schema
console.log(JSON.stringify(getWeatherSchema, null, 2))
```

---

## 三、实现完整的聊天流程

### 3.1 创建聊天助手

创建 `weatherChat.js`:

```javascript
import OpenAI from 'openai'
import { getWeather, GetWeatherParamsSchema, GetWeatherResultSchema } from './functions/getWeather.js'
import { getWeatherSchema } from './schemas/getWeather.schema.js'
import { ZodFunctionExecutor } from './utils/functionExecutor.zod.js'
import readline from 'readline'

// 初始化 OpenAI 客户端
const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})

// 创建函数执行器
const executor = new ZodFunctionExecutor({
  getWeather: {
    fn: getWeather,
    paramsSchema: GetWeatherParamsSchema,
    resultSchema: GetWeatherResultSchema,
  },
})

// 消息历史
const messages = [
  {
    role: 'system',
    content: '你是一个友好的天气助手,可以帮用户查询天气信息。当用户询问天气时,调用 getWeather 函数获取数据,然后用自然语言回复。',
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

  // 调用 AI
  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: messages,
    functions: [getWeatherSchema],
  })

  const assistantMessage = response.choices[0].message

  // 判断是否需要调用函数
  if (assistantMessage.function_call) {
    const { name, arguments: args } = assistantMessage.function_call

    console.log(`\n→ AI 决定调用函数: ${name}`)
    console.log(`→ 参数: ${args}`)

    try {
      // 执行函数
      const result = executor.execute(name, args)
      console.log(`→ 执行结果:`, result)

      // 添加 AI 的函数调用消息
      messages.push(assistantMessage)

      // 添加函数执行结果
      messages.push({
        role: 'function',
        name: name,
        content: JSON.stringify(result, null, 2),
      })

      // 再次调用 AI,获取最终回复
      const finalResponse = await client.chat.completions.create({
        model: 'deepseek-chat',
        messages: messages,
      })

      const finalMessage = finalResponse.choices[0].message
      messages.push(finalMessage)

      console.log(`\nAI: ${finalMessage.content}`)
    } catch (error) {
      console.log(`\n✗ 函数执行失败: ${error.message}`)
      messages.push({
        role: 'assistant',
        content: `抱歉,查询天气时出现错误: ${error.message}`,
      })
    }
  } else {
    // 直接回复,不需要调用函数
    messages.push(assistantMessage)
    console.log(`\nAI: ${assistantMessage.content}`)
  }
}

/**
 * 交互式聊天
 */
async function startChat() {
  console.log('╔════════════════════════════════════════════════╗')
  console.log('║       欢迎使用天气查询助手 (输入 exit 退出)        ║')
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

      try {
        await chat(userInput)
      } catch (error) {
        console.log(`\n✗ 错误: ${error.message}`)
      }

      askQuestion()
    })
  }

  askQuestion()
}

// 启动聊天
startChat()
```

### 3.2 运行测试

```bash
node weatherChat.js
```

预期交互:

```
╔════════════════════════════════════════════════╗
║       欢迎使用天气查询助手 (输入 exit 退出)        ║
╚════════════════════════════════════════════════╝

你: 北京今天天气怎么样?

用户: 北京今天天气怎么样?

→ AI 决定调用函数: getWeather
→ 参数: {"city":"北京"}
✓ 参数验证通过: { city: '北京' }
✓ 函数执行成功: {
  city: '北京',
  temperature: 15,
  weather: '晴天',
  humidity: 45,
  windSpeed: 12,
  aqi: 85
}
✓ 返回值验证通过

AI: 北京今天天气晴朗,温度为 15°C,湿度 45%,风速 12 km/h,空气质量指数为 85,属于良好水平。是个适合外出的好天气!

你: 上海和深圳哪里更热?

用户: 上海和深圳哪里更热?

→ AI 决定调用函数: getWeather
→ 参数: {"city":"上海"}
✓ 参数验证通过: { city: '上海' }
✓ 函数执行成功: { city: '上海', temperature: 20, ... }

→ AI 决定调用函数: getWeather
→ 参数: {"city":"深圳"}
✓ 参数验证通过: { city: '深圳' }
✓ 函数执行成功: { city: '深圳', temperature: 28, ... }

AI: 深圳比上海更热。深圳目前温度为 28°C,而上海为 20°C。深圳的湿度也更高,达到 80%,体感可能会更闷热一些。
```

---

## 四、增强功能

### 4.1 添加更多函数:获取天气趋势

创建 `functions/getWeatherTrend.js`:

```javascript
import { z } from 'zod'

export const GetWeatherTrendParamsSchema = z.object({
  city: z.string().describe('城市名称'),
  days: z.number().int().min(1).max(7).default(3).describe('未来天数,1-7 天'),
})

export const GetWeatherTrendResultSchema = z.array(
  z.object({
    date: z.string(),
    temperature: z.number(),
    weather: z.string(),
  })
)

export function getWeatherTrend(params) {
  const { city, days } = GetWeatherTrendParamsSchema.parse(params)

  // 模拟未来几天的天气趋势
  const trend = []
  const baseTemp = Math.floor(Math.random() * 10) + 15

  for (let i = 0; i < days; i++) {
    const date = new Date()
    date.setDate(date.getDate() + i)

    trend.push({
      date: date.toISOString().split('T')[0],
      temperature: baseTemp + Math.floor(Math.random() * 5) - 2,
      weather: ['晴天', '多云', '阴天', '小雨'][Math.floor(Math.random() * 4)],
    })
  }

  return GetWeatherTrendResultSchema.parse(trend)
}
```

### 4.2 支持流式响应

创建 `weatherChatStream.js`:

```javascript
import OpenAI from 'openai'
import { getWeather } from './functions/getWeather.js'
import { getWeatherSchema } from './schemas/getWeather.schema.js'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})

async function chatStream(userMessage) {
  const messages = [
    { role: 'system', content: '你是天气助手' },
    { role: 'user', content: userMessage },
  ]

  console.log(`\n用户: ${userMessage}\n`)

  // 第一次调用:检测是否需要调用函数
  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: messages,
    functions: [getWeatherSchema],
  })

  const assistantMessage = response.choices[0].message

  if (assistantMessage.function_call) {
    const { name, arguments: args } = assistantMessage.function_call
    const params = JSON.parse(args)

    console.log(`→ 调用函数: ${name}(${JSON.stringify(params)})`)

    // 执行函数
    const result = getWeather(params)
    console.log(`→ 结果:`, result)

    // 添加函数结果到消息历史
    messages.push(assistantMessage)
    messages.push({
      role: 'function',
      name: name,
      content: JSON.stringify(result),
    })

    // 第二次调用:流式生成最终回复
    console.log('\nAI: ')

    const stream = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: messages,
      stream: true,
    })

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content
      if (content) {
        process.stdout.write(content)
      }
    }

    console.log('\n')
  } else {
    console.log(`\nAI: ${assistantMessage.content}\n`)
  }
}

// 测试
chatStream('北京今天天气怎么样?')
```

---

## 五、对接真实天气 API (可选)

### 5.1 使用免费天气 API

以和风天气为例:

```javascript
import fetch from 'node-fetch'

/**
 * 调用真实天气 API
 */
async function getRealWeather(city) {
  const apiKey = process.env.WEATHER_API_KEY
  const baseUrl = 'https://devapi.qweather.com/v7/weather/now'

  // 1. 先查询城市 ID (简化处理,实际需要调用 GeoAPI)
  const cityIdMap = {
    北京: '101010100',
    上海: '101020100',
    深圳: '101280601',
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
  }
}
```

---

## 六、学习检查清单

完成以下所有项目,说明你已掌握本节内容:

### 第一层:基础功能

- [ ] 实现了天气查询函数
- [ ] 定义了完整的 Function Schema
- [ ] 集成了 Zod 验证
- [ ] 能够正确执行函数调用

### 第二层:交互体验

- [ ] 实现了多轮对话
- [ ] 支持上下文记忆
- [ ] 提供了友好的交互界面
- [ ] 处理了各种错误情况

### 第三层:扩展能力

- [ ] 支持多个城市查询
- [ ] 实现了流式响应 (可选)
- [ ] 添加了更多天气相关函数 (可选)
- [ ] 对接了真实 API (可选)

---

## 七、实践作业

### 作业 1: 添加天气预警功能

实现一个 `getWeatherAlert` 函数:

- 参数: `city` (城市名称)
- 返回: 当前的天气预警信息 (如台风、暴雨等)
- 集成到聊天流程中

### 作业 2: 支持语音播报

实现一个 `speakWeather` 函数:

- 参数: 天气信息对象
- 功能: 将天气信息转换为语音播报文本
- 提示: 使用更口语化的表达

### 作业 3: 添加天气建议

根据天气情况给出建议:

- 下雨 → 建议带伞
- 高温 → 建议防晒
- AQI 高 → 建议戴口罩

---

## 八、常见问题

### Q1: 如何支持更多城市?

**答**: 扩展 `weatherDatabase` 或对接真实 API:

```javascript
// 方案 1: 扩展模拟数据
const weatherDatabase = {
  // ... 添加更多城市
}

// 方案 2: 对接真实 API
async function getWeather(params) {
  return await getRealWeather(params.city)
}
```

### Q2: 如何处理 AI 提取错误的城市名?

**答**: 在函数中添加容错处理:

```javascript
function getWeather(params) {
  let city = params.city

  // 城市名修正
  const corrections = {
    '帝都': '北京',
    '魔都': '上海',
    '鹏城': '深圳',
  }

  city = corrections[city] || city

  // 继续查询...
}
```

### Q3: 可以一次查询多个城市吗?

**答**: 可以,修改 Schema 支持数组:

```javascript
const GetWeatherParamsSchema = z.object({
  cities: z.array(z.string()).describe('城市列表'),
})

function getWeather(params) {
  const results = params.cities.map(city => queryWeather(city))
  return results
}
```

---

## 九、下一步学习方向

完成本节后,你已经构建了完整的 Function Calling 应用。接下来:

1. **Step 35**: 整理文档,总结最佳实践

---

**记住: 真实项目的关键是细节处理,错误处理、用户体验、边界情况都需要考虑周全。**
