# Step 30: Function Calling｜写两个最小函数: getTime / sum

## 学习目标

这个任务的本质是回答一个核心问题:**如何实现真正可执行的函数,并定义对应的 Function Schema**。

通过本教程,你将:

1. 学会编写实际可执行的 JavaScript 函数
2. 为函数定义对应的 Function Schema
3. 理解函数实现和 Schema 定义的对应关系
4. 掌握函数参数验证和错误处理

---

## 一、核心认知:Function Schema vs 实际函数

### 1.1 两者的关系

```
┌─────────────────────────────────────────────────────────────┐
│         Function Schema vs 实际函数的关系                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Function Schema (告诉 AI 有什么函数)                        │
│   ┌─────────────────────────────────────────────────┐       │
│   │  {                                              │       │
│   │    name: "sum",                                │       │
│   │    description: "计算两个数的和",               │       │
│   │    parameters: {                               │       │
│   │      type: "object",                           │       │
│   │      properties: {                             │       │
│   │        a: { type: "number" },                 │       │
│   │        b: { type: "number" }                  │       │
│   │      },                                        │       │
│   │      required: ["a", "b"]                      │       │
│   │    }                                           │       │
│   │  }                                             │       │
│   └─────────────────────────────────────────────────┘       │
│                         ↓                                   │
│                   AI 理解并返回调用指令                        │
│                         ↓                                   │
│   ┌─────────────────────────────────────────────────┐       │
│   │  {                                              │       │
│   │    name: "sum",                                │       │
│   │    arguments: '{"a": 10, "b": 20}'            │       │
│   │  }                                             │       │
│   └─────────────────────────────────────────────────┘       │
│                         ↓                                   │
│                开发者解析并调用实际函数                         │
│                         ↓                                   │
│   实际函数 (真正执行计算)                                      │
│   ┌─────────────────────────────────────────────────┐       │
│   │  function sum(a, b) {                          │       │
│   │    return a + b                                │       │
│   │  }                                             │       │
│   │                                                │       │
│   │  const result = sum(10, 20)  // 30            │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   关键理解:                                                  │
│   - Schema 是"函数的说明书",给 AI 看的                        │
│   - 实际函数是"真正干活的代码",给系统执行的                     │
│   - 两者必须保持一致(名称、参数、功能)                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、实现第一个函数:getTime

### 2.1 需求分析

**功能**: 获取当前时间
**参数**:
- `timezone` (可选): 时区,默认为本地时区
- 支持的时区: `UTC`、`Asia/Shanghai`、`America/New_York`

**返回**: 格式化的时间字符串

### 2.2 编写实际函数

创建文件 `functions/getTime.js`:

```javascript
/**
 * 获取当前时间
 * @param {string} timezone - 时区(可选)
 * @returns {string} 格式化的时间字符串
 */
export function getTime(timezone = 'Asia/Shanghai') {
  try {
    const now = new Date()

    // 根据时区格式化时间
    const options = {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }

    const formatter = new Intl.DateTimeFormat('zh-CN', options)
    const formattedTime = formatter.format(now)

    return `当前时间 (${timezone}): ${formattedTime}`
  } catch (error) {
    throw new Error(`获取时间失败: ${error.message}`)
  }
}

// 测试函数
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(getTime())  // 默认时区
  console.log(getTime('UTC'))  // UTC 时区
  console.log(getTime('America/New_York'))  // 纽约时区
}
```

**代码解析**:

```
┌─────────────────────────────────────────────────────────────┐
│              getTime 函数实现要点                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   1. 参数处理                                                │
│      - 使用默认参数: timezone = 'Asia/Shanghai'              │
│      - 如果调用时不传参数,自动使用默认值                       │
│                                                             │
│   2. 时区处理                                                │
│      - 使用 Intl.DateTimeFormat 处理不同时区                 │
│      - 支持标准时区标识符(IANA 时区数据库)                    │
│                                                             │
│   3. 错误处理                                                │
│      - 使用 try-catch 捕获异常                               │
│      - 抛出清晰的错误信息                                    │
│                                                             │
│   4. 返回值                                                 │
│      - 返回格式化的字符串,方便阅读                            │
│      - 包含时区信息,避免歧义                                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 定义 Function Schema

