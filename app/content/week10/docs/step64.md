# Step 64: 研究 chunk 切分策略（长度、重叠）

## 学习目标

这一节不只讲概念，而是要把 **研究 chunk 切分策略（长度、重叠）** 真的做出来。做完后，你应该能在当前项目里亲手跑通一套最小可工作的 Node + 前端联动示例，而不是停留在“看懂了原理”的温柔幻觉里。

通过本教程，你将：

1. 知道这节内容在完整 Agent / RAG / 工程体系中的位置
2. 在当前项目里补出一个可运行的最小实现
3. 通过前端页面或接口观察执行结果
4. 建立后续继续扩展的代码骨架

> **本节目标效果：** 理解 chunk size / overlap 对检索质量的影响。

---

## 一、先把问题看清楚

如果只看文字解释，**研究 chunk 切分策略（长度、重叠）** 很容易被误解成一个抽象概念；但对前端开发来说，真正有价值的是：

- 我要在哪一层写这段能力？
- 服务端负责什么？
- 前端负责展示和触发什么？
- 最小可运行版本应该长什么样？

所以这一节统一采用一个现实做法：

- **Node / Express**：承担底层能力、工具、Agent 逻辑、检索逻辑
- **前端页面（当前项目实际为 React）**：承担操作入口、结果展示、日志可视化
- **文档 codeDir**：放这节的最小可运行示例文件

### 1.1 本节在项目中的推荐落点

```
app/
├── server/
│   ├── routes/
│   │   └── llm.js / 新增 xxx.js
│   ├── services/
│   │   └── 新增能力 service
│   └── index.js
├── src/
│   ├── pages/
│   │   └── StepDetail.jsx
│   └── services/
│       └── api.js
└── content/
    └── week10/
        ├── docs/step64.md
        └── code/chunk-strategy/
```

### 1.2 你这一节真正要学会的，不只是 API

- 学会把一个 AI 能力拆成 **后端执行 + 前端观测** 两部分
- 学会写 **最小闭环 demo**，不是一上来造大系统
- 学会留出后面可扩展的结构，而不是一坨塞进一个文件

---

## 二、代码实践：先搭最小闭环

### 2.1 先准备 code 目录

在下面目录创建这一节的示例：

```bash
mkdir -p /Users/jianglin/Desktop/LLMStudyLS/app/content/week10/code/chunk-strategy
```

这一节建议至少准备这些文件：

```
week10/code/chunk-strategy/
├── README.md
├── server-demo.js
├── service.js
└── client-demo.jsx
```

> 说明：这里的代码是“课程跟练代码”，你可以先在 `content/week*/code` 下独立跑通；确认理解后，再把能力迁移进 `app/server` 和 `app/src`。

### 2.2 第一步：写服务层最小实现

创建 `service.js`：

```js
export async function runDemoTask(input, options = {}) {
  const logs = []

  logs.push({ type: 'thought', content: '收到任务，准备分析' })
  logs.push({ type: 'action', content: '执行本节对应的核心逻辑' })

  const result = {
    input,
    mode: 'chunk-strategy',
    summary: '这一步的最小能力已经跑通',
    options,
  }

  logs.push({ type: 'observation', content: JSON.stringify(result, null, 2) })

  return { result, logs }
}
```

这段代码看起来很朴素，但它有两个好处：

1. 先把 **输入 → 执行 → 输出** 的链路搭起来
2. 先让前端有东西可展示，再逐步替换成更真实的逻辑

### 2.3 第二步：写一个独立的 Node demo 入口

创建 `server-demo.js`：

```js
import { runDemoTask } from './service.js'

async function main() {
  const task = '研究 chunk 切分策略（长度、重叠）'
  const data = await runDemoTask(task, {
    debug: true,
    step: 64,
  })

  console.log('===== DEMO RESULT =====')
  console.log(JSON.stringify(data, null, 2))
}

main().catch(err => {
  console.error('运行失败:', err)
  process.exit(1)
})
```

运行：

```bash
node /Users/jianglin/Desktop/LLMStudyLS/app/content/week10/code/chunk-strategy/server-demo.js
```

你应该先在终端看到一份结构化结果。**先证明底层逻辑活着，再谈前端页面。**

### 2.4 第三步：接入当前项目服务端

如果你要把本节能力接入主项目，推荐在 `app/server/services/` 新建一个 service 文件：

```js
// app/server/services/chunk-strategy.service.js
export async function handleChunkStrategy(payload) {
  return {
    ok: true,
    feature: 'chunk-strategy',
    payload,
    timestamp: Date.now(),
  }
}
```

再增加一个路由：

```js
// app/server/routes/chunk-strategy.js
import express from 'express'
import { handleChunkStrategy } from '../services/chunk-strategy.service.js'

const router = express.Router()

router.post('/', async (req, res) => {
  try {
    const data = await handleChunkStrategy(req.body)
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
```

最后在 `app/server/index.js` 里注册路由：

