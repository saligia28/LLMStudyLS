# Step 29: Function Calling｜理解 function schema

## 学习目标

这个任务的本质是回答一个核心问题:**什么是 Function Calling,以及如何在真实项目中应用 Function Schema**。

通过本教程,你将:

1. 理解 Function Calling 的核心概念和应用场景
2. 掌握 Function Schema 的结构和设计原则
3. 学习企业级 AI 后端服务的架构模式
4. 通过 AI-backend 项目理解 Function Calling 的实战应用

> **实战项目**: 本教程将结合 `/Users/jianglin/Desktop/backend/AI-backend` 项目,这是一个生产级的 Express.js AI 后端服务,展示了如何在真实场景中实现 Function Calling。

---

## 一、核心认知:什么是 Function Calling?

### 1.1 传统 AI 对话 vs Function Calling

```
┌─────────────────────────────────────────────────────────────┐
│          传统 AI 对话 vs Function Calling                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   传统 AI 对话                                                │
│   ┌─────────────────────────────────────────────────┐       │
│   │  用户: "现在北京的天气怎么样?"                    │       │
│   │  AI:  "抱歉,我无法获取实时天气信息。"             │       │
│   │                                                 │       │
│   │  问题:                                          │       │
│   │  - AI 没有访问外部数据的能力                     │       │
│   │  - 只能基于训练数据回答                          │       │
│   │  - 无法获取实时信息                              │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   Function Calling (函数调用)                                 │
│   ┌─────────────────────────────────────────────────┐       │
│   │  用户: "现在北京的天气怎么样?"                    │       │
│   │                                                 │       │
│   │  AI 分析: 这需要调用天气查询函数                  │       │
│   │  ↓                                              │       │
│   │  AI 返回函数调用指令:                            │       │
│   │  {                                              │       │
│   │    name: "getWeather",                         │       │
│   │    arguments: { city: "北京" }                 │       │
│   │  }                                              │       │
│   │  ↓                                              │       │
│   │  系统执行函数 → 返回真实天气数据                  │       │
│   │  ↓                                              │       │
│   │  AI: "北京当前温度 15°C,晴天,空气质量良好。"      │       │
│   │                                                 │       │
│   │  优势:                                          │       │
│   │  ✓ 能够调用外部 API 获取实时数据                 │       │
│   │  ✓ 可以执行实际操作(发邮件、预订等)               │       │
│   │  ✓ 扩展 AI 的能力边界                           │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Function Calling 的工作流程

```
┌─────────────────────────────────────────────────────────────┐
│              Function Calling 完整流程                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌──────────────────────────────────────────────┐          │
│   │  1. 用户发送请求                              │          │
│   │     "帮我查一下今天的天气"                     │          │
│   └──────────────────┬───────────────────────────┘          │
│                      ↓                                      │
│   ┌──────────────────────────────────────────────┐          │
│   │  2. 开发者提供函数定义(Schema)                 │          │
│   │     告诉 AI 有哪些函数可以调用                 │          │
│   │     - 函数名称                                │          │
│   │     - 函数描述                                │          │
│   │     - 参数定义                                │          │
│   └──────────────────┬───────────────────────────┘          │
│                      ↓                                      │
│   ┌──────────────────────────────────────────────┐          │
│   │  3. AI 分析并决定调用哪个函数                  │          │
│   │     返回函数调用指令(不是真正执行)              │          │
│   │     {                                        │          │
│   │       name: "getWeather",                   │          │
│   │       arguments: "{\"city\":\"北京\"}"       │          │
│   │     }                                        │          │
│   └──────────────────┬───────────────────────────┘          │
│                      ↓                                      │
│   ┌──────────────────────────────────────────────┐          │
│   │  4. 开发者解析并执行真正的函数                 │          │
│   │     const result = getWeather("北京")        │          │
│   │     → { temp: 15, weather: "晴" }           │          │
│   └──────────────────┬───────────────────────────┘          │
│                      ↓                                      │
│   ┌──────────────────────────────────────────────┐          │
│   │  5. 将结果返回给 AI,让 AI 生成自然语言回复     │          │
│   │     "北京今天晴天,温度 15°C"                   │          │
│   └──────────────────────────────────────────────┘          │
│                                                             │
│   关键理解:                                                  │
│   - AI 不会真正执行函数,只是返回"调用指令"                      │
│   - 开发者负责实际执行函数                                    │
│   - 执行结果需要再次发送给 AI,由 AI 生成最终回复               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、企业级实战:AI-backend 项目架构