创建文件 `schemas/getTime.schema.js`:

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
    required: [],  // 注意:timezone 是可选的,所以 required 为空数组
  },
}
```

**Schema 设计要点**:

```
┌─────────────────────────────────────────────────────────────┐
│              getTime Schema 设计要点                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ✓ name 与实际函数名一致                                     │
│     Schema: "getTime"                                       │
│     函数:   function getTime()                              │
│                                                             │
│   ✓ description 清晰说明功能和默认行为                        │
│     "获取指定时区的当前时间。如果不指定时区,返回北京时间。"      │
│                                                             │
│   ✓ 参数定义与函数签名一致                                    │
│     Schema 参数: timezone (可选)                             │
│     函数参数:    timezone = 'Asia/Shanghai'                  │
│                                                             │
│   ✓ 使用 enum 限制有效值                                     │
│     防止 AI 传入不支持的时区                                  │
│                                                             │
│   ✓ required 为空数组                                        │
│     因为 timezone 有默认值,不是必填参数                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、实现第二个函数:sum

### 3.1 需求分析

**功能**: 计算两个数的和
**参数**:
- `a` (必填): 第一个数
- `b` (必填): 第二个数

**返回**: 两数之和

### 3.2 编写实际函数

创建文件 `functions/sum.js`:

```javascript
/**
 * 计算两个数的和
 * @param {number} a - 第一个数
 * @param {number} b - 第二个数
 * @returns {number} 两数之和
 */
export function sum(a, b) {
  // 参数验证
  if (typeof a !== 'number' || typeof b !== 'number') {
    throw new Error('参数必须是数字类型')
  }

  if (isNaN(a) || isNaN(b)) {
    throw new Error('参数不能是 NaN')
  }

  const result = a + b

  return result
}

// 测试函数
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('sum(10, 20) =', sum(10, 20))  // 30
  console.log('sum(-5, 5) =', sum(-5, 5))    // 0
  console.log('sum(3.14, 2.86) =', sum(3.14, 2.86))  // 6

  // 测试错误处理
  try {
    sum('10', 20)  // 应该抛出错误
  } catch (error) {
    console.log('错误捕获:', error.message)
  }
}
```

**代码解析**:

```
┌─────────────────────────────────────────────────────────────┐
│              sum 函数实现要点                                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   1. 参数验证 - 非常重要!                                     │
│      ┌─────────────────────────────────────────────┐        │
│      │  为什么需要验证?                             │        │
│      │  - AI 可能传错类型 (字符串 "10" 而不是数字 10) │        │
│      │  - 确保函数的健壮性                          │        │
│      │  - 提供清晰的错误信息                        │        │
│      └─────────────────────────────────────────────┘        │
│                                                             │
│   2. 类型检查                                               │
│      - typeof a !== 'number'  检查是否为数字类型             │
│      - isNaN(a)               检查是否为 NaN                │
│                                                             │
│   3. 返回值                                                 │
│      - 直接返回计算结果                                      │
│      - 不需要额外的格式化                                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 定义 Function Schema

创建文件 `schemas/sum.schema.js`:

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

---

## 四、组织代码结构

### 4.1 推荐的目录结构

```
week5-function-calling/
├── functions/           # 实际函数实现
│   ├── getTime.js
│   └── sum.js
├── schemas/            # Function Schema 定义
│   ├── getTime.schema.js
│   └── sum.schema.js
├── utils/              # 工具函数
│   └── functionExecutor.js  # 函数执行器(稍后实现)
└── test.js             # 测试文件
```

### 4.2 为什么要分离 Schema 和实现?

```
┌─────────────────────────────────────────────────────────────┐
│         分离 Schema 和实现的优势                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   1. 职责分离                                                │
│      - schemas/  只关心"函数长什么样"                        │
│      - functions/ 只关心"函数怎么实现"                       │
│                                                             │
│   2. 易于维护                                                │
│      - 修改函数逻辑不影响 Schema                             │
│      - 修改 Schema 描述不影响函数实现                        │
│                                                             │
│   3. 便于测试                                                │
│      - 可以单独测试函数实现                                  │
│      - 可以单独验证 Schema 格式                              │
│                                                             │
│   4. 代码复用                                                │
│      - Schema 可以用于生成文档                               │
│      - Schema 可以用于前端表单验证                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 五、测试函数

