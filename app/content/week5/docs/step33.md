# Step 33: Function Calling｜加入结构化返回 (使用 Zod)

## 学习目标

这个任务的本质是回答一个核心问题:**如何使用类型验证库 (Zod) 来确保函数参数和返回值的类型安全**。

通过本教程,你将:

1. 理解为什么需要结构化验证
2. 学习 Zod 的基本使用方法
3. 为函数参数添加 Zod Schema 验证
4. 为函数返回值添加类型约束
5. 实现端到端的类型安全

---

## 一、核心认知:为什么需要 Zod?

### 1.1 手动验证 vs Zod 验证

```
┌─────────────────────────────────────────────────────────────┐
│         手动验证 vs Zod 验证                                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   手动验证 (繁琐且容易出错)                                    │
│   ┌─────────────────────────────────────────────────┐       │
│   │  function sum(a, b) {                           │       │
│   │    // 类型检查                                   │       │
│   │    if (typeof a !== 'number') {                 │       │
│   │      throw new Error('a must be number')        │       │
│   │    }                                            │       │
│   │    if (typeof b !== 'number') {                 │       │
│   │      throw new Error('b must be number')        │       │
│   │    }                                            │       │
│   │    // 值检查                                     │       │
│   │    if (isNaN(a) || isNaN(b)) {                  │       │
│   │      throw new Error('Invalid number')          │       │
│   │    }                                            │       │
│   │    return a + b                                 │       │
│   │  }                                              │       │
│   │                                                 │       │
│   │  问题:                                          │       │
│   │  - 代码冗长,重复性高                            │       │
│   │  - 容易遗漏边界情况                              │       │
│   │  - 错误信息不统一                                │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   Zod 验证 (简洁且类型安全)                                   │
│   ┌─────────────────────────────────────────────────┐       │
│   │  import { z } from 'zod'                        │       │
│   │                                                 │       │
│   │  const SumSchema = z.object({                   │       │
│   │    a: z.number(),                               │       │
│   │    b: z.number(),                               │       │
│   │  })                                             │       │
│   │                                                 │       │
│   │  function sum(params) {                         │       │
│   │    const { a, b } = SumSchema.parse(params)     │       │
│   │    return a + b                                 │       │
│   │  }                                              │       │
│   │                                                 │       │
│   │  优势:                                          │       │
│   │  ✓ 代码简洁,声明式                              │       │
│   │  ✓ 自动类型推断                                  │       │
│   │  ✓ 统一的错误处理                                │       │
│   │  ✓ 支持复杂类型验证                              │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、Zod 快速入门

### 2.1 安装 Zod

```bash
npm install zod
```

### 2.2 基本用法

```javascript
import { z } from 'zod'

// 定义 Schema
const UserSchema = z.object({
  name: z.string(),
  age: z.number(),
  email: z.string().email(),
})

// 验证数据
const validData = {
  name: 'Alice',
  age: 25,
  email: 'alice@example.com',
}

const result = UserSchema.parse(validData)
console.log(result)  // { name: 'Alice', age: 25, email: 'alice@example.com' }

// 验证失败会抛出错误
const invalidData = {
  name: 'Bob',
  age: 'twenty',  // ✗ 应该是数字
  email: 'invalid-email',  // ✗ 不是有效邮箱
}

try {
  UserSchema.parse(invalidData)
} catch (error) {
  console.log(error.errors)
}
```

### 2.3 常用类型

```javascript
import { z } from 'zod'

// 基础类型
z.string()       // 字符串
z.number()       // 数字
z.boolean()      // 布尔值
z.date()         // 日期
z.undefined()    // undefined
z.null()         // null
z.any()          // 任意类型

// 字符串验证
z.string().min(3)                    // 最少 3 个字符
z.string().max(10)                   // 最多 10 个字符
z.string().email()                   // 邮箱格式
z.string().url()                     // URL 格式
z.string().uuid()                    // UUID 格式
z.string().regex(/^\d+$/)            // 正则匹配

