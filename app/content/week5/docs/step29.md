# Step 29: Function Calling｜理解 function schema

## 学习目标

这个任务的本质是回答一个核心问题：**什么是 Function Calling，以及如何定义一个 Function Schema**。

通过本教程,你将:

1. 理解 Function Calling 的核心概念和应用场景
2. 掌握 Function Schema 的结构和设计原则
3. 学会编写符合 OpenAI 规范的函数定义
4. 理解大模型如何"理解"和"调用"函数

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

## 二、Function Schema 详解

### 2.1 什么是 Function Schema?

Function Schema 是一个 JSON 对象,用来描述函数的:
- **名称** (name): 函数叫什么
- **描述** (description): 函数是干什么的
- **参数** (parameters): 函数需要什么参数

**核心作用**: 让 AI 理解你有哪些函数可以调用,以及如何调用它们。

### 2.2 最简单的 Function Schema 示例

```javascript
const weatherFunction = {
  name: 'getWeather',
  description: '获取指定城市的天气信息',
  parameters: {
    type: 'object',
    properties: {
      city: {
        type: 'string',
        description: '城市名称,例如: 北京、上海、深圳',
      },
    },
    required: ['city'],
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
│   - 例: getWeather, sendEmail, calculateSum                │
│                                                             │
│   description (必填)                                         │
│   - 函数功能的清晰描述                                        │
│   - 越详细越好,帮助 AI 理解何时调用                           │
│   - 例: "获取指定城市的实时天气信息,包括温度、天气状况"         │
│                                                             │
│   parameters (必填)                                          │
│   - 参数定义对象                                             │
│   - 使用 JSON Schema 规范                                   │
│   - 包含:                                                   │
│     • type: "object"  (固定值)                              │
│     • properties: {...}  (参数列表)                         │
│     • required: [...]    (必填参数数组)                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 parameters 参数定义详解

```javascript
parameters: {
  type: 'object',          // 固定值,表示参数是一个对象

  properties: {            // 定义每个参数
    city: {                // 参数名
      type: 'string',      // 参数类型
      description: '城市名称',  // 参数描述
    },
    unit: {
      type: 'string',
      description: '温度单位',
      enum: ['celsius', 'fahrenheit'],  // 可选值限制
    },
  },

  required: ['city'],      // 必填参数列表
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

### 2.4 复杂参数示例

**示例 1: 包含数组参数**

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

**示例 2: 包含对象参数**

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

**示例 3: 包含枚举限制**

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
        enum: ['celsius', 'fahrenheit', 'kelvin'],  // 只能是这三个值之一
      },
    },
    required: ['value', 'unit'],
  },
}
```

---

## 三、实践:编写第一个 Function Schema

### 3.1 需求分析

我们要定义一个"发送邮件"的函数:

**功能**: 发送电子邮件
**需要的参数**:
- 收件人邮箱 (必填)
- 邮件主题 (必填)
- 邮件正文 (必填)
- 抄送邮箱 (可选)

### 3.2 编写 Schema

```javascript
const sendEmailFunction = {
  name: 'sendEmail',
  description: '发送电子邮件给指定收件人',
  parameters: {
    type: 'object',
    properties: {
      to: {
        type: 'string',
        description: '收件人邮箱地址',
      },
      subject: {
        type: 'string',
        description: '邮件主题',
      },
      body: {
        type: 'string',
        description: '邮件正文内容',
      },
      cc: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: '抄送邮箱地址列表(可选)',
      },
    },
    required: ['to', 'subject', 'body'],
  },
}
```

### 3.3 Schema 设计检查清单

设计完 Schema 后,检查以下几点:

```
┌─────────────────────────────────────────────────────────────┐
│              Schema 设计检查清单                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ✓ name 是否清晰且符合命名规范?                              │
│     - 使用动词开头(get, send, create, update, delete)       │
│     - 使用驼峰命名法                                         │
│                                                             │
│   ✓ description 是否足够详细?                                │
│     - 说明函数的具体功能                                     │
│     - 说明何时应该调用这个函数                                │
│                                                             │
│   ✓ 参数类型是否正确?                                        │
│     - 邮箱、城市名 → string                                 │
│     - 数量、价格 → number                                   │
│     - 开关状态 → boolean                                    │
│                                                             │
│   ✓ 参数描述是否清晰?                                        │
│     - 说明参数的含义                                         │
│     - 如果有格式要求,要说明                                  │
│                                                             │
│   ✓ required 数组是否正确?                                   │
│     - 列出所有必填参数                                       │
│     - 可选参数不要放在 required 里                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 四、如何在 API 调用中使用 Function Schema

### 4.1 基本调用方式

```javascript
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})

// 定义函数
const functions = [
  {
    name: 'getWeather',
    description: '获取指定城市的天气信息',
    parameters: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: '城市名称',
        },
      },
      required: ['city'],
    },
  },
]

// 调用 API
const response = await client.chat.completions.create({
  model: 'deepseek-chat',
  messages: [
    { role: 'user', content: '北京今天天气怎么样?' },
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
    name: 'getWeather',  // 要调用的函数名
    arguments: '{"city":"北京"}'  // 参数(JSON 字符串)
  }
}
```

