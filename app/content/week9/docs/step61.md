# Step 61: 添加相似度过滤

## 学习目标

这一节不再写成“看起来像懂了”的纯讲义，而是直接以你已经实现过的项目 **`/Users/jianglin/Desktop/backend/AI-backend`** 为练习底座，讲清楚 **添加相似度过滤** 应该怎么落进一套真实 Node 后端工程里。

做完本节后，你应该能：

1. 说清楚这项能力该落在哪一层（route / controller / service / adapter / utils）
2. 在 `AI-backend` 现有目录结构下继续扩展，而不是另起炉灶
3. 按步骤新增文件、修改入口、跑接口、看日志
4. 为后续 week 的 Agent / RAG / 工具系统打基础

> **本节目标：** 给检索增加分数阈值。

---

## 一、本节内容应该落到你项目的哪里？

你现在这个项目已经不是初学 demo，而是一个分层比较清楚的后端工程：

```
AI-backend/
├── src/
│   ├── routes/
│   ├── controllers/
│   ├── services/
│   ├── adapters/
│   ├── middleware/
│   ├── validators/
│   └── utils/
├── functions/
├── schemas/
└── server.js
```

所以学这一节时，不要再问“我要不要新建一个 demo 项目”。答案是不需要。你应该直接在这套工程里继续长能力。

### 1.1 本节推荐落点

围绕 **添加相似度过滤**，建议这样放：

- **routes**：暴露测试接口
- **controllers**：解析请求、组织调用
- **services**：承载核心业务逻辑
- **utils / functions / schemas**：放辅助工具、函数定义、结构约束
- **adapters**：如果本节涉及模型提供商差异，再往这里下沉

### 1.2 本节真正要学会什么

不是“我知道这个名词是什么意思”，而是：

- 我知道这项能力为什么属于 service 层
- 我知道怎样给它补一个测试接口
- 我知道如何把执行日志暴露出来，方便调试
- 我知道下一步它如何继续接到更大的 Agent 或 RAG 链路里

---

## 二、先设计实现方案，再动代码

### 2.1 本节建议新增 / 修改的文件

先不要一上来乱写。建议按下面的文件清单推进：

```
src/
├── routes/
│   └── score-filter.routes.js          # 新增：本节练习接口
├── controllers/
│   └── score-filter.controller.js      # 新增：请求入口
├── services/
│   └── score-filter.service.js         # 新增：核心逻辑
├── routes/index.js               # 修改：挂载新路由
└── app.js / server.js            # 通常无需改动，除非你要挂更多中间件
```

如果本节涉及工具定义或函数调用，还可以继续扩：

```
functions/
└── score-filter.js

schemas/
└── score-filter.schema.js
```

### 2.2 设计原则

这一节建议坚持 4 个原则：

1. **核心逻辑放 service**，不要塞进 controller
2. **controller 只做请求协调**，不做复杂业务判断
3. **route 只负责路径和中间件**，别把逻辑写成一锅粥
4. **先打通最小闭环，再考虑抽象与复用**

这四条很朴素，但很值钱。你后面做 Agent、MCP、RAG 时，能不能不写成事故现场，基本就看它们。

---

## 三、代码实操：在 AI-backend 里把这节能力接进去

### 3.1 第一步：先写 service

创建文件：`src/services/score-filter.service.js`

```js
import logger from '../utils/logger.js'

class ScoreFilterService {
  async run(payload = {}) {
    const startTime = Date.now()
    const logs = []

    logs.push({ stage: 'thought', content: '开始分析任务' })
    logs.push({ stage: 'action', content: '执行 添加相似度过滤 的核心逻辑' })

    const result = {
      ok: true,
      feature: 'score-filter',
      payload,
      summary: '添加相似度过滤 的最小实现已经打通',
      completedAt: new Date().toISOString(),
    }

    logs.push({ stage: 'observation', content: result.summary })

    logger.info('score-filter service completed', {
      duration: Date.now() - startTime,
    })

    return { result, logs }
  }
}

export default new ScoreFilterService()
```

这一步的目标很简单：**先把输入、执行、结果、日志结构立起来**。

你别嫌它朴素。真正值钱的是这个骨架，因为后面你只需要不断把“假动作”替换成“真逻辑”。

### 3.2 第二步：补 controller

创建文件：`src/controllers/score-filter.controller.js`

```js
import { success } from '../utils/response.js'
import scoreFilterService from '../services/score-filter.service.js'

class ScoreFilterController {
  async run(req, res) {
    const data = await scoreFilterService.run(req.body)
    return res.json(success(data, '添加相似度过滤 执行成功'))
  }
}

export default new ScoreFilterController()
```

为什么这一层要单独保留？因为后面你大概率会在这里做：

- 参数校验结果接入
- 请求上下文拼装
- 用户身份 / 权限信息透传
- 返回结构格式化

如果你一上来全糊进 route，后面很快就会开始骂昨天的自己。

### 3.3 第三步：补 route

创建文件：`src/routes/score-filter.routes.js`

```js
import express from 'express'
import scoreFilterController from '../controllers/score-filter.controller.js'
import { asyncHandler } from '../utils/asyncHandler.js'

const router = express.Router()

router.post('/score-filter', asyncHandler(scoreFilterController.run.bind(scoreFilterController)))

export default router
```

