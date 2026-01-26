# Step 32: Function Calling｜调试 function_call → arguments 的 JSON 化

## 学习目标

这个任务的本质是回答一个核心问题:**如何正确解析和处理 AI 返回的函数参数,避免常见的 JSON 解析错误**。

通过本教程,你将:

1. 理解 arguments 字段的数据格式和陷阱
2. 掌握安全的 JSON 解析方法
3. 学会处理各种边界情况和错误
4. 实现健壮的参数处理逻辑

---

## 一、核心认知:arguments 的真实面目

### 1.1 arguments 是什么?

```
┌─────────────────────────────────────────────────────────────┐
│         AI 返回的 function_call 格式                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   {                                                         │
│     role: "assistant",                                      │
│     content: null,                                          │
│     function_call: {                                        │
│       name: "sum",                 // ← 函数名(字符串)       │
│       arguments: "{\"a\":10,\"b\":20}"  // ← 参数(JSON 字符串!)│
│     }                                                       │
│   }                                                         │
│                                                             │
│   关键理解:                                                  │
│   ┌─────────────────────────────────────────────────┐       │
│   │  arguments 是 JSON 字符串,不是对象!              │       │
│   │                                                 │       │
│   │  ✗ 错误理解: arguments = { a: 10, b: 20 }       │       │
│   │  ✓ 正确理解: arguments = "{\"a\":10,\"b\":20}"  │       │
│   │                                                 │       │
│   │  必须使用 JSON.parse() 解析!                     │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 常见的错误用法

```javascript
// ❌ 错误 1: 直接当对象使用
const functionCall = assistantMessage.function_call
const a = functionCall.arguments.a  // ✗ undefined! (arguments 是字符串)

// ❌ 错误 2: 没有错误处理的解析
const args = JSON.parse(functionCall.arguments)  // ✗ 可能抛出异常

// ✓ 正确做法
let args
try {
  args = JSON.parse(functionCall.arguments)
  console.log(args.a, args.b)  // 10, 20
} catch (error) {
  console.error('参数解析失败:', error.message)
}
```

---

## 二、arguments 的各种形态

### 2.1 空参数

```javascript
// 场景:调用 getTime() 不传参数
{
  name: "getTime",
  arguments: "{}"  // ← 空对象的 JSON 字符串
}

// 解析
const args = JSON.parse("{}")  // {}
Object.values(args)  // [] (空数组)
```

### 2.2 单个参数

```javascript
// 场景:调用 getTime("UTC")
{
  name: "getTime",
  arguments: "{\"timezone\":\"UTC\"}"
}

// 解析
const args = JSON.parse('{"timezone":"UTC"}')  // { timezone: "UTC" }
Object.values(args)  // ["UTC"]
```

### 2.3 多个参数

```javascript
// 场景:调用 sum(10, 20)
{
  name: "sum",
  arguments: "{\"a\":10,\"b\":20}"
}

// 解析
const args = JSON.parse('{"a":10,"b":20}')  // { a: 10, b: 20 }
Object.values(args)  // [10, 20]
```

### 2.4 复杂参数

```javascript
// 场景:包含数组、对象的参数
{
  name: "searchProducts",
  arguments: "{\"keywords\":[\"手机\",\"华为\"],\"maxResults\":10}"
}

// 解析
const args = JSON.parse('{"keywords":["手机","华为"],"maxResults":10}')
// { keywords: ["手机", "华为"], maxResults: 10 }
```

---

## 三、实现安全的参数解析器

### 3.1 基础版本:带错误处理的解析

```javascript
/**
 * 解析函数参数
 * @param {string} argumentsJson - JSON 字符串
 * @returns {Object} 解析后的参数对象
 */
