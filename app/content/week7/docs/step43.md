# Step 43: MCP 实践｜理解 MCP（Model Context Protocol）模式

## 学习目标

这一节的目标不是“知道 MCP 是什么名字”，而是把它放进一条真实可执行的链路里理解：**模型如何发现工具、如何调用工具、工具返回什么、server/client 的边界在哪里，以及为什么 MCP 比单纯的 function calling 更适合做本地操作 Agent**。

学完这一节，你应该能：

1. 说清楚 MCP 与 function calling 的关系和差异
2. 看懂 MCP 的核心消息流：`initialize`、`tools/list`、`tools/call`、`resources/read`
3. 理解 tool schema、registry、invoke、resource 这几个关键概念
4. 在本地工程里设计一套可控的 MCP 工具层

> **本节主线：** 从“模型会调用函数”升级到“模型通过协议发现并安全使用工具”。

---

## 一、先把概念说准：MCP 解决的到底是什么问题

### 1.1 function calling 和 MCP 不是一回事

function calling 解决的是“模型能不能输出一个结构化函数调用”。

MCP 解决的是“工具系统如何被标准化地发现、描述、调用和约束”。

| 维度 | Function Calling | MCP |
|---|---|---|
| 核心目标 | 让模型输出函数调用 | 让模型通过标准协议接入工具和资源 |
| 工具发现 | 开发者手动把函数数组喂给模型 | client 向 server 拉取 `tools/list` |
| 协议层 | API 功能 | 标准消息协议 |
| 能力范围 | 主要是函数调用 | tool、resource、prompt 等能力统一管理 |
| 适合场景 | 单应用内的函数路由 | 可插拔工具、跨进程、跨服务、跨应用 |

你可以把 function calling 理解成“模型会说我要调用哪个函数”，把 MCP 理解成“模型和工具世界之间有一套可协商、可发现、可审计的协议层”。

### 1.2 MCP 的三种对象

MCP 里最重要的是三类对象：

```
模型/客户端  <----协议---->  MCP Server
     │                          │
     │                          ├─ tools: 可执行动作
     │                          ├─ resources: 可读取上下文
     │                          └─ prompts: 可复用提示模板
```

- `tool` 是“能做事”的，例如读文件、写文件、跑 shell。
- `resource` 是“能读内容”的，例如一个文档、一个配置、一个页面。
- `prompt` 是“能复用的提示模板”，用于把任务意图标准化。

本周我们重点做 `tool` 和 `resource`，因为本地操作 Agent 最常见的能力就是：读 -> 想 -> 改 -> 验证。

---

## 二、协议层：MCP 的消息流和数据结构

### 2.1 一次完整握手长什么样

MCP 通常以 JSON-RPC 风格通信。你可以先把它看成下面这条链路：

1. client 连接 server
2. 双方初始化能力
3. client 获取工具列表
4. model 选择工具
5. client 发起工具调用
6. server 返回结构化结果

一个简化的 `tools/list` 请求大致像这样：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {}
}
```

返回值不是“随便一段文本”，而是工具清单：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "read_file",
        "description": "Read a text file inside the workspace",
        "inputSchema": {
          "type": "object",
          "properties": {
            "path": { "type": "string" }
          },
          "required": ["path"]
        }
      }
    ]
  }
}
```

### 2.2 tool schema 不是装饰，是边界

工具定义里最关键的是：

- `name`: 工具唯一标识
- `description`: 给模型看的用途说明
- `inputSchema`: 输入参数约束
- `annotations` / `meta`: 权限、危险级别、是否有副作用

这是 MCP 的第一层安全边界。

如果 schema 不完整，模型会乱填参数；如果 schema 太宽松，工具就会被滥用；如果 schema 和真实实现不一致，调试会非常痛苦。

### 2.3 `resources/read` 为什么重要

不是所有上下文都应该变成 tool。

- 读文件、读配置、读说明文档，更适合做 `resource`
- 发起修改、执行命令、写入数据，更适合做 `tool`

这样做的好处是：**读操作可以更明确地被建模为上下文访问，写操作则被保留在强约束的执行通道里**。

---

## 三、在本地工程里怎么落地：server、registry、invoke

### 3.1 server/client 边界要先画清

在本地操作 Agent 里，边界一般是这样的：

- **MCP Server**：真正持有工具实现、文件访问权限、shell 能力
- **MCP Client**：把工具暴露给模型、负责路由调用、收集结果
- **LLM**：只负责决定“要不要用工具、用哪个工具、传什么参数”

不要把工具实现塞进模型侧。模型不应该直接碰文件系统或 shell，它只能通过协议请求 server 执行。

### 3.2 一个最小 registry

```js
export class ToolRegistry {
  constructor() {
    this.tools = new Map()
  }

  register(definition) {
    if (!definition?.name || !definition?.handler) {
      throw new Error('Invalid tool definition')
    }
    this.tools.set(definition.name, definition)
  }

  list() {
    return [...this.tools.values()].map(({ handler, ...meta }) => meta)
  }

  async invoke(name, input, context) {
    const tool = this.tools.get(name)
    if (!tool) throw new Error(`Tool not found: ${name}`)
    return tool.handler(input, context)
  }
}
```

这个 registry 做的不是“存数组”，而是四件事：

- 注册
- 发现
- 校验
- 调用

这就是 MCP 工具层最小可用骨架。

### 3.3 invoke 之后要返回结构化结果

工具返回值最好不要只给一句自然语言，而是提供结构化字段：

```json
{
  "ok": true,
  "content": [
    {
      "type": "text",
      "text": "read_file completed"
    }
  ],
  "meta": {
    "tool": "read_file",
    "durationMs": 18,
    "truncated": false
  }
}
```

这样做的原因很实际：

- client 能做审计
- model 能更稳定地消费结果
- 后续可以加 diff、日志、错误码、权限提示

---

## 四、调试和安全：MCP 里最容易被忽略的部分

### 4.1 工具不是越多越好

本地 Agent 最常见的错误不是“不会调用工具”，而是“给了太多工具、太少边界”。

建议默认遵守四个原则：

1. 只暴露当前任务真的需要的工具
2. 读写分离，写操作必须比读操作更严格
3. shell、网络、删除类能力必须显式授权
4. 每次调用都记录工具名、参数摘要、结果状态

### 4.2 常见调试点

- `tools/list` 里看不到工具，通常是 registry 没注册成功
- 模型参数总是乱填，通常是 `inputSchema` 不够精确
- 工具执行了但结果不好用，通常是返回值结构过于口语化
- 读文件失败，通常是路径限制或沙箱权限拦截

### 4.3 安全底线

MCP 做本地操作时，最低限度要有这些限制：

- workspace root 白名单
- 路径穿越检查
- 大文件截断
- shell 命令白名单
- 写操作审计日志
- 危险动作二次确认

这些不是“高级功能”，而是本地 Agent 能不能上线的前提。

---

## 五、小结

这一节你需要真正带走的不是概念名词，而是一个判断标准：

> **当一个能力需要被发现、约束、审计、组合时，它就不该只是一个普通函数，而应该被建模为 MCP tool 或 resource。**

下一节我们就把这个判断标准落到第一个具体能力上：只读文件系统工具。