在深入 Function Schema 之前,我们先看一个真实的生产级项目如何组织 AI 服务。

### 2.1 AI-backend 项目结构

```
AI-backend/
├── functions/                 # 实际可执行的函数
│   ├── getTime.js            # 获取时间函数
│   └── sum.js                # 求和函数
├── schemas/                   # Function Schema 定义
│   ├── getTime.schema.js
│   └── sum.schema.js
├── src/
│   ├── adapters/             # AI 提供商适配器(核心设计模式)
│   │   ├── base.adapter.js   # 抽象基类
│   │   ├── deepseek.adapter.js
│   │   ├── openai.adapter.js
│   │   └── factory.js        # 工厂模式注册器
│   ├── services/
│   │   └── ai.service.js     # AI 服务编排层
│   ├── controllers/
│   │   └── chat.controller.js # 控制器层
│   ├── validators/
│   │   └── chatValidator.js  # 参数验证
│   └── errors/               # 错误处理体系
└── server.js                 # 入口文件
```

**架构亮点**:
- **Adapter Pattern**: 统一不同 AI 提供商的接口
- **Factory Pattern**: 动态注册和选择 AI 提供商
- **职责分离**: Schema 定义和函数实现分离
- **错误处理**: 完整的错误体系和日志记录

### 2.2 Function Calling 在 AI-backend 中的位置

```
┌─────────────────────────────────────────────────────────────┐
│              AI-backend 请求流程                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   HTTP Request                                              │
│       ↓                                                     │
│   Controller (chat.controller.js)                          │
│       ↓                                                     │
│   Validator (chatValidator.js)                             │
│       ↓                                                     │
│   Service (ai.service.js)                                  │
│       ↓                                                     │
│   Adapter Factory (factory.js)                             │
│       ↓                                                     │
│   Provider Adapter (deepseek.adapter.js)                   │
│       ↓                                                     │
│   AI Provider API (DeepSeek/OpenAI)                        │
│       ↓                                                     │
│   【Function Calling 发生在这里】                            │
│   AI 返回: {                                                │
│     function_call: {                                       │
│       name: "getTime",                                     │
│       arguments: "{\"timezone\":\"Asia/Shanghai\"}"        │
│     }                                                      │
│   }                                                        │
│       ↓                                                     │
│   开发者执行函数 (functions/getTime.js)                      │
│       ↓                                                     │
│   返回结果给 AI,生成最终回复                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、Function Schema 详解

### 3.1 什么是 Function Schema?

Function Schema 是一个 JSON 对象,用来描述函数的:
- **名称** (name): 函数叫什么
- **描述** (description): 函数是干什么的
- **参数** (parameters): 函数需要什么参数

**核心作用**: 让 AI 理解你有哪些函数可以调用,以及如何调用它们。

### 3.2 AI-backend 实战案例: getTime Schema

让我们看 AI-backend 项目中的真实示例:

**文件**: `schemas/getTime.schema.js`

```javascript
export const getTimeSchema = {
  name: 'getTime',
  description: '获取指定时区的当前时间。如果不指定时区,返回北京时间。',
  parameters: {
    type: 'object',
    properties: {
      timezone: {
        type: 'string',
        description: '时区标识符,例如: UTC, Asia/Shanghai, America/New_York',
        enum: ['UTC', 'Asia/Shanghai', 'America/New_York'],
        default: 'Asia/Shanghai',
      },
    },
    required: [], // timezone 是可选的
  },
}
```

**逐字段解析**:

```
┌─────────────────────────────────────────────────────────────┐
│              Function Schema 字段详解                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   name (必填)                                                │
│   - 函数的唯一标识符                                          │
│   - 使用驼峰命名法                                           │
│   - 例: getTime, sendEmail, calculateSum                   │
│   - 必须与实际函数名一致                                      │
│                                                             │
│   description (必填)                                         │
│   - 函数功能的清晰描述                                        │
│   - 越详细越好,帮助 AI 理解何时调用                           │
│   - 应说明默认行为(如:"如果不指定时区,返回北京时间")           │
│                                                             │
│   parameters (必填)                                          │
│   - 参数定义对象                                             │
│   - 使用 JSON Schema 规范                                   │
│   - 包含:                                                   │
│     • type: "object"  (固定值)                              │
│     • properties: {...}  (参数列表)                         │
│     • required: [...]    (必填参数数组)                      │
│                                                             │
│   enum (可选但推荐)                                          │
│   - 限制参数的可选值                                          │
│   - 防止 AI 传入无效值                                        │
│   - 提高调用准确性                                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 parameters 参数定义详解

