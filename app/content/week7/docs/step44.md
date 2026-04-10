# Step 44: MCP 实践｜实现文件系统读取工具

## 学习目标

这一节要解决的是：**怎样设计一个真正适合 MCP 的只读文件工具**。它不是简单包装 `fs.readFile`，而是要同时满足“模型可理解、client 可调度、server 可审计、权限可控制”。

学完这一节，你应该能：

1. 设计一个清晰的 `read_file` 工具 schema
2. 理解读取工具和 resource 的边界差异
3. 写出带路径限制、大小限制、编码限制的安全读取实现
4. 看懂一次 `tools/call` 的输入输出结构

> **本节主线：** 让模型“安全地看到文件内容”，而不是“随便摸到磁盘”。

---

## 一、先想清楚：文件读取为什么要单独成工具

### 1.1 读取能力的用途不是“看文件”，而是“建立上下文”

本地操作 Agent 的第一步通常不是写，而是读：

- 读项目配置，确认技术栈
- 读源码，理解已有实现
- 读日志，定位错误
- 读文档，补充任务上下文

所以文件读取工具的本质是：**把磁盘内容转成模型可消费的上下文**。

### 1.2 tool 和 resource 的边界

这一步很容易混。

| 场景 | 更适合 |
|---|---|
| 读一个固定文档、配置、说明页 | `resource` |
| 按路径读取工作区内任意文件 | `tool` |
| 需要参数化、动态拼装路径、附带权限判断 | `tool` |

如果文件只是“静态内容源”，可以建成 resource；如果要让 Agent 主动选择路径、控制编码、限制大小，那就应该做成 tool。

---

## 二、输入输出设计：别把 read tool 设计成“全能文件浏览器”

### 2.1 推荐输入 schema

一个稳妥的读取工具，输入不要太多，但必须够明确：

```json
{
  "type": "object",
  "properties": {
    "path": { "type": "string", "description": "Workspace-relative file path" },
    "encoding": {
      "type": "string",
      "enum": ["utf-8", "base64"],
      "default": "utf-8"
    },
    "maxBytes": { "type": "integer", "minimum": 1, "maximum": 1048576 },
    "withStats": { "type": "boolean", "default": true }
  },
  "required": ["path"]
}
```

设计思路是：

- `path` 必填，其他都是可控增强项
- 默认返回文本编码内容，必要时才支持 `base64`
- `maxBytes` 防止 Agent 一次性吞进超大文件
- `withStats` 让结果带上大小、修改时间等元信息

### 2.2 推荐输出结构

输出最好是结构化的，而不是只有一段字符串：

```json
{
  "ok": true,
  "path": "src/app.js",
  "absPath": "/workspace/src/app.js",
  "encoding": "utf-8",
  "content": "import express from 'express'...",
  "meta": {
    "size": 8421,
    "truncated": false,
    "mimeType": "text/javascript",
    "sha256": "..."
  }
}
```

这样做的好处是：

- 模型能基于 `content` 做推理
- client 能基于 `meta` 做审计
- 后续改写时可以比对 `sha256`

---

## 三、代码实现：把读取逻辑写成可复用的 MCP tool

### 3.1 一个最小但安全的实现

```js
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

export async function readFileTool(input, context) {
  const root = context.workspaceRoot
  const absPath = path.resolve(root, input.path)

  if (!absPath.startsWith(root + path.sep)) {
    throw new Error('Path outside workspace is not allowed')
  }

  const stat = await fs.stat(absPath)
  const limit = input.maxBytes ?? 256 * 1024

  if (stat.size > limit) {
    const handle = await fs.open(absPath, 'r')
    const buffer = Buffer.alloc(limit)
    const { bytesRead } = await handle.read(buffer, 0, limit, 0)
    await handle.close()
    const chunk = buffer.subarray(0, bytesRead)
    return {
      ok: true,
      path: input.path,
      absPath,
      content: input.encoding === 'base64' ? chunk.toString('base64') : chunk.toString('utf-8'),
      meta: {
        size: stat.size,
        truncated: true,
        readBytes: bytesRead,
        sha256: crypto.createHash('sha256').update(chunk).digest('hex')
      }
    }
  }

  const raw = await fs.readFile(absPath)
  const content = input.encoding === 'base64' ? raw.toString('base64') : raw.toString('utf-8')

  return {
    ok: true,
    path: input.path,
    absPath,
    encoding: input.encoding ?? 'utf-8',
    content,
    meta: {
      size: stat.size,
      truncated: false,
      sha256: crypto.createHash('sha256').update(raw).digest('hex')
    }
  }
}
```

### 3.2 tool definition 也要同步写清

```js
registry.register({
  name: 'read_file',
  description: 'Read a text file inside the workspace safely',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      encoding: { type: 'string', enum: ['utf-8', 'base64'] },
      maxBytes: { type: 'integer' }
    },
    required: ['path']
  },
  meta: {
    sideEffect: 'read-only',
    permission: 'workspace-read'
  },
  handler: readFileTool
})
```

`meta.sideEffect = read-only` 这种标记非常重要，因为它能帮助 client 或 agent 决定是否允许自动调用。

---

## 四、调试和安全：只读工具也会出问题

### 4.1 常见风险

读取工具看起来无害，但实际风险不少：

- 路径穿越：`../../.env`
- 误读二进制：返回乱码污染上下文
- 大文件轰炸：模型上下文被淹没
- 秘密泄漏：`.env`、证书、密钥文件被读出
- 软链接绕过：绕过 workspace 限制

### 4.2 必须做的控制

1. 只允许 workspace-relative 路径
2. 解析后再做一次根目录校验
3. 禁止默认读取隐藏敏感文件
4. 限制单次读取上限
5. 记录每次读取的路径、大小和结果状态

### 4.3 调试建议

- 如果总是报“路径不允许”，先看 `path.resolve` 后的绝对路径
- 如果返回内容乱码，优先检查编码，而不是先怀疑模型
- 如果大文件被截断，要在返回值里明确告诉模型 `truncated: true`

---

## 五、小结

文件读取工具的价值不在“读到了”，而在“读得可控、读得可解释、读得可审计”。

下一节我们会在同样的思路下实现写入工具，但写入比读取多出一层关键差异：**它会改变磁盘状态，因此必须有更严格的确认、回滚和审计机制**。
