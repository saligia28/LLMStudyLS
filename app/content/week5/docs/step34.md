# Step 34: Function Calling｜做一个天气查询 demo

## 学习目标

这一节回答的核心问题是：**怎样把前面学的 schema、执行器、循环和错误处理拼成一个完整工具应用？**

完成后你应该能：

1. 设计一个 `getWeather` 工具
2. 把天气工具并入现有工具表
3. 跑通“用户问题 → 工具调用 → 最终回答”的完整体验
4. 理解一个最小可演示 Function Calling 应用应包含哪些模块

> **本节默认模型**：`deepseek-chat`。天气 demo 是本周主线示例，不使用 `deepseek-reasoner`。

---

## 一、先设计天气工具的职责

这个 demo 的目标不是做真实天气服务，而是做出一条完整链路。所以我们先用一个可替换的数据源接口：

```js
export async function getWeather({ city }) {
  if (!city) {
    throw new Error('city 是必填参数')
  }

  const mockData = {
    北京: { condition: '晴', temperature: 24, humidity: 35 },
    上海: { condition: '多云', temperature: 22, humidity: 58 },
    深圳: { condition: '小雨', temperature: 28, humidity: 80 },
  }

  const data = mockData[city]
  if (!data) {
    throw new Error(`暂不支持城市: ${city}`)
  }

  return {
    city,
    ...data,
  }
}
```

---

## 二、给天气工具配套 schema

```js
export const getWeatherTool = {
  type: 'function',
  function: {
    name: 'getWeather',
    description: '查询指定城市的天气信息。用户询问天气、温度、湿度、是否适合出门时调用。',
    parameters: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: '城市名称，例如 北京、上海、深圳',
        },
      },
      required: ['city'],
    },
  },
}
```

描述里要把触发条件写清楚，不只是“查天气”，还包括“适不适合出门”“今天热不热”这种变体问题。

---

## 三、并入现有工具集

```js
import { getTime } from './getTime.js'
import { sum } from './sum.js'
import { getWeather } from './getWeather.js'

import { getTimeTool } from './getTime.tool.js'
import { sumTool } from './sum.tool.js'
import { getWeatherTool } from './getWeather.tool.js'

export const toolRegistry = {
  getTime,
  sum,
  getWeather,
}

export const tools = [getTimeTool, sumTool, getWeatherTool]
```

这样你的 demo 就有三类能力：

- 查询时间
- 数学计算
- 外部信息查询

---

## 四、一个最小 CLI 版本

```js
import readline from 'node:readline/promises'

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

while (true) {
  const question = await rl.question('\n你: ')
  if (question.trim() === 'exit') break

  const answer = await runToolLoop([
    { role: 'system', content: '你是一个会按需调用工具的助手。' },
    { role: 'user', content: question },
  ])

  console.log(`助手: ${answer}`)
}

rl.close()
```

适合测试的输入：

- “北京今天什么天气？”
- “上海现在几点？”
- “深圳下雨吗，顺便帮我算 19 + 23”

---

## 五、这个 demo 最值得观察什么

不要只看“最后答对没”，还要看：

1. 是否真的触发了正确工具
2. 参数是否合理
3. 工具结果是否正确回写给模型
4. 最终回答有没有把工具结果自然组织出来

推荐在开发时打印这三个日志：

```js
console.log('[tool_call]', toolCall.function.name, toolCall.function.arguments)
console.log('[tool_result]', toolResult)
console.log('[final_answer]', finalAnswer)
```

---

## 六、如果想换成真实天气 API

替换时只动 `getWeather()` 的内部实现即可：

```js
export async function getWeather({ city }) {
  const response = await fetch(`https://example.com/weather?city=${encodeURIComponent(city)}`)
  if (!response.ok) {
    throw new Error(`天气接口失败: ${response.status}`)
  }
  return response.json()
}
```

这也是我们一直把“schema / 执行器 / 工具实现”拆开的原因：  
**数据源可以换，工具调用协议不用换。**

---

## 七、小结

这一节把 Week 5 的知识第一次拼成了一个完整应用：

1. 定义工具 schema
2. 注册工具
3. 执行工具循环
4. 观察最终回答

下一节我们做收尾，总结一套可以直接迁移到后续项目里的最佳实践。
