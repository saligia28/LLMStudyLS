# Step 30: Function Calling｜写两个最小函数: getTime / sum

## 学习目标

这个任务的本质是回答一个核心问题:**如何实现真正可执行的函数,并定义对应的 Function Schema**。

通过本教程,你将:

1. 学习 AI-backend 项目中的函数实现规范
2. 理解函数实现和 Schema 定义的对应关系
3. 掌握函数参数验证和错误处理的企业级实践
4. 学会编写可测试、可维护的函数代码

> **实战项目**: 本教程直接使用 AI-backend 项目中的真实函数代码,展示生产级的实现标准。

---

## 一、AI-backend 的函数组织结构

### 1.1 目录结构

```
AI-backend/
├── functions/                 # 函数实现目录
│   ├── getTime.js            # 时间函数(✓ 已实现)
│   ├── sum.js                # 求和函数(✓ 已实现)
│   └── index.js              # 统一导出(待创建)
│
├── schemas/                   # Schema 定义目录
│   ├── getTime.schema.js     # 时间函数 Schema
│   ├── sum.schema.js         # 求和函数 Schema
│   └── index.js              # 统一导出
│
└── src/
    ├── adapters/             # AI 适配器
    ├── services/
    │   └── ai.service.js     # 调用这些函数
    └── ...
```

### 1.2 函数与 Schema 的关系

```
┌─────────────────────────────────────────────────────────────┐
│         Function Schema vs 实际函数的关系                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Schema (给 AI 看的"说明书")                                 │
│   ┌─────────────────────────────────────────────────┐       │
│   │  schemas/getTime.schema.js                     │       │
│   │  {                                              │       │
│   │    name: "getTime",                            │       │
│   │    description: "获取指定时区的当前时间",        │       │
│   │    parameters: {                               │       │
│   │      timezone: { type: "string", ... }         │       │
│   │    }                                           │       │
│   │  }                                             │       │
│   └─────────────────────────────────────────────────┘       │
│                         ↓ 对应                              │
│   Implementation (真正执行的代码)                             │
│   ┌─────────────────────────────────────────────────┐       │
│   │  functions/getTime.js                          │       │
│   │  export function getTime(timezone) {           │       │
│   │    // 参数验证                                   │       │
│   │    // 业务逻辑                                   │       │
│   │    // 返回结果                                   │       │
│   │    return formattedTime                        │       │
│   │  }                                             │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   关键原则:                                                  │
│   - 函数名必须一致 (getTime ↔ "getTime")                     │
│   - 参数定义必须匹配                                          │
│   - 功能描述必须准确                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、实战案例 1: getTime 函数

### 2.1 需求分析

**功能**: 获取指定时区的当前时间
**参数**: `timezone` (可选,默认 `Asia/Shanghai`)
**返回**: 格式化的时间字符串
**支持时区**: UTC, Asia/Shanghai, America/New_York

### 2.2 查看 AI-backend 的实现

**文件路径**: `/Users/jianglin/Desktop/backend/AI-backend/functions/getTime.js`

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

// 测试函数(自测试模式)
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(getTime()) // 默认时区
  console.log(getTime('UTC')) // UTC 时区
  console.log(getTime('America/New_York')) // 纽约时区
}
```

### 2.3 代码实现要点解析

```
┌─────────────────────────────────────────────────────────────┐
│              getTime 函数实现要点                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   1. 参数默认值处理                                           │
│      timezone = 'Asia/Shanghai'                            │
│      ↑ JavaScript 原生默认参数,优雅且高效                     │
│                                                             │
│   2. 使用 Intl API (国际化标准)                              │
│      const formatter = new Intl.DateTimeFormat()           │
│      ↑ 浏览器/Node.js 原生支持,无需第三方库                   │
│      ↑ 自动处理夏令时、时区转换等复杂情况                      │
│                                                             │
│   3. 完整的错误处理                                          │
│      try { ... } catch (error) {                           │
│        throw new Error(`获取时间失败: ${error.message}`)     │
│      }                                                     │
│      ↑ 捕获异常,包装清晰的错误信息                            │
│                                                             │
│   4. 自测试模式 (非常实用!)                                   │
│      if (import.meta.url === `file://${process.argv[1]}`)  │
│      ↑ 直接运行文件时自动执行测试                             │
│      ↑ 作为模块导入时不执行                                  │
│                                                             │
│   5. 返回格式化字符串(而非对象)                               │
│      return `当前时间 (${timezone}): ${formattedTime}`      │
│      ↑ AI 更容易理解和生成自然语言回复                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.4 对应的 Function Schema

**文件路径**: `/Users/jianglin/Desktop/backend/AI-backend/schemas/getTime.schema.js`

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

### 2.5 Schema 与实现的对应关系

| 元素 | Schema 定义 | 函数实现 | 说明 |
|------|------------|---------|------|
| 函数名 | `name: 'getTime'` | `function getTime()` | 必须完全一致 |
| 参数名 | `timezone` | `timezone = 'Asia/Shanghai'` | 名称一致 |
| 参数类型 | `type: 'string'` | 字符串参数 | 类型匹配 |
| 可选性 | `required: []` | 有默认值 | 都是可选参数 |
| 枚举值 | `enum: [...]` | try-catch 处理无效值 | Schema 限制 + 代码容错 |