```javascript
parameters: {
  type: 'object',          // 固定值,表示参数是一个对象

  properties: {            // 定义每个参数
    timezone: {            // 参数名
      type: 'string',      // 参数类型
      description: '时区标识符',  // 参数描述
      enum: ['UTC', 'Asia/Shanghai', 'America/New_York'],  // 可选值
      default: 'Asia/Shanghai',  // 默认值提示
    },
  },

  required: [],            // 必填参数列表(空数组表示都可选)
}
```

**支持的参数类型**:

```
┌─────────────────────────────────────────────────────────────┐
│              JSON Schema 参数类型                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   type: "string"     → 字符串                                │
│   例: "北京", "hello@example.com"                            │
│                                                             │
│   type: "number"     → 数字(整数或浮点数)                      │
│   例: 42, 3.14                                              │
│                                                             │
│   type: "integer"    → 整数                                  │
│   例: 1, 2, 100                                             │
│                                                             │
│   type: "boolean"    → 布尔值                                │
│   例: true, false                                           │
│                                                             │
│   type: "array"      → 数组                                  │
│   需要额外定义 items (数组元素类型)                            │
│   例: ["北京", "上海"]                                        │
│                                                             │
│   type: "object"     → 对象                                  │
│   需要额外定义 properties (对象属性)                           │
│   例: { city: "北京", temp: 15 }                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.4 AI-backend 实战案例: sum Schema

**文件**: `schemas/sum.schema.js`

```javascript
export const sumSchema = {
  name: 'sum',
  description: '计算两个数字的和。支持整数和浮点数。',
  parameters: {
    type: 'object',
    properties: {
      a: {
        type: 'number',
        description: '第一个加数',
      },
      b: {
        type: 'number',
        description: '第二个加数',
      },
    },
    required: ['a', 'b'],  // 两个参数都是必填的
  },
}
```

**对比 getTime 和 sum 的 Schema 设计**:

| 特性 | getTime | sum |
|------|---------|-----|
| 参数数量 | 1个(可选) | 2个(必填) |
| required 数组 | `[]` (空) | `['a', 'b']` |
| 参数类型 | string | number |
| 使用 enum | ✓ (限制时区) | ✗ (数字无限制) |
| 默认值 | 有默认时区 | 无默认值 |

---

## 四、如何在 API 调用中使用 Function Schema

### 4.1 基本调用方式

```javascript
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})

// 定义函数列表
const functions = [
  {
    name: 'getTime',
    description: '获取指定时区的当前时间',
    parameters: {
      type: 'object',
      properties: {
        timezone: {
          type: 'string',
          description: '时区标识符',
          enum: ['UTC', 'Asia/Shanghai', 'America/New_York'],
        },
      },
      required: [],
    },
  },
  {
    name: 'sum',
    description: '计算两个数字的和',
    parameters: {
      type: 'object',
      properties: {
        a: { type: 'number', description: '第一个加数' },
        b: { type: 'number', description: '第二个加数' },
      },
      required: ['a', 'b'],
    },
  },
]

// 调用 API
const response = await client.chat.completions.create({
  model: 'deepseek-chat',
  messages: [
    { role: 'user', content: '现在几点了?' },
  ],
  functions: functions,  // 传入函数定义
})

console.log(response.choices[0].message)
```

### 4.2 AI 的返回格式

当 AI 决定调用函数时,会返回:

```javascript
{
  role: 'assistant',
  content: null,  // 注意:content 为 null
  function_call: {
    name: 'getTime',  // 要调用的函数名
    arguments: '{"timezone":"Asia/Shanghai"}'  // 参数(JSON 字符串!)
  }
}
```

**关键理解**:
- `content` 为 `null`,说明 AI 没有直接回复,而是要调用函数
- `function_call.arguments` 是 **JSON 字符串**,不是对象
- 需要使用 `JSON.parse()` 解析参数

---

## 五、AI-backend 的 Adapter 模式

AI-backend 项目使用 Adapter 模式统一不同 AI 提供商的接口。

### 5.1 BaseAdapter 抽象类

**文件**: `src/adapters/base.adapter.js`

```javascript
export class BaseAdapter {
  /**
   * 非流式聊天
   * @param {Array} messages - 消息列表
   * @param {Object} options - 配置选项
   * @param {Array} options.functions - 函数定义列表
   */
  async chat(messages, options = {}) {
    throw new Error('chat() must be implemented')
  }