// 数字验证
z.number().min(0)                    // 最小值
z.number().max(100)                  // 最大值
z.number().int()                     // 整数
z.number().positive()                // 正数
z.number().negative()                // 负数

// 数组
z.array(z.string())                  // 字符串数组
z.array(z.number()).min(1)           // 至少 1 个元素
z.array(z.number()).max(5)           // 最多 5 个元素

// 对象
z.object({
  name: z.string(),
  age: z.number(),
})

// 可选字段
z.object({
  name: z.string(),
  age: z.number().optional(),        // 可选
  email: z.string().nullable(),      // 可以为 null
})

// 枚举
z.enum(['pending', 'success', 'error'])

// 联合类型
z.union([z.string(), z.number()])    // 字符串或数字

// 默认值
z.string().default('default value')
z.number().default(0)
```

---

## 三、为函数添加 Zod 验证

### 3.1 改造 sum 函数

创建 `functions/sum.zod.js`:

```javascript
import { z } from 'zod'

// 定义参数 Schema
export const SumParamsSchema = z.object({
  a: z.number().describe('第一个加数'),
  b: z.number().describe('第二个加数'),
})

// 定义返回值 Schema
export const SumResultSchema = z.number()

/**
 * 计算两个数的和 (Zod 版本)
 * @param {Object} params - 参数对象
 * @returns {number} 两数之和
 */
export function sum(params) {
  // 验证参数
  const { a, b } = SumParamsSchema.parse(params)

  // 执行计算
  const result = a + b

  // 验证返回值
  return SumResultSchema.parse(result)
}

// 测试
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('测试 1: 正常调用')
  console.log(sum({ a: 10, b: 20 }))  // 30

  console.log('\n测试 2: 参数类型错误')
  try {
    sum({ a: '10', b: 20 })
  } catch (error) {
    console.log('错误:', error.errors[0].message)
  }

  console.log('\n测试 3: 缺少参数')
  try {
    sum({ a: 10 })
  } catch (error) {
    console.log('错误:', error.errors[0].message)
  }
}
```

### 3.2 改造 getTime 函数

创建 `functions/getTime.zod.js`:

```javascript
import { z } from 'zod'

// 定义参数 Schema
export const GetTimeParamsSchema = z.object({
  timezone: z
    .enum(['UTC', 'Asia/Shanghai', 'America/New_York'])
    .default('Asia/Shanghai')
    .describe('时区标识符'),
})

// 定义返回值 Schema
export const GetTimeResultSchema = z.string()

/**
 * 获取当前时间 (Zod 版本)
 * @param {Object} params - 参数对象
 * @returns {string} 格式化的时间字符串
 */
export function getTime(params = {}) {
  // 验证参数 (使用 .catch 提供默认值)
  const validatedParams = GetTimeParamsSchema.catch({
    timezone: 'Asia/Shanghai',
  }).parse(params)

  const { timezone } = validatedParams

  try {
    const now = new Date()

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

    const result = `当前时间 (${timezone}): ${formattedTime}`

    // 验证返回值
    return GetTimeResultSchema.parse(result)
  } catch (error) {
    throw new Error(`获取时间失败: ${error.message}`)
  }
}
```

---

## 四、Zod Schema 与 Function Schema 的转换

### 4.1 从 Zod 生成 Function Schema

创建 `utils/zodToFunctionSchema.js`:

```javascript
import { z } from 'zod'

/**
 * 将 Zod Schema 转换为 OpenAI Function Schema
 * @param {string} name - 函数名
 * @param {string} description - 函数描述
 * @param {z.ZodObject} zodSchema - Zod Schema
 * @returns {Object} Function Schema
 */
export function zodToFunctionSchema(name, description, zodSchema) {
  const shape = zodSchema.shape

  const properties = {}
  const required = []

  for (const [key, schema] of Object.entries(shape)) {
    const fieldSchema = convertZodType(schema)
    properties[key] = fieldSchema

    // 检查是否必填
    if (!schema.isOptional()) {
      required.push(key)
    }
  }

  return {
    name,
    description,
    parameters: {
      type: 'object',
      properties,
      required,
    },
  }
}