### 2.6 测试 getTime 函数

```bash
# 进入 AI-backend 项目
cd /Users/jianglin/Desktop/backend/AI-backend

# 直接运行函数文件(触发自测试)
node functions/getTime.js
```

**预期输出**:
```
当前时间 (Asia/Shanghai): 2024-01-27 14:30:45
当前时间 (UTC): 2024-01-27 06:30:45
当前时间 (America/New_York): 2024-01-27 01:30:45
```

---

## 三、实战案例 2: sum 函数

### 3.1 需求分析

**功能**: 计算两个数的和
**参数**: `a` 和 `b` (都是必填)
**返回**: 两数之和
**验证**: 必须是数字类型,不能是 NaN

### 3.2 查看 AI-backend 的实现

**文件路径**: `/Users/jianglin/Desktop/backend/AI-backend/functions/sum.js`

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
  console.log('sum(10, 20) =', sum(10, 20)) // 30
  console.log('sum(-5, 5) =', sum(-5, 5)) // 0
  console.log('sum(3.14, 2.86) =', sum(3.14, 2.86)) // 6

  // 测试错误处理
  try {
    sum('10', 20) // 应该抛出错误
  } catch (error) {
    console.log('错误捕获:', error.message)
  }
}
```

### 3.3 代码实现要点解析

```
┌─────────────────────────────────────────────────────────────┐
│              sum 函数实现要点                                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   1. 严格的类型检查                                           │
│      typeof a !== 'number'                                 │
│      ↑ AI 可能传错类型(如字符串 "10")                        │
│      ↑ 必须在函数入口处验证                                  │
│                                                             │
│   2. NaN 检查                                               │
│      isNaN(a) || isNaN(b)                                  │
│      ↑ NaN 是 number 类型,但不是有效数字                     │
│      ↑ 需要额外检查                                          │
│                                                             │
│   3. 清晰的错误信息                                          │
│      throw new Error('参数必须是数字类型')                   │
│      ↑ 告诉调用者具体哪里错了                                │
│      ↑ 便于调试和日志记录                                    │
│                                                             │
│   4. 简单的业务逻辑                                          │
│      const result = a + b                                  │
│      ↑ 保持函数简单,专注核心功能                             │
│                                                             │
│   5. 完整的测试覆盖                                          │
│      • 正常情况: 正整数、负数、浮点数                        │
│      • 异常情况: 错误类型、NaN                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.4 对应的 Function Schema

**文件路径**: `/Users/jianglin/Desktop/backend/AI-backend/schemas/sum.schema.js`

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
    required: ['a', 'b'], // 两个参数都是必填的
  },
}
```

### 3.5 测试 sum 函数

```bash
node functions/sum.js
```

**预期输出**:
```
sum(10, 20) = 30
sum(-5, 5) = 0
sum(3.14, 2.86) = 6
错误捕获: 参数必须是数字类型
```

---

## 四、企业级函数实现模式

### 4.1 函数实现的标准流程

```javascript
export function functionName(param1, param2) {
  // ========== 第 1 步: 参数验证 ==========
  if (typeof param1 !== 'expectedType') {
    throw new Error('param1 类型错误')
  }

  // ========== 第 2 步: 业务逻辑 ==========
  try {
    const result = doBusinessLogic(param1, param2)

    // ========== 第 3 步: 返回值验证 ==========
    if (!isValidResult(result)) {
      throw new Error('结果验证失败')
    }

    return result
  } catch (error) {
    // ========== 第 4 步: 错误处理 ==========
    throw new Error(`函数执行失败: ${error.message}`)
  }
}
```

### 4.2 AI-backend 的设计原则

1. **职责单一**: 每个函数只做一件事
2. **参数验证**: 永远不信任输入
3. **错误清晰**: 错误信息要能定位问题
4. **可测试性**: 提供自测试入口
5. **文档完整**: JSDoc 注释说明用途

### 4.3 为什么要严格验证参数?

```
┌─────────────────────────────────────────────────────────────┐
│         为什么 AI-backend 要严格验证参数?                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   1. AI 不保证类型正确                                        │
│      用户说: "帮我算 10 加 20"                                │
│      AI 可能返回: { a: "10", b: "20" }  ← 字符串!            │
│                                                             │
│   2. JSON 解析可能失败                                       │
│      arguments: '{"a": 10, b: 20}'  ← 缺引号,无效 JSON       │
│                                                             │
│   3. 防止运行时错误                                          │
│      sum("10", 20) → "1020"  ← 字符串拼接,不是求和!          │
│                                                             │
│   4. 提供清晰的错误反馈                                       │
│      有验证: "参数必须是数字类型"  ← 明确问题                 │
│      无验证: "NaN"                   ← 不知道哪里错           │
│                                                             │
│   5. 生产环境的稳定性                                         │
│      验证不只是为了调试,更是为了系统健壮性                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 五、在 AI-backend 架构中使用函数

