# Step 58: Embedding + 向量存储｜用 OpenAI/DeepSeek 做 embedding

## 学习目标

这一节的本质问题是：**如何把一批文本稳定地转成向量，并且把输入输出组织成工程里可用的形态？**

通过本教程，你将：

1. 理解 embedding API 的输入、输出和常见返回结构
2. 学会使用 OpenAI 或 DeepSeek 这类兼容接口生成文本向量
3. 搞清楚为什么批量调用比逐条调用更适合做索引构建
4. 学会把结果整理成后续向量库 upsert 能直接消费的数据
5. 为本地向量库、search 查询和 service 封装做好准备

> **本节目标**：把“文本向量化”真正接进工程流程，而不是停留在概念层。

---

## 一、先看清楚：embedding API 到底做了什么

### 1.1 输入是什么

embedding API 的输入通常很简单：字符串，或者字符串数组。

```js
[
  '如何重置密码',
  '账号密码找回',
  '修改登录口令'
]
```

如果你的场景是建索引，输入一般来自切好的文档块；如果你的场景是在线检索，输入通常就是用户的查询文本。

### 1.2 输出是什么

输出的核心部分是一组向量。每个输入文本都会得到一个向量，顺序和输入顺序一一对应。

```js
{
  data: [
    { index: 0, embedding: [0.12, -0.03, 0.87, ...] },
    { index: 1, embedding: [0.11, -0.02, 0.85, ...] },
    { index: 2, embedding: [0.09, -0.01, 0.83, ...] }
  ],
  usage: {
    prompt_tokens: 42,
    total_tokens: 42
  }
}
```

你后面真正会用到的，通常不是整个响应，而是：

- `data[i].embedding`
- 输入文本和向量的一一映射
- 可能附带的 token 统计信息

### 1.3 为什么它适合做批量

如果你有 100 段文本要入库，最怕的是 100 次单条请求。那样会让网络开销、限流风险和失败重试成本都变高。

把多个文本一次性传进去，通常更适合：

- 索引构建
- demo 数据导入
- 离线批处理
- 需要保序的向量生成任务

---

## 二、OpenAI / DeepSeek 的接法

### 2.1 兼容接口的核心思路

如果你的 DeepSeek 接口支持 OpenAI 兼容形式，那么代码形态通常非常接近。你只需要切换：

- `apiKey`
- `baseURL`
- `model`

其他调用方式大体一致。

### 2.2 一个最小的批量 embedding 示例

```js
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.EMBEDDING_API_KEY,
  baseURL: process.env.EMBEDDING_BASE_URL,
})

export async function embedTexts(texts, model = 'text-embedding-3-small') {
  const normalized = texts
    .map((text) => text.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  if (normalized.length === 0) {
    return []
  }

  const response = await client.embeddings.create({
    model,
    input: normalized,
  })

  return response.data.map((item, index) => ({
    text: normalized[index],
    vector: item.embedding,
    index: item.index,
  }))
}
```

这段代码背后的设计重点有三个：

1. 先做输入归一化，减少无意义差异
2. 批量传入，减少请求次数
3. 返回时把原文和向量重新绑定，方便后面写库

### 2.3 DeepSeek 也能这么用吗

如果你的 DeepSeek 提供的是 OpenAI 兼容接口，通常可以直接复用上面的写法，只要把配置换成对应服务即可。

你可以把它理解成：

- **同一套 SDK**
- **不同的服务地址**
- **不同的模型名称**

这样做的好处是，后面你切 provider 时不用重写整条向量化链路。

---

## 三、批量调用的关键细节

### 3.1 不要把超长内容直接丢给模型

embedding 并不等于“整篇文档一把梭”。如果文本太长，常见问题有：

- 输入超过模型限制
- 语义被稀释
- 一次向量覆盖多个主题，检索效果变差

所以在真正做索引时，通常会先切分，再 embedding。切分策略我们会在 Step 63 详细讲。

### 3.2 批量大小不是越大越好

你需要平衡三件事：

- 请求效率
- 单次失败的影响范围
- 服务端限流和超时

一个合理的做法是：

1. 先按文本长度预处理
2. 再按批次大小提交
3. 出错时只重试失败批次

### 3.3 保持顺序映射

批量调用后，向量和原文本必须一一对应。最稳妥的做法是同时维护一个结构化数组：

```js
const inputs = [
  { id: 'doc-1', text: '如何重置密码' },
  { id: 'doc-2', text: '账号密码找回' },
]

const vectors = await embedTexts(inputs.map((item) => item.text))

const records = inputs.map((item, index) => ({
  id: item.id,
  text: item.text,
  vector: vectors[index].vector,
}))
```

这样后面进入 upsert 时，你不用再猜“这个向量到底对应哪段文本”。

---

## 四、一个更接近真实工程的封装方式

如果你希望这一步能直接支撑向量库写入，建议把返回值整理成统一结构：

```js
export async function embedDocuments(documents, options = {}) {
  const texts = documents.map((doc) => doc.text)
  const embedded = await embedTexts(texts, options.model)

  return documents.map((doc, index) => ({
    id: doc.id,
    text: doc.text,
    vector: embedded[index].vector,
    metadata: doc.metadata ?? {},
  }))
}
```

这里的关键不是“有没有高级抽象”，而是下面这几个约定是否稳定：

- 输入始终是文档对象数组
- 输出始终包含 `id / text / vector / metadata`
- 业务层不直接碰 SDK 的原始返回
- 后续存储和检索都沿用同样的数据形状

这种统一形状，会让你后面做向量库写入和 search 查询时轻松很多。

---

## 五、总结

这一节你要真正带走的，是 embedding API 的三件事：

1. 它把文本转成向量，向量才是后续检索的基础
2. 批量调用比单条调用更适合索引构建
3. 结果一定要整理成“可写入、可查询、可追踪”的结构

下一步，我们就把这些向量写进本地向量库，看看 `upsert` 到底应该怎么设计。
