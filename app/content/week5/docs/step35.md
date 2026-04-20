# Step 35: Function Calling｜最佳实践总结

## 学习目标

这一节是 Week 5 的收尾，核心目标是：**把工具调用做成一套后面还能继续复用的工程套路。**

完成后你应该能：

1. 回顾本周完整调用链
2. 总结 schema 设计、执行循环、错误处理的核心原则
3. 区分“工具调用”和“JSON 输出”两种结构化能力
4. 带着一套可迁移模板进入后续 Agent 与 RAG 学习

> **本周默认模型结论**：工具调用主线继续使用 `deepseek-chat`。`deepseek-reasoner` 只看推理能力，不放进工具执行循环。

---

## 一、Week 5 你真正搭起来了什么

```text
用户问题
  ↓
deepseek-chat + tools
  ↓
assistant.tool_calls
  ↓
本地执行器
  ↓
role:"tool" 回写结果
  ↓
模型生成最终答案
```

如果把本周浓缩成一句话，那就是：

**模型负责决策，代码负责执行。**

---

## 二、最重要的四条工程原则

### 2.1 Schema 要为“触发条件”服务

不要只写“这个函数是干嘛的”，还要写“什么时候该用它”。

### 2.2 永远不要直接信任 arguments

正确顺序是：

1. 解析 JSON
2. 校验参数
3. 执行函数
4. 结构化返回结果

### 2.3 工具调用是循环，不是一次性事件

真实问题里，模型可能：

- 一轮多个工具
- 多轮连续工具
- stream 模式下碎片化参数

所以一定要有：

- `while` 循环
- `maxIterations`
- 错误兜底

### 2.4 工具结果要结构化

推荐返回：

```js
{ ok: true, data: {...} }
```

而不是随手拼一句自然语言。

---

## 三、工具调用 vs JSON 输出

这两者经常被初学者混在一起。

### 3.1 工具调用

用于：让模型决定调用程序能力。

关键字段：

- `tools`
- `tool_calls`
- `role: "tool"`

### 3.2 JSON 输出

用于：让模型直接产出结构化答案。

关键方式：

```js
response_format: { type: 'json_object' }
```

并配合明确 prompt：

```text
请只输出合法 JSON，不要输出额外解释。
```

两者的区别是：

- 工具调用：给程序执行动作
- JSON 输出：给程序解析结果

---

## 四、后续复用模板

你可以把本周代码抽象成下面四块：

```js
export const tools = [...]
export const toolRegistry = {...}
export function parseToolArguments(raw) {...}
export async function runToolLoop(messages, options) {...}
```

后面想新增任何工具，基本只需要：

1. 写函数
2. 写 schema
3. 注册进表

主循环本身不需要推翻重来。

---

## 五、本周容易遗留的坑

做完 Week 5 后，建议再回头确认这些点：

- [ ] 是否还在用旧字段 `function_call`
- [ ] 是否已经统一成 `tools / tool_calls / role:"tool"`
- [ ] 是否给 `arguments` 做了 JSON 解析和异常处理
- [ ] 是否给多轮工具调用加了上限
- [ ] 是否明确区分了工具调用和 JSON 输出

---

## 六、和后续章节的连接

Week 5 学到的东西不会只用一次：

- Week 6 Agent：工具路由和多步循环会直接复用
- Week 11 RAG：query rewrite、rerank 仍然是“模型决策 + 程序执行”的组合
- 后面的应用开发：所有“让模型驱动程序能力”的需求，本质都和本周相通

---

## 七、小结

Week 5 结束后，你应该已经具备这三种能力：

1. 给模型定义工具
2. 让模型稳定地产生工具调用
3. 让程序把工具结果安全地接回对话

如果只记一句话，就记这句：

**Function Calling 不是让模型更会说，而是让模型开始和你的程序协作。**