### 5.1 函数调用流程

```
User Request
     ↓
Controller (chat.controller.js)
     ↓
Validator (chatValidator.js) - 验证 HTTP 请求
     ↓
Service (ai.service.js) - 调用 AI Provider
     ↓
Adapter (deepseek.adapter.js) - 发送 functions 参数
     ↓
AI Provider - 返回 function_call
     ↓
【在这里解析并执行 getTime/sum 函数】
     ↓
返回结果给 AI,生成最终回复
```

### 5.2 如何在 AIService 中集成函数

虽然 AI-backend 目前没有完整的函数执行器,但我们可以看到架构如何支持:

```javascript
// 在 ai.service.js 中
async chat(messages, options = {}) {
  const { functions, ...restOptions } = options

  // 传递 functions 给 Adapter
  const adapter = factory.get(provider)
  const result = await adapter.chat(messages, {
    ...restOptions,
    functions: functions,  // ← 这里传入 Function Schemas
  })

  return result
}
```

### 5.3 Adapter 如何处理 functions

```javascript
// 在 deepseek.adapter.js 中
async chat(messages, options = {}) {
  const { functions, ...restOptions } = options

  const response = await this.client.chat.completions.create({
    model: this.model,
    messages: this.formatMessages(messages),
    functions: functions,  // ← 传给 DeepSeek API
    ...restOptions,
  })

  return this.formatResponse(response)
}
```

---

## 六、实践练习

### 练习 1: 在本地测试 AI-backend 函数

```bash
# 1. 进入项目目录
cd /Users/jianglin/Desktop/backend/AI-backend

# 2. 测试 getTime
node functions/getTime.js

# 3. 测试 sum
node functions/sum.js

# 4. 思考: 这种自测试模式有什么好处?
```

### 练习 2: 实现 multiply 函数

在 AI-backend 项目中创建新函数:

**要求**:
1. 创建 `functions/multiply.js`
2. 实现两数相乘功能
3. 包含完整的参数验证
4. 实现自测试模式
5. 创建对应的 `schemas/multiply.schema.js`

**参考 sum.js 的实现**。

### 练习 3: 实现 getWeather 函数(模拟数据)

创建一个模拟的天气查询函数:

**要求**:
1. 创建 `functions/getWeather.js`
2. 使用内存数据库(对象)存储几个城市的天气
3. 支持城市参数
4. 如果城市不存在,抛出清晰的错误
5. 创建对应的 Schema

---

## 七、学习检查清单

### 第一层:代码理解

- [ ] 阅读了 AI-backend 的 getTime.js 代码
- [ ] 阅读了 AI-backend 的 sum.js 代码
- [ ] 理解了自测试模式的实现
- [ ] 理解了参数验证的必要性

### 第二层:Schema 对应

- [ ] 理解了 getTime Schema 与函数实现的对应
- [ ] 理解了 sum Schema 与函数实现的对应
- [ ] 知道如何设计 Schema 的 required 字段
- [ ] 知道如何使用 enum 限制参数值

### 第三层:实践能力

- [ ] 成功运行了 getTime 函数测试
- [ ] 成功运行了 sum 函数测试
- [ ] 尝试实现了 multiply 函数
- [ ] 理解了 AI-backend 的函数调用流程

---

## 八、常见问题

### Q1: 为什么 AI-backend 不用 Zod 验证?

**答**: AI-backend 在函数层使用原生验证,在 HTTP 层使用 Joi。不同层次用不同工具:
- **函数层**: 轻量级原生验证,快速失败
- **HTTP 层**: Joi 验证请求体,功能更全面

后续 Step 33 会展示如何引入 Zod 增强类型安全。

### Q2: 自测试模式的原理是什么?

**答**:
```javascript
if (import.meta.url === `file://${process.argv[1]}`) {
  // 这段代码只在直接运行文件时执行
}
```

- `import.meta.url`: 当前模块的 URL
- `process.argv[1]`: 被执行的文件路径
- 如果两者相等,说明是直接运行,而非被导入

### Q3: 函数应该返回对象还是字符串?

**答**: 看场景:
- **返回字符串**: AI 容易理解,适合简单信息(如 getTime)
- **返回对象**: 结构化数据,适合复杂信息(如 getWeather)

AI-backend 的 getTime 返回字符串是简化设计,实际项目中可以返回对象。

---

## 九、下一步

完成本节后,你已经掌握了企业级函数实现。接下来:

1. **Step 31**: 让模型根据内容自动调用函数
2. **Step 32**: 调试 function_call → arguments 的 JSON 化
3. **Step 33**: 使用 Joi/Zod 增强验证
4. **Step 34**: 构建完整的天气查询 API
5. **Step 35**: 总结企业级最佳实践

---

**记住: 函数实现要健壮,参数验证是第一要务。AI-backend 的代码展示了如何在生产环境中实现可靠的函数。**