function parseArguments(argumentsJson) {
  // 1. 类型检查
  if (typeof argumentsJson !== 'string') {
    throw new Error('arguments 必须是字符串类型')
  }

  // 2. 空字符串处理
  if (argumentsJson.trim() === '') {
    return {}
  }

  // 3. JSON 解析
  try {
    const args = JSON.parse(argumentsJson)
    return args
  } catch (error) {
    throw new Error(`JSON 解析失败: ${error.message}`)
  }
}

// 测试
console.log(parseArguments('{}'))  // {}
console.log(parseArguments('{"a":10,"b":20}'))  // { a: 10, b: 20 }

try {
  parseArguments('invalid json')  // 抛出错误
} catch (error) {
  console.log('错误:', error.message)
}
```

### 3.2 增强版本:带验证的解析

```javascript
/**
 * 解析并验证函数参数
 * @param {string} argumentsJson - JSON 字符串
 * @param {Array} requiredParams - 必填参数列表
 * @returns {Object} 解析后的参数对象
 */
function parseAndValidateArguments(argumentsJson, requiredParams = []) {
  // 1. 解析 JSON
  let args
  try {
    args = JSON.parse(argumentsJson)
  } catch (error) {
    throw new Error(`参数解析失败: ${argumentsJson}`)
  }

  // 2. 验证必填参数
  for (const param of requiredParams) {
    if (!(param in args)) {
      throw new Error(`缺少必填参数: ${param}`)
    }
  }

  // 3. 验证参数不是 undefined 或 null
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null) {
      throw new Error(`参数 ${key} 的值无效`)
    }
  }

  return args
}

// 测试
try {
  // 正常情况
  const args1 = parseAndValidateArguments('{"a":10,"b":20}', ['a', 'b'])
  console.log('✓ 参数验证通过:', args1)

  // 缺少必填参数
  const args2 = parseAndValidateArguments('{"a":10}', ['a', 'b'])
} catch (error) {
  console.log('✗ 错误:', error.message)  // "缺少必填参数: b"
}
```

### 3.3 完整版本:参数解析器类

创建 `utils/argumentParser.js`:

```javascript
/**
 * 函数参数解析器
 */