### 3.4 第四步：挂到总路由

修改文件：`src/routes/index.js`

在顶部新增：

```js
import scorefilterRoutes from './score-filter.routes.js'
```

在路由挂载区新增：

```js
router.use('/', scorefilterRoutes)
```

这样本节接口就会进入统一 `/api` 前缀下。

最终你可以通过下面地址访问：

```
POST /api/score-filter
```

---

## 四、这节能力该怎么“写真”

上面的代码只是最小骨架。真正练手时，你应该把本节主题替换进来。

### 4.1 围绕“添加相似度过滤”的真实实现方向

你可以按下面方式升级当前 service：

- 如果这一节偏 **Agent / ReAct / MCP**：
  - 在 `service.run()` 中增加多阶段日志
  - 把 thought / action / observation 结构化输出
  - 让 controller 直接返回完整执行过程

- 如果这一节偏 **Embedding / Search / Chunking**：
  - 在 service 中增加预处理、索引、检索等步骤
  - 返回中间结果，如 score、chunk 数量、过滤结果
  - 方便你在接口层先把链路看清楚

### 4.2 推荐你至少保留这些字段

建议统一返回：

```js
{
  result: {},
  logs: [],
  meta: {
    duration: 0,
    feature: 'score-filter',
    step: 61,
  }
}
```

因为后面你做复杂能力时，日志和 meta 会非常有用。没有这些字段，调试会像摸黑走楼梯，节目效果很强，工程体验很差。

---

## 五、如何运行和验证

### 5.1 启动项目

进入项目目录：

```bash
cd /Users/jianglin/Desktop/backend/AI-backend
npm install
npm run dev
```

如果启动正常，你应该看到类似输出：

```bash
🚀 Server ready at http://localhost:3000
```

> 端口以你的 `.env` / config 实际配置为准。

### 5.2 调接口验证

你可以直接用 curl 或 Apifox / Postman 测试：

```bash
curl -X POST http://localhost:3000/api/score-filter   -H 'Content-Type: application/json'   -d '{
    "input": "test 添加相似度过滤",
    "debug": true
  }'
```

### 5.3 预期返回

如果最小实现成功，通常会看到这样的结构：

```json
{
  "success": true,
  "message": "添加相似度过滤 执行成功",
  "data": {
    "result": {
      "ok": true,
      "feature": "score-filter"
    },
    "logs": [
      { "stage": "thought", "content": "开始分析任务" },
      { "stage": "action", "content": "执行 添加相似度过滤 的核心逻辑" },
      { "stage": "observation", "content": "添加相似度过滤 的最小实现已经打通" }
    ]
  }
}
```

如果你拿不到这个结果，不要急着怀疑模型，先查三件事：

1. `src/routes/index.js` 有没有挂路由
2. controller 文件名、导入名是否写对
3. service 有没有正确 export default

---

## 六、结合你现有项目，这一节具体应该怎么练

### 6.1 最推荐的练法

不要追求一步到位把这一节做到完美，而是按这个顺序走：

1. **先把最小路由打通**
2. **再补 service 真逻辑**
3. **再加日志**
4. **最后再考虑 validator / schema / function 定义是否下沉**

这是最稳的节奏。先通，再真，再好看。别反过来。

### 6.2 如果你想把这节接进聊天主链路

你现在项目里已经有：

- `chat.routes.js`
- `chat.controller.js`
- `ai.service.js`
- `functionExecutor`
- `functions/`
- `schemas/`

所以当本节能力成熟后，可以继续考虑两种接法：

#### 接法一：独立接口
适合教学和调试，最容易定位问题。

#### 接法二：接入聊天链路
适合做真正的 Agent / function calling / tool execution。

也就是说，本节先做独立接口是为了学习效率，不是因为它只能独立存在。

---

## 七、常见坑

### 7.1 容易写歪的地方

1. **把所有逻辑都写进 controller**  
   看起来快，后面改起来会很脏。

2. **一上来就改 chat 主链路**  
   这很容易把调试复杂度拉满。先独立接口，真的省命。

3. **没有日志**  
   后面做 Agent / Search / Chunk 时，你会不知道是哪一步错了。

4. **没想清楚这一节能力属于哪层**  
   结果 route、controller、service 三层职责混乱，最后谁都像打零工的。

### 7.2 建议的调试顺序

出了问题，按这个顺序查：

1. 服务有没有启动
2. 路由有没有注册
3. controller 有没有被命中
4. service 是否正常返回结构
5. 日志里有没有异常栈

这顺序很土，但很有效。别一出错就先怀疑宇宙射线。

---

## 八、小结

这一节的关键，不是“我又学了一个新名词”，而是：

- 我知道怎样把 **添加相似度过滤** 放进一套真实后端工程
- 我知道 route / controller / service 该怎么配合
- 我知道怎样用最小接口把能力打通
- 我知道怎样为后续的 Agent、MCP、Embedding、Chunking 铺路

如果你能按这篇文档真的在 `AI-backend` 里敲完一次，这节才算学到了。

否则就还是那种很熟悉的状态：字都认识，项目不会长。
