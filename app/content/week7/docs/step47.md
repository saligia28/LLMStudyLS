# Step 47: MCP 实践｜给 Agent 加上 MCP 工具注册

## 学习目标

这一节要解决的是：**怎样把单个工具升级成一套可发现、可过滤、可调用、可观测的 MCP registry**。前面你已经有了 read、write、shell 三类工具，这一节就是把它们组织成一个真正能被 Agent 使用的系统。

学完这一节，你应该能：

1. 设计一个工具注册表的核心数据结构
2. 理解 `tools/list` 为什么要做权限过滤
3. 把注册、发现、调用、日志串成统一流程
4. 给不同角色的 Agent 配不同工具集

> **本节主线：** 工具不只是“能不能用”，还要“谁能看到、谁能调用、何时调用”。

---

## 一、先理解 registry 的角色

### 1.1 registry 不是存放函数名的表

registry 的职责至少有四个：

- **注册**：把 tool definition 放进去
- **发现**：向 client 暴露可用工具
- **过滤**：按权限、场景、风险级别裁剪工具集
- **调度**：收到 `tools/call` 后找到对应 handler 并执行

如果 registry 只是个 `Map<string, fn>`，那还不够。它必须承载工具生命周期。

### 1.2 Agent 为什么需要 registry

Agent 不是先天知道有哪些工具，它只能通过协议获取：

1. client 连接 server
2. server 返回工具清单
3. model 根据任务选择工具
4. client 调 `tools/call`
5. registry 找到 handler 执行

这条链路的关键在于：**工具不是写死在提示词里的，而是运行时发现的**。

---

## 二、数据结构设计：让工具有“身份”和“权限”

### 2.1 推荐工具定义

```json
{
  "name": "read_file",
  "version": "1.0.0",
  "description": "Read a workspace file safely",
  "inputSchema": { "...": "..." },
  "meta": {
    "permission": "workspace-read",
    "sideEffect": "read-only",
    "riskLevel": "low",
    "tags": ["fs", "context"]
  }
}
```

建议把这些字段都当成正式协议的一部分：

- `version` 方便以后升级 schema
- `permission` 方便做权限过滤
- `sideEffect` 方便区分只读和有副作用工具
- `riskLevel` 方便决定是否要人工确认

### 2.2 registry 需要的核心能力

```js
class ToolRegistry {
  constructor(policy) {
    this.policy = policy
    this.tools = new Map()
  }

  register(tool) {
    this.tools.set(tool.name, tool)
  }

  list(context) {
    return [...this.tools.values()]
      .filter((tool) => this.policy.canExpose(tool, context))
      .map(({ handler, ...meta }) => meta)
  }

  async call(name, input, context) {
    const tool = this.tools.get(name)
    if (!tool) throw new Error(`Tool not found: ${name}`)
    if (!this.policy.canInvoke(tool, context)) {
      throw new Error(`Permission denied: ${name}`)
    }
    return tool.handler(input, context)
  }
}
```

这里的关键不是语法，而是职责分离：

- registry 管发现和路由
- policy 管权限与风险
- handler 管真实执行

---

## 三、调用编排：从 `tools/list` 到 `tools/call`

### 3.1 一次典型的编排流程

```
任务输入
   ↓
planner 判断需要哪些能力
   ↓
registry.list(context) 暴露可用工具
   ↓
LLM 选择工具并填参数
   ↓
client 发起 tools/call
   ↓
registry.call(name, input, context)
   ↓
handler 执行
   ↓
返回结构化结果 + 日志
```

### 3.2 JSON-RPC 视角下的 dispatch

```js
export async function dispatchMessage(message, context, registry) {
  if (message.method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id: message.id,
      result: { tools: registry.list(context) }
    }
  }

  if (message.method === 'tools/call') {
    const { name, arguments: args } = message.params
    const result = await registry.call(name, args, context)
    return {
      jsonrpc: '2.0',
      id: message.id,
      result
    }
  }

  throw new Error(`Unsupported method: ${message.method}`)
}
```

这段 dispatch 的作用是把 MCP 协议和本地工具层连接起来。

### 3.3 工具编排不要只看单个调用

真正的 Agent 不是“调一次工具就结束”，而是一个循环：

1. 发现可用工具
2. 选择最小风险工具先读上下文
3. 基于上下文决定是否写入
4. 如果需要验证，再调用 shell
5. 最后收敛结果并输出报告

registry 的价值就在于：它让这个循环可以自动化，而不是写死成一堆 if/else。

---

## 四、权限和治理：让不同 Agent 拿不同工具集

### 4.1 不是所有 Agent 都该看到所有工具

建议按角色分层：

- `reader-agent`：只读文件、读资源
- `editor-agent`：读文件 + 写文件
- `ops-agent`：读写文件 + 白名单 shell

这比“一个超级 Agent 拿全权限”安全得多，也更便于审计。

### 4.2 policy 的建议字段

```js
const policy = {
  canExpose(tool, context) {
    if (tool.meta.riskLevel === 'high' && !context.allowHighRisk) return false
    return context.scopes.includes(tool.meta.permission)
  },
  canInvoke(tool, context) {
    return this.canExpose(tool, context)
  }
}
```

这意味着 registry 的列表结果和最终调用结果可以不一样：

- 列表阶段负责“能看见什么”
- 调用阶段负责“能不能真的执行”

### 4.3 运行日志要标准化

建议记录：

- tool name
- input 摘要
- 是否通过权限校验
- 执行耗时
- 输出大小
- 错误类型

这会直接决定你后面排查 Agent 问题的效率。

---

## 五、小结

这一节最重要的结论是：

> **MCP 里的 registry 不是一个“工具仓库”，而是工具系统的调度中心。**

它负责把“工具定义”变成“可发现能力”，把“调用意图”变成“受控执行”，把“执行结果”变成“可审计反馈”。

下一节我们会把这套机制推进到最难的一步：让 AI 安全地修改项目代码，而不是只会读、写、跑命令。