**关键理解**:
- `content` 为 `null`,说明 AI 没有直接回复,而是要调用函数
- `function_call.arguments` 是 **JSON 字符串**,不是对象
- 需要使用 `JSON.parse()` 解析参数

---

## 五、常见场景的 Function Schema 模板

### 5.1 查询类函数

```javascript
{
  name: 'searchDatabase',
  description: '在数据库中搜索数据',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索关键词',
      },
      limit: {
        type: 'integer',
        description: '最大返回结果数',
        default: 10,
      },
    },
    required: ['query'],
  },
}
```

### 5.2 创建类函数

```javascript
{
  name: 'createTask',
  description: '创建新任务',
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: '任务标题',
      },
      description: {
        type: 'string',
        description: '任务描述',
      },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        description: '优先级',
      },
      dueDate: {
        type: 'string',
        description: '截止日期,格式: YYYY-MM-DD',
      },
    },
    required: ['title'],
  },
}
```

### 5.3 计算类函数

```javascript
{
  name: 'calculate',
  description: '执行数学计算',
  parameters: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['add', 'subtract', 'multiply', 'divide'],
        description: '运算类型',
      },
      a: {
        type: 'number',
        description: '第一个数',
      },
      b: {
        type: 'number',
        description: '第二个数',
      },
    },
    required: ['operation', 'a', 'b'],
  },
}
```

---

## 六、学习检查清单

完成以下所有项目,说明你已掌握本节内容:

### 第一层:概念理解

- [ ] 理解什么是 Function Calling
- [ ] 理解 Function Calling 的工作流程
- [ ] 知道 AI 不会真正执行函数,只是返回调用指令
- [ ] 理解 Function Schema 的作用

### 第二层:Schema 编写

- [ ] 能够编写包含 name、description、parameters 的 Schema
- [ ] 理解 properties 和 required 的用法
- [ ] 能够定义不同类型的参数(string、number、boolean、array)
- [ ] 能够使用 enum 限制参数值

### 第三层:实际应用

- [ ] 能够根据需求设计合理的 Function Schema
- [ ] 知道如何在 API 调用中传入 functions 参数
- [ ] 理解 AI 返回的 function_call 格式
- [ ] 知道 arguments 是 JSON 字符串,需要解析

---

## 七、实践作业

### 作业 1: 设计"获取时间"函数

设计一个获取当前时间的函数 Schema:

**要求**:
- 函数名: `getTime`
- 参数: `timezone` (时区,可选,默认为本地时区)
- 支持的时区: `UTC`、`Asia/Shanghai`、`America/New_York`

### 作业 2: 设计"计算器"函数

设计一个通用计算器函数 Schema:

**要求**:
- 函数名: `calculate`
- 参数:
  - `expression`: 数学表达式字符串,如 "2 + 3 * 4"
  - 或者分开定义: `num1`、`num2`、`operator`

### 作业 3: 设计"预订酒店"函数

设计一个酒店预订函数 Schema:

**要求**:
- 函数名: `bookHotel`
- 必填参数: 城市、入住日期、退房日期
- 可选参数: 房间类型、人数、特殊要求

---

## 八、常见问题

### Q1: description 写多详细才合适?

**答**: 越详细越好,但要简洁。核心原则:

```javascript
// ❌ 太简单
description: '获取天气'

// ✓ 合适
description: '获取指定城市的当前天气信息,包括温度、天气状况、湿度等'

// ✓ 也可以
description: '查询指定城市的实时天气。需要提供城市名称,返回温度、天气、风速等信息。'
```

### Q2: 参数名可以使用中文吗?

**答**: 技术上可以,但**强烈不推荐**:

```javascript
// ❌ 不推荐
properties: {
  城市: { type: 'string' }
}

// ✓ 推荐
properties: {
  city: {
    type: 'string',
    description: '城市名称'  // 在 description 中用中文说明
  }
}
```

### Q3: 什么时候用 enum?

**答**: 当参数只能从固定的几个值中选择时:

```javascript
// 适合使用 enum 的场景
{
  unit: {
    type: 'string',
    enum: ['celsius', 'fahrenheit'],  // 温度单位只有这两个
  },
  priority: {
    type: 'string',
    enum: ['low', 'medium', 'high'],  // 优先级只有三档
  },
}
```

---

## 九、下一步学习方向

完成本节后,你已经理解了 Function Schema 的设计。接下来你将:

1. **Step 30**: 编写两个最小函数: getTime / sum
2. **Step 31**: 让模型根据内容自动调用函数
3. **Step 32**: 调试 function_call → arguments 的 JSON 化
4. **Step 33**: 加入结构化返回(zod 也可以)
5. **Step 34**: 做一个"天气查询"demo
6. **Step 35**: 整理文档

---

**记住: Function Schema 是 AI 理解你的函数的唯一途径,写得越清晰,AI 调用得越准确。**