### 5.1 创建测试文件

创建 `test.js`:

```javascript
import { getTime } from './functions/getTime.js'
import { sum } from './functions/sum.js'
import { getTimeSchema } from './schemas/getTime.schema.js'
import { sumSchema } from './schemas/sum.schema.js'

console.log('=== 测试 getTime 函数 ===\n')

// 测试 1: 默认时区
console.log('测试 1: 默认时区')
console.log(getTime())
console.log()

// 测试 2: UTC 时区
console.log('测试 2: UTC 时区')
console.log(getTime('UTC'))
console.log()

// 测试 3: 纽约时区
console.log('测试 3: 纽约时区')
console.log(getTime('America/New_York'))
console.log()

console.log('=== 测试 sum 函数 ===\n')

// 测试 1: 正整数相加
console.log('测试 1: 正整数相加')
console.log('sum(10, 20) =', sum(10, 20))
console.log()

// 测试 2: 负数相加
console.log('测试 2: 负数相加')
console.log('sum(-5, 5) =', sum(-5, 5))
console.log()

// 测试 3: 浮点数相加
console.log('测试 3: 浮点数相加')
console.log('sum(3.14, 2.86) =', sum(3.14, 2.86))
console.log()

// 测试 4: 错误处理
console.log('测试 4: 错误处理')
try {
  sum('10', 20)
} catch (error) {
  console.log('✓ 错误被正确捕获:', error.message)
}
console.log()

console.log('=== 验证 Schema ===\n')

console.log('getTime Schema:')
console.log(JSON.stringify(getTimeSchema, null, 2))
console.log()

console.log('sum Schema:')
console.log(JSON.stringify(sumSchema, null, 2))
```

### 5.2 运行测试

```bash
node test.js
```

预期输出:

```
=== 测试 getTime 函数 ===

测试 1: 默认时区
当前时间 (Asia/Shanghai): 2024-01-26 14:30:45

测试 2: UTC 时区
当前时间 (UTC): 2024-01-26 06:30:45

测试 3: 纽约时区
当前时间 (America/New_York): 2024-01-26 01:30:45

=== 测试 sum 函数 ===

测试 1: 正整数相加
sum(10, 20) = 30

测试 2: 负数相加
sum(-5, 5) = 0

测试 3: 浮点数相加
sum(3.14, 2.86) = 6

测试 4: 错误处理
✓ 错误被正确捕获: 参数必须是数字类型

=== 验证 Schema ===

getTime Schema:
{
  "name": "getTime",
  "description": "获取指定时区的当前时间。如果不指定时区,返回北京时间。",
  "parameters": {
    "type": "object",
    "properties": {
      "timezone": {
        "type": "string",
        "description": "时区标识符,例如: UTC, Asia/Shanghai, America/New_York",
        "enum": ["UTC", "Asia/Shanghai", "America/New_York"],
        "default": "Asia/Shanghai"
      }
    },
    "required": []
  }
}

sum Schema:
{
  "name": "sum",
  "description": "计算两个数字的和。支持整数和浮点数。",
  "parameters": {
    "type": "object",
    "properties": {
      "a": {
        "type": "number",
        "description": "第一个加数"
      },
      "b": {
        "type": "number",
        "description": "第二个加数"
      }
    },
    "required": ["a", "b"]
  }
}
```

---

## 六、函数实现的最佳实践

### 6.1 参数验证

```javascript
function goodFunction(param) {
  // ✓ 总是验证参数类型
  if (typeof param !== 'string') {
    throw new Error('param must be a string')
  }

  // ✓ 验证参数值的有效性
  if (param.length === 0) {
    throw new Error('param cannot be empty')
  }

  // 执行实际逻辑
  return param.toUpperCase()
}
```

### 6.2 错误处理

```javascript
function goodFunction() {
  try {
    // 可能出错的操作
    const result = riskyOperation()
    return result
  } catch (error) {
    // ✓ 抛出清晰的错误信息
    throw new Error(`操作失败: ${error.message}`)
  }
}
```

