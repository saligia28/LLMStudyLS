# Step 30: Function Calling｜写两个最小函数：getTime / sum

## 学习目标

这一节回答的核心问题是：**一个“能被模型调用”的函数，代码层应该长什么样？**

完成后你应该能：

1. 写出最小可执行函数 `getTime` 和 `sum`
2. 给每个函数配套 schema
3. 理解函数实现和 schema 的一一对应关系
4. 为下一节“自动调用”准备好可复用工具集

> **本节默认模型**：示例仍默认给 `deepseek-chat` 使用，但本节重点是函数和 schema 本身，不依赖某个特定 provider。

---

## 一、先定函数边界

这两个练习函数故意选得很小：

- `getTime`：展示“查询型工具”
- `sum`：展示“确定性计算工具”

它们的价值不是业务复杂，而是足够清楚地回答三个问题：

1. 工具实际代码怎么写
2. 参数校验放在哪一层
3. schema 怎么跟真实函数对齐

---

## 二、实现 `getTime`

```js
export function getTime({ timezone = 'Asia/Shanghai' } = {}) {
  try {
    const now = new Intl.DateTimeFormat('zh-CN', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date())

    return {
      timezone,
      currentTime: now,
    }
  } catch (error) {
    throw new Error(`无效时区: ${timezone}`)
  }
}
```

对应 schema：

```js
export const getTimeTool = {
  type: 'function',
  function: {
    name: 'getTime',
    description: '获取指定时区的当前时间。',
    parameters: {
      type: 'object',
      properties: {
        timezone: {
          type: 'string',
          description: 'IANA 时区，例如 Asia/Shanghai、UTC、America/New_York',
        },
      },
      required: [],
    },
  },
}
```

这个组合回答了一个关键原则：**schema 负责告诉模型“怎么传”，函数负责保证“传进来以后怎么处理”。**

---

## 三、实现 `sum`

```js
export function sum({ a, b }) {
  if (typeof a !== 'number' || typeof b !== 'number') {
    throw new Error('a 和 b 必须都是数字')
  }

  return {
    a,
    b,
    result: a + b,
  }
}
```

对应 schema：

```js
export const sumTool = {
  type: 'function',
  function: {
    name: 'sum',
    description: '计算两个数字的和。只在用户明确要求做加法时调用。',
    parameters: {
      type: 'object',
      properties: {
        a: { type: 'number', description: '第一个加数' },
        b: { type: 'number', description: '第二个加数' },
      },
      required: ['a', 'b'],
    },
  },
}
```

---

## 四、为什么函数本身也要校验参数

即使 schema 已经写了类型，函数内部仍然要做校验。原因很简单：

- 模型可能生成错误参数
- 你后面也可能手动调用这个函数
- 线上环境里不能把数据质量完全寄托给模型

推荐的分工是：

- schema：帮助模型生成正确参数
- 函数代码：做最终兜底

---

## 五、把它们注册成一个工具表

```js
import { getTime } from './getTime.js'
import { sum } from './sum.js'
import { getTimeTool } from './getTime.tool.js'
import { sumTool } from './sum.tool.js'

export const toolRegistry = {
  getTime,
  sum,
}

export const tools = [getTimeTool, sumTool]
```

这样到下一节我们就能直接：

1. 把 `tools` 传给模型
2. 从 `toolRegistry` 找到真实执行函数

---

## 六、一个最小的本地执行器

```js
export function executeTool(name, args) {
  const fn = toolRegistry[name]
  if (!fn) {
    throw new Error(`未知工具: ${name}`)
  }
  return fn(args)
}
```

这个执行器现在还很简单，但已经把最核心的边界固定住了：

- 输入：`name + args`
- 输出：函数返回值
- 异常：未知工具 / 参数错误

---

## 七、小结

这一节真正建立的是“工具调用的最小闭环”：

1. 真实函数要小而清晰
2. schema 要和函数签名对齐
3. 函数内部仍然要做参数校验
4. 工具表和执行器要分开，便于后面扩展

下一节开始，模型就会根据用户输入自动决定该调用哪个工具。