  /**
   * 流式聊天
   * @param {Array} messages - 消息列表
   * @param {Object} options - 配置选项
   * @param {Array} options.functions - 函数定义列表
   */
  async chatStream(messages, options = {}) {
    throw new Error('chatStream() must be implemented')
  }

  /**
   * 格式化消息
   */
  formatMessages(messages) {
    return messages
  }

  /**
   * 格式化响应
   */
  formatResponse(response) {
    return {
      role: 'assistant',
      content: response.choices[0].message.content,
      function_call: response.choices[0].message.function_call,
    }
  }
}
```

### 5.2 DeepSeek Adapter 实现

**文件**: `src/adapters/deepseek.adapter.js`

```javascript
import OpenAI from 'openai'
import { BaseAdapter } from './base.adapter.js'

export class DeepSeekAdapter extends BaseAdapter {
  constructor(config) {
    super()
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    })
    this.model = config.model || 'deepseek-chat'
  }

  async chat(messages, options = {}) {
    const { functions, ...restOptions } = options

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: this.formatMessages(messages),
      functions: functions,  // 传入 Function Schema
      ...restOptions,
    })

    return this.formatResponse(response)
  }

  // ... 省略其他方法
}
```

**Adapter Pattern 的优势**:
- 统一接口,切换 AI 提供商只需改配置
- 封装细节,业务代码不关心具体实现
- 易于扩展,新增提供商只需实现 BaseAdapter
- 便于测试,可以 mock Adapter

---

## 六、复杂场景的 Function Schema 模板

### 6.1 包含数组参数的 Schema

```javascript
{
  name: 'searchProducts',
  description: '搜索商品',
  parameters: {
    type: 'object',
    properties: {
      keywords: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: '搜索关键词列表',
      },
      maxResults: {
        type: 'integer',
        description: '最大返回结果数',
        default: 10,
      },
    },
    required: ['keywords'],
  },
}
```

### 6.2 包含对象参数的 Schema

```javascript
{
  name: 'createUser',
  description: '创建新用户',
  parameters: {
    type: 'object',
    properties: {
      userInfo: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '用户姓名',
          },
          email: {
            type: 'string',
            description: '用户邮箱',
          },
          age: {
            type: 'integer',
            description: '用户年龄',
          },
        },
        required: ['name', 'email'],
      },
    },
    required: ['userInfo'],
  },
}
```

### 6.3 包含枚举限制的 Schema

```javascript
{
  name: 'setTemperature',
  description: '设置温度',
  parameters: {
    type: 'object',
    properties: {
      value: {
        type: 'number',
        description: '温度值',
      },
      unit: {
        type: 'string',
        description: '温度单位',
        enum: ['celsius', 'fahrenheit', 'kelvin'],  // 限制值
      },
    },
    required: ['value', 'unit'],
  },
}
```

---

## 七、Schema 设计检查清单

设计完 Schema 后,检查以下几点:

```
┌─────────────────────────────────────────────────────────────┐
│              Schema 设计检查清单                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ✓ name 是否清晰且符合命名规范?                              │
│     - 使用动词开头(get, send, create, update, delete)       │
│     - 使用驼峰命名法                                         │
│     - 与实际函数名保持一致                                    │
│                                                             │
│   ✓ description 是否足够详细?                                │
│     - 说明函数的具体功能                                     │
│     - 说明何时应该调用这个函数                                │
│     - 说明默认行为和特殊情况                                  │
│                                                             │
│   ✓ 参数类型是否正确?                                        │
│     - 邮箱、城市名 → string                                 │
│     - 数量、价格 → number                                   │
│     - 开关状态 → boolean                                    │
│                                                             │
│   ✓ 参数描述是否清晰?                                        │
│     - 说明参数的含义                                         │
│     - 如果有格式要求,要说明                                  │
│     - 给出示例值                                            │
│                                                             │
│   ✓ required 数组是否正确?                                   │
│     - 列出所有必填参数                                       │
│     - 可选参数不要放在 required 里                           │
│     - 有默认值的参数通常是可选的                              │
│                                                             │
│   ✓ 是否使用了 enum 限制值?                                  │
│     - 对于固定选项,使用 enum                                 │
│     - 防止 AI 传入无效值                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 八、学习检查清单