### 6.3 返回值格式

```javascript
// ✓ 返回清晰、一致的格式
function getWeather(city) {
  return {
    city: city,
    temperature: 25,
    weather: '晴天',
    humidity: 60,
  }
}

// ✓ 或者返回格式化的字符串
function getWeatherString(city) {
  return `${city}当前温度 25°C,晴天,湿度 60%`
}
```

---

## 七、学习检查清单

完成以下所有项目,说明你已掌握本节内容:

### 第一层:函数实现

- [ ] 实现了 getTime 函数,支持不同时区
- [ ] 实现了 sum 函数,支持数字相加
- [ ] 函数包含参数验证
- [ ] 函数包含错误处理

### 第二层:Schema 定义

- [ ] 为 getTime 定义了正确的 Schema
- [ ] 为 sum 定义了正确的 Schema
- [ ] Schema 的 name 与函数名一致
- [ ] Schema 的 parameters 与函数参数一致

### 第三层:代码组织

- [ ] 创建了合理的目录结构
- [ ] 分离了函数实现和 Schema 定义
- [ ] 编写了测试代码
- [ ] 所有测试都能通过

---

## 八、实践作业

### 作业 1: 实现 multiply 函数

**要求**:
- 功能: 计算两个数的乘积
- 参数: `a` 和 `b` (必填,number 类型)
- 返回: 乘积结果
- 包含参数验证和错误处理
- 编写对应的 Schema

### 作业 2: 实现 formatText 函数

**要求**:
- 功能: 格式化文本
- 参数:
  - `text` (必填,string): 要格式化的文本
  - `format` (必填,enum): 格式类型 (`uppercase`、`lowercase`、`capitalize`)
- 返回: 格式化后的文本
- 编写对应的 Schema

### 作业 3: 实现 getRandomNumber 函数

**要求**:
- 功能: 生成指定范围的随机数
- 参数:
  - `min` (必填,number): 最小值
  - `max` (必填,number): 最大值
  - `integer` (可选,boolean): 是否返回整数,默认 true
- 返回: 随机数
- 包含边界验证(min 必须小于 max)
- 编写对应的 Schema

---

## 九、常见问题

### Q1: 函数名必须和 Schema 的 name 完全一致吗?

**答**: 不是必须,但**强烈建议**一致:

```javascript
// ✓ 推荐:名称一致,清晰易懂
function sum(a, b) { }
const sumSchema = { name: 'sum', ... }

// ✗ 不推荐:名称不一致,容易混淆
function calculateSum(a, b) { }
const sumSchema = { name: 'sum', ... }
```

### Q2: 参数验证是必须的吗?

**答**: 不是必须,但**强烈推荐**:

- AI 可能传错类型
- 用户可能直接调用函数测试
- 参数验证让函数更健壮

```javascript
// ✓ 有验证:安全
function sum(a, b) {
  if (typeof a !== 'number') throw new Error('a must be number')
  return a + b
}

// ✗ 无验证:危险
function sum(a, b) {
  return a + b  // 如果 a 是字符串,结果可能出错
}
```

### Q3: Schema 中的 default 会自动应用吗?

**答**: 不会自动应用,`default` 只是提示作用:

```javascript
// Schema 中定义了 default
parameters: {
  properties: {
    timezone: {
      type: 'string',
      default: 'Asia/Shanghai'  // 这只是说明,不会自动应用
    }
  }
}

// 实际函数需要自己处理默认值
function getTime(timezone = 'Asia/Shanghai') {  // ✓ 手动设置默认值
  // ...
}
```

---

## 十、下一步学习方向

完成本节后,你已经实现了基础函数和 Schema。接下来你将:

1. **Step 31**: 让模型根据内容自动调用函数
2. **Step 32**: 调试 function_call → arguments 的 JSON 化
3. **Step 33**: 加入结构化返回(zod 也可以)
4. **Step 34**: 做一个"天气查询"demo
5. **Step 35**: 整理文档

---

**记住: 函数实现要健壮,Schema 定义要准确,两者保持一致是关键。**