export class ArgumentParser {
  /**
   * 解析 arguments 字符串
   * @param {string} argumentsJson - JSON 字符串
   * @returns {Object} 解析后的参数对象
   */
  static parse(argumentsJson) {
    // 类型检查
    if (typeof argumentsJson !== 'string') {
      throw new Error(`Expected string, got ${typeof argumentsJson}`)
    }

    // 处理空字符串
    if (argumentsJson.trim() === '') {
      return {}
    }

    // JSON 解析
    try {
      const args = JSON.parse(argumentsJson)

      // 确保解析结果是对象
      if (typeof args !== 'object' || args === null || Array.isArray(args)) {
        throw new Error('Parsed arguments must be an object')
      }

      return args
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON: ${argumentsJson}`)
      }
      throw error
    }
  }

  /**
   * 解析并验证参数
   * @param {string} argumentsJson - JSON 字符串
   * @param {Object} schema - 参数 Schema
   * @returns {Object} 解析后的参数对象
   */
  static parseAndValidate(argumentsJson, schema) {
    const args = this.parse(argumentsJson)

    // 验证必填参数
    const required = schema.parameters?.required || []
    for (const param of required) {
      if (!(param in args)) {
        throw new Error(`Missing required parameter: ${param}`)
      }
    }

    // 类型验证(简化版)
    const properties = schema.parameters?.properties || {}
    for (const [key, value] of Object.entries(args)) {
      const expectedType = properties[key]?.type
      if (expectedType) {
        const actualType = this.getJsonType(value)
        if (actualType !== expectedType) {
          throw new Error(
            `Parameter "${key}" should be ${expectedType}, got ${actualType}`
          )
        }
      }
    }

    return args
  }

  /**
   * 获取 JSON Schema 类型
   */
  static getJsonType(value) {
    if (value === null) return 'null'
    if (Array.isArray(value)) return 'array'
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'integer' : 'number'
    }
    if (typeof value === 'boolean') return 'boolean'
    if (typeof value === 'string') return 'string'
    if (typeof value === 'object') return 'object'
    return 'unknown'
  }

  /**
   * 转换为函数参数数组
   * @param {Object} args - 参数对象
   * @param {Array} paramNames - 参数名顺序
   * @returns {Array} 参数数组
   */
  static toArray(args, paramNames) {
    if (!paramNames || paramNames.length === 0) {
      return Object.values(args)
    }
    return paramNames.map(name => args[name])
  }
}
```

---

## 四、常见问题和解决方案

### 4.1 问题 1: 参数顺序错乱

```javascript
// 问题
const args = { b: 20, a: 10 }  // JSON 对象可能无序
Object.values(args)  // [20, 10] ← 顺序错了!

// 解决方案:指定参数顺序
const paramNames = ['a', 'b']
const orderedArgs = paramNames.map(name => args[name])  // [10, 20] ✓
```

### 4.2 问题 2: 类型不匹配

```javascript
// AI 可能返回字符串 "10" 而不是数字 10
{
  arguments: '{"a":"10","b":"20"}'  // ← 字符串!
}

// 解决方案:类型转换
function sum(a, b) {
  // 强制转换为数字
  const numA = Number(a)
  const numB = Number(b)

  if (isNaN(numA) || isNaN(numB)) {
    throw new Error('参数必须是有效数字')
  }

  return numA + numB
}
```

### 4.3 问题 3: 嵌套 JSON 字符串

```javascript
// 有时 AI 会返回嵌套的 JSON 字符串
{
  arguments: '"{\\\"a\\\":10,\\\"b\\\":20}"'  // ← 双重转义!
}

// 解决方案:循环解析
function safeParse(str) {
  let result = str
  while (typeof result === 'string') {
    try {
      result = JSON.parse(result)
    } catch {
      break
    }
  }
  return result
}
```

### 4.4 问题 4: 特殊字符处理

```javascript
// 参数包含特殊字符
{
  arguments: '{"text":"Hello\nWorld"}'  // ← 包含换行符
}

// JSON.parse 会正确处理转义字符
const args = JSON.parse('{"text":"Hello\\nWorld"}')
console.log(args.text)  // "Hello\nWorld" ✓
```

---

## 五、实践:改进函数执行器

### 5.1 集成参数解析器

更新 `utils/functionExecutor.js`:

```javascript
import { ArgumentParser } from './argumentParser.js'

/**
 * 通用函数执行器(增强版)
 */
export class FunctionExecutor {
  constructor(functions, schemas) {
    this.functions = functions  // { functionName: implementation }
    this.schemas = schemas      // { functionName: schema }
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
      throw new Error(`Function "${functionName}" not found`)
    }

    // 2. 获取对应的 Schema
    const schema = this.schemas[functionName]
    if (!schema) {
      throw new Error(`Schema for "${functionName}" not found`)
    }

    // 3. 解析并验证参数
    let args
    try {
      args = ArgumentParser.parseAndValidate(argumentsJson, schema)
      console.log(`✓ 参数解析成功:`, args)
    } catch (error) {
      throw new Error(`参数解析失败 [${functionName}]: ${error.message}`)
    }

    // 4. 获取参数顺序
    const paramNames = Object.keys(schema.parameters?.properties || {})

    // 5. 转换为数组并执行函数
    try {
      const func = this.functions[functionName]
      const argsArray = ArgumentParser.toArray(args, paramNames)
      const result = func(...argsArray)
      console.log(`✓ 函数执行成功:`, result)
      return result
    } catch (error) {
      throw new Error(`函数执行失败 [${functionName}]: ${error.message}`)
    }
  }
}
```

### 5.2 使用示例

```javascript
import { FunctionExecutor } from './utils/functionExecutor.js'
import { getTime } from './functions/getTime.js'
import { sum } from './functions/sum.js'
import { getTimeSchema } from './schemas/getTime.schema.js'
import { sumSchema } from './schemas/sum.schema.js'

const executor = new FunctionExecutor(
  {
    getTime: getTime,
    sum: sum,
  },
  {
    getTime: getTimeSchema,
    sum: sumSchema,
  }
)

// 测试
try {
  console.log('=== 测试 1: 正常调用 ===')
  const result1 = executor.execute('sum', '{"a":10,"b":20}')
  console.log('结果:', result1, '\n')

  console.log('=== 测试 2: 缺少参数 ===')
  const result2 = executor.execute('sum', '{"a":10}')
} catch (error) {
  console.log('错误:', error.message, '\n')
}

try {
  console.log('=== 测试 3: 类型错误 ===')
  const result3 = executor.execute('sum', '{"a":"hello","b":20}')
} catch (error) {
  console.log('错误:', error.message, '\n')
}
```

---

## 六、调试技巧

### 6.1 打印原始 arguments

```javascript
const functionCall = assistantMessage.function_call

console.log('原始 arguments (字符串):')
console.log(functionCall.arguments)
console.log('类型:', typeof functionCall.arguments)
console.log('长度:', functionCall.arguments.length)
```

### 6.2 分步解析

```javascript
const argumentsJson = functionCall.arguments

console.log('步骤 1: 原始字符串')
console.log(argumentsJson)

console.log('\n步骤 2: JSON 解析')
const args = JSON.parse(argumentsJson)
console.log(args)

console.log('\n步骤 3: 提取值')
console.log(Object.values(args))

console.log('\n步骤 4: 调用函数')
const result = sum(...Object.values(args))
console.log('结果:', result)
```

### 6.3 使用 JSON.stringify 查看

```javascript
// 查看解析后的对象结构
const args = JSON.parse(argumentsJson)
console.log(JSON.stringify(args, null, 2))

// 输出:
// {
//   "a": 10,
//   "b": 20
// }
```

---

## 七、学习检查清单

完成以下所有项目,说明你已掌握本节内容:

### 第一层:概念理解

- [ ] 理解 arguments 是 JSON 字符串,不是对象
- [ ] 知道必须使用 JSON.parse() 解析
- [ ] 理解解析可能失败,需要错误处理
- [ ] 知道参数顺序可能影响函数调用

### 第二层:实现能力

- [ ] 能够安全地解析 arguments
- [ ] 能够验证必填参数
- [ ] 能够处理解析错误
- [ ] 能够按正确顺序传递参数

### 第三层:调试能力

- [ ] 能够打印和检查原始 arguments
- [ ] 能够分步调试解析过程
- [ ] 能够定位参数解析错误
- [ ] 能够处理各种边界情况

---

## 八、常见问题

### Q1: 为什么 AI 不直接返回对象?

**答**: 因为 API 是基于 JSON 的,所有字段都必须是 JSON 兼容类型:

```javascript
// ✓ JSON 兼容(字符串)
{
  "arguments": "{\"a\":10,\"b\":20}"
}

// ✗ JSON 不兼容(不能直接嵌套对象)
{
  "arguments": { a: 10, b: 20 }  // ← 这不是标准 JSON
}
```

### Q2: 可以用 eval() 代替 JSON.parse() 吗?

**答**: **绝对不要使用 eval()**,非常危险:

```javascript
// ✗ 危险! 可能执行恶意代码
const args = eval('(' + argumentsJson + ')')

// ✓ 安全
const args = JSON.parse(argumentsJson)
```

---

## 九、下一步学习方向

完成本节后,你已经掌握了参数解析和验证。接下来你将:

1. **Step 33**: 加入结构化返回(zod 也可以)
2. **Step 34**: 做一个"天气查询"demo
3. **Step 35**: 整理文档

---

**记住: 永远不要相信未验证的输入,参数解析和验证是函数调用的安全基石。**