/**
 * 转换 Zod 类型到 JSON Schema 类型
 */
function convertZodType(zodType) {
  const typeName = zodType._def.typeName

  const result = {}

  // 获取描述
  if (zodType.description) {
    result.description = zodType.description
  }

  // 转换类型
  switch (typeName) {
    case 'ZodString':
      result.type = 'string'
      break
    case 'ZodNumber':
      result.type = 'number'
      break
    case 'ZodBoolean':
      result.type = 'boolean'
      break
    case 'ZodArray':
      result.type = 'array'
      result.items = convertZodType(zodType._def.type)
      break
    case 'ZodObject':
      result.type = 'object'
      // 递归处理对象属性
      break
    case 'ZodEnum':
      result.type = 'string'
      result.enum = zodType._def.values
      break
    case 'ZodDefault':
      // 处理默认值
      const innerType = convertZodType(zodType._def.innerType)
      Object.assign(result, innerType)
      result.default = zodType._def.defaultValue()
      break
    default:
      result.type = 'string'
  }

  return result
}
```

### 4.2 使用示例

创建 `schemas/sum.zod.schema.js`:

```javascript
import { SumParamsSchema } from '../functions/sum.zod.js'
import { zodToFunctionSchema } from '../utils/zodToFunctionSchema.js'

export const sumZodSchema = zodToFunctionSchema(
  'sum',
  '计算两个数字的和。支持整数和浮点数。',
  SumParamsSchema
)

// 验证生成的 Schema
console.log(JSON.stringify(sumZodSchema, null, 2))
```

输出:

```json
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

## 五、集成到函数执行器

### 5.1 更新函数执行器

创建 `utils/functionExecutor.zod.js`:

```javascript
import { ZodError } from 'zod'

/**
 * 支持 Zod 的函数执行器
 */
export class ZodFunctionExecutor {
  constructor(functions) {
    // functions = { functionName: { fn, paramsSchema, resultSchema } }
    this.functions = functions
  }

  /**
   * 执行函数
   * @param {string} functionName - 函数名
   * @param {string} argumentsJson - 参数 JSON 字符串
   * @returns {any} 函数执行结果
   */
  execute(functionName, argumentsJson) {
    // 1. 检查函数是否存在
    const funcDef = this.functions[functionName]
    if (!funcDef) {
      throw new Error(`Function "${functionName}" not found`)
    }

    // 2. 解析 JSON
    let params
    try {
      params = JSON.parse(argumentsJson)
    } catch (error) {
      throw new Error(`Invalid JSON: ${argumentsJson}`)
    }

    // 3. 验证参数 (使用 Zod)
    try {
      const validatedParams = funcDef.paramsSchema.parse(params)
      console.log(`✓ 参数验证通过:`, validatedParams)

      // 4. 执行函数
      const result = funcDef.fn(validatedParams)
      console.log(`✓ 函数执行成功:`, result)

      // 5. 验证返回值 (如果提供了 resultSchema)
      if (funcDef.resultSchema) {
        funcDef.resultSchema.parse(result)
        console.log(`✓ 返回值验证通过`)
      }

      return result
    } catch (error) {
      if (error instanceof ZodError) {
        const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        throw new Error(`验证失败: ${messages.join('; ')}`)
      }
      throw error
    }
  }
}
```

### 5.2 使用示例

创建 `test-zod.js`:

```javascript
import { sum, SumParamsSchema, SumResultSchema } from './functions/sum.zod.js'
import {
  getTime,
  GetTimeParamsSchema,
  GetTimeResultSchema,
} from './functions/getTime.zod.js'
import { ZodFunctionExecutor } from './utils/functionExecutor.zod.js'

// 创建执行器
const executor = new ZodFunctionExecutor({
  sum: {
    fn: sum,
    paramsSchema: SumParamsSchema,
    resultSchema: SumResultSchema,
  },
  getTime: {
    fn: getTime,
    paramsSchema: GetTimeParamsSchema,
    resultSchema: GetTimeResultSchema,
  },
})

// 测试
console.log('=== 测试 1: 正常调用 ===')
try {
  const result = executor.execute('sum', '{"a":10,"b":20}')
  console.log('最终结果:', result, '\n')
} catch (error) {
  console.log('错误:', error.message, '\n')
}

console.log('=== 测试 2: 类型错误 ===')
try {
  const result = executor.execute('sum', '{"a":"hello","b":20}')
} catch (error) {
  console.log('错误:', error.message, '\n')
}

console.log('=== 测试 3: 缺少参数 ===')
try {
  const result = executor.execute('sum', '{"a":10}')
} catch (error) {
  console.log('错误:', error.message, '\n')
}

console.log('=== 测试 4: 枚举验证 ===')
try {
  const result = executor.execute('getTime', '{"timezone":"Invalid/Timezone"}')
} catch (error) {
  console.log('错误:', error.message, '\n')
}
```

---

## 六、Zod 的高级用法

### 6.1 自定义验证逻辑

```javascript
import { z } from 'zod'

// 自定义验证:确保两个数都是正数
const PositiveSumSchema = z
  .object({
    a: z.number(),
    b: z.number(),
  })
  .refine(
    data => data.a > 0 && data.b > 0,
    {
      message: '两个数必须都是正数',
    }
  )

// 测试
try {
  PositiveSumSchema.parse({ a: -5, b: 10 })
} catch (error) {
  console.log(error.errors[0].message)  // "两个数必须都是正数"
}
```

### 6.2 转换数据

```javascript
// 自动转换字符串为数字
const FlexibleSumSchema = z.object({
  a: z.string().transform(val => Number(val)),
  b: z.string().transform(val => Number(val)),
})

const result = FlexibleSumSchema.parse({ a: '10', b: '20' })
console.log(result)  // { a: 10, b: 20 }
```

### 6.3 条件验证

```javascript
const ConditionalSchema = z.object({
  type: z.enum(['celsius', 'fahrenheit']),
  value: z.number(),
}).refine(
  data => {
    if (data.type === 'celsius') {
      return data.value >= -273.15  // 绝对零度
    }
    return data.value >= -459.67  // 华氏度绝对零度
  },
  {
    message: '温度值低于绝对零度',
  }
)
```

---

## 七、学习检查清单

完成以下所有项目,说明你已掌握本节内容:

### 第一层:Zod 基础

- [ ] 理解 Zod 的作用和优势
- [ ] 掌握基本类型定义 (string、number、boolean 等)
- [ ] 能够定义对象 Schema
- [ ] 能够使用 .parse() 验证数据

### 第二层:函数集成

- [ ] 为函数参数添加了 Zod Schema
- [ ] 为函数返回值添加了 Zod Schema
- [ ] 能够处理 Zod 验证错误
- [ ] 实现了 Zod 函数执行器

### 第三层:高级应用

- [ ] 能够将 Zod Schema 转换为 Function Schema
- [ ] 能够使用自定义验证逻辑
- [ ] 能够使用数据转换
- [ ] 理解 Zod 错误处理机制

---

## 八、常见问题

### Q1: Zod 会影响性能吗?

**答**: 会有轻微影响,但换来的是类型安全:

- 开发环境:完全值得,帮助快速发现错误
- 生产环境:影响很小,可以通过缓存 Schema 优化

### Q2: 必须使用 Zod 吗?

**答**: 不是必须,但强烈推荐:

- 小项目:手动验证也可以
- 中大项目:Zod 能大幅提升代码质量

### Q3: Zod 和 TypeScript 的关系?

**答**: Zod 可以和 TypeScript 完美配合:

```typescript
import { z } from 'zod'

const UserSchema = z.object({
  name: z.string(),
  age: z.number(),
})

// 自动推断 TypeScript 类型
type User = z.infer<typeof UserSchema>
// 等价于: { name: string; age: number }
```

---

## 九、下一步学习方向

完成本节后,你已经掌握了使用 Zod 进行类型验证。接下来你将:

1. **Step 34**: 做一个"天气查询"demo
2. **Step 35**: 整理文档

---

**记住: Zod 让你的函数调用更安全、更可靠,是构建生产级应用的必备工具。**