```js
import chunkstrategyRouter from './routes/chunk-strategy.js'
app.use('/api/chunk-strategy', chunkstrategyRouter)
```

### 2.5 第四步：补一个前端操作页

虽然当前项目是 React，不是 Vue，但你的学习目标是“前端工程师能手操”，所以这里必须有页面入口。

创建一个最小 React 组件练手：

```jsx
import React, { useState } from 'react'
import axios from 'axios'

export default function ClientDemo() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)

  async function run() {
    setLoading(true)
    try {
      const res = await axios.post('http://localhost:3001/api/chunk-strategy', {
        prompt: '研究 chunk 切分策略（长度、重叠）',
        source: 'frontend-demo',
      })
      setResult(res.data)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h3>研究 chunk 切分策略（长度、重叠）</h3>
      <button onClick={run} disabled={loading}>
        {loading ? '运行中...' : '运行本节 Demo'}
      </button>
      <pre>{JSON.stringify(result, null, 2)}</pre>
    </div>
  )
}
```

如果你不想新建页面，也可以把这类逻辑临时嵌到现有 `StepDetail.jsx` 的实验区里。重点不是页面多漂亮，而是：**你必须点一下按钮就能看到结果**。

---

## 三、把本节主题做得更像真的

上面的最小闭环跑通后，就要把 `研究 chunk 切分策略（长度、重叠）` 的真实语义补进去，而不是永远停在 demo 数据。

### 3.1 本节的强化方向

- **真实输入**：不要只写死 prompt，允许输入任务参数
- **真实日志**：把 thought / action / observation 或 search / score / chunk 等日志吐给前端
- **真实错误**：给异常情况留出错误信息，而不是静默失败
- **真实边界**：加入 timeout、threshold、maxSteps、权限控制之类的限制

### 3.2 这一节你最该练的，不是“复制代码”，而是“替换逻辑”

你可以按下面顺序升级：

1. 先跑通教程给的最小版
2. 把假数据替换成真逻辑
3. 把独立 demo 文件迁移到主项目 `server/services`
4. 给前端补结果展示与错误提示
5. 最后再考虑抽公共层

这套顺序比较稳。反过来一上来就抽象，十有八九会把自己写进装修队。 

---

## 四、针对本节主题的具体实现提示

### 4.1 实现提示

**围绕「研究 chunk 切分策略（长度、重叠）」时，建议重点做下面这些事：**

- 明确输入、输出和中间状态
- 给关键步骤加日志，方便前端展示
- 把“主流程”放在 service 层，把“HTTP 包装”放在 route 层
- 让前端能明确看到执行成功、失败和中间结果

### 4.2 你可以怎么验收自己

至少满足下面 4 条，才算这节真的学到了：

- 我能说清楚这节能力属于系统的哪一层
- 我能在 Node 里单独跑通最小示例
- 我能在前端触发并看到结果
- 我能定位一次故障是出在前端、路由还是 service

---

## 五、运行与验证

### 5.1 启动项目

在 `app/` 目录下执行：

```bash
npm install
npm run start:dev
```

如果你只想先看服务端，也可以单独启动：

```bash
npm run server:dev
```

### 5.2 你应该看到什么

- 终端里看到 `服务器运行在 http://localhost:3001`
- Electron / 前端页面正常启动
- 打开当前 Step 页面后，文档能加载，代码文件能展示
- 按教程新建的接口或页面可以被访问或触发

### 5.3 调试建议

- **前端报错**：先看浏览器控制台 / Electron DevTools
- **接口报错**：看 `server/index.js` 所在终端日志
- **代码没生效**：确认改动路径是不是在 `app/` 下，而不是写到别的 demo 目录去了
- **接口 404**：优先检查路由有没有在 `server/index.js` 注册


## 六、常见坑

### 6.1 最常见的三种翻车姿势

1. **只写文档，不写代码**
   - 读的时候像会了
   - 关掉页面就只剩空气

2. **只写后端，不给前端观察入口**
   - 实际上很难判断系统到底有没有真的工作
   - 前端开发者最容易在这里学成“我感觉它应该能跑”

3. **一开始就做太大**
   - 功能名很高级，代码一看像废墟
   - 先最小闭环，再逐步升级，真的会轻松很多

### 6.2 调试顺序建议

遇到问题时，按这个顺序查：

1. `server-demo.js` 能不能单独跑通
2. route 能不能通过 Postman / curl 命中
3. 前端按钮有没有发请求
4. 页面是不是正确渲染了返回值

---

## 七、小结

这一节你不该只记住 **研究 chunk 切分策略（长度、重叠）** 的定义，而是应该真的把它做成一个前端能点、后端能跑、日志能看的最小系统。

如果你现在回头看，会发现这节真正教你的不是一段 API，而是一种更靠谱的学习方式：

- 先理解
- 再最小实现
- 再接主项目
- 再做前端可视化
- 最后再谈抽象与优化

这条路一点也不花哨，但它很能打。尤其是对前端开发者，特别值钱。