完成以下所有项目,说明你已掌握本节内容:

### 第一层:概念理解

- [ ] 理解什么是 Function Calling
- [ ] 理解 Function Calling 的工作流程
- [ ] 知道 AI 不会真正执行函数,只是返回调用指令
- [ ] 理解 Function Schema 的作用
- [ ] 了解 AI-backend 项目的架构

### 第二层:Schema 编写

- [ ] 能够编写包含 name、description、parameters 的 Schema
- [ ] 理解 properties 和 required 的用法
- [ ] 能够定义不同类型的参数(string、number、boolean、array)
- [ ] 能够使用 enum 限制参数值
- [ ] 理解 getTime 和 sum 两个实战案例

### 第三层:架构理解

- [ ] 理解 Adapter Pattern 的作用
- [ ] 知道如何分离 Schema 和函数实现
- [ ] 理解 AI-backend 的请求流程
- [ ] 知道 function_call 在哪里发生

---

## 九、实践作业

### 作业 1: 设计"获取天气"函数 Schema

设计一个获取天气的函数 Schema:

**要求**:
- 函数名: `getWeather`
- 参数:
  - `city` (必填,string): 城市名称
  - `unit` (可选,enum): 温度单位,可选值 `celsius`、`fahrenheit`
- 参考 AI-backend 的 getTime Schema 设计风格

### 作业 2: 探索 AI-backend 项目

**要求**:
1. 克隆或查看 AI-backend 项目代码
2. 找到 `functions/` 和 `schemas/` 目录
3. 阅读 `getTime.js` 和 `getTime.schema.js`
4. 运行测试: `node functions/getTime.js`
5. 理解 Schema 和函数实现的对应关系

### 作业 3: 设计"发送邮件"函数 Schema

设计一个发送邮件的函数 Schema:

**要求**:
- 函数名: `sendEmail`
- 必填参数: 收件人邮箱、邮件主题、邮件正文
- 可选参数: 抄送邮箱列表(array)
- 包含详细的 description

---

## 十、常见问题

### Q1: Schema 的 description 写多详细才合适?

**答**: 越详细越好,但要简洁。参考 AI-backend 的写法:

```javascript
// ✓ AI-backend 风格:清晰、有默认行为说明
description: '获取指定时区的当前时间。如果不指定时区,返回北京时间。'

// ✗ 太简单
description: '获取时间'

// ✓ 也很好:详细且包含返回信息
description: '查询指定城市的实时天气。需要提供城市名称,返回温度、天气、风速等信息。'
```

### Q2: 为什么要分离 Schema 和函数实现?

**答**: 参考 AI-backend 的设计:
- **职责分离**: Schema 只描述接口,函数只实现逻辑
- **易于维护**: 修改实现不影响 Schema
- **代码复用**: Schema 可用于文档生成、前端验证
- **团队协作**: 前端可以先拿 Schema 开发,后端再实现函数

### Q3: Adapter Pattern 有什么实际好处?

**答**: AI-backend 的 Adapter Pattern 带来:
- 统一接口,切换 DeepSeek/OpenAI 只需改配置
- 业务代码不关心具体 AI 提供商
- 易于添加新提供商(Claude、Gemini 等)
- 便于测试和 mock

---

## 十一、下一步学习方向

完成本节后,你已经理解了 Function Schema 和企业级架构。接下来你将:

1. **Step 30**: 编写两个最小函数: getTime / sum (使用 AI-backend 的实际代码)
2. **Step 31**: 让模型根据内容自动调用函数
3. **Step 32**: 调试 function_call → arguments 的 JSON 化
4. **Step 33**: 加入结构化返回(Joi/Zod)
5. **Step 34**: 构建完整的天气查询 API
6. **Step 35**: 总结企业级最佳实践

---

## 十二、参考资源

- **AI-backend 项目路径**: `/Users/jianglin/Desktop/backend/AI-backend`
- **关键文件**:
  - `functions/getTime.js` - 函数实现示例
  - `schemas/getTime.schema.js` - Schema 定义示例
  - `src/adapters/base.adapter.js` - Adapter 基类
  - `src/services/ai.service.js` - Service 层

**记住: Function Schema 是 AI 理解你的函数的唯一途径,写得越清晰,AI 调用得越准确。AI-backend 项目展示了如何在生产环境中优雅地组织这些代码。**
