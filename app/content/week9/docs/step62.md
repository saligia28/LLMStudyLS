# Step 62: Embedding + 向量存储｜封装 embedding service

## 学习目标

这一节的本质问题是：**怎样把 embedding、写入向量库、search 查询和过滤逻辑收束成一个稳定的 service 边界？**

通过本教程，你将：

1. 理解 embedding service 的职责边界，知道它应该统一承载什么
2. 学会把 provider、vector store 和业务逻辑解耦
3. 明白为什么 service 要返回“应用层结果”，而不是直接暴露 SDK 原始响应
4. 学会设计批量 embedding、upsert、search 三类核心方法
5. 为后续的数据准备和更复杂的检索流程提供一个可复用入口

> **本节目标**：从“分别会做”升级成“可以被统一调用、统一测试、统一替换”。

---

## 一、为什么需要 service 封装

### 1.1 如果不封装，会发生什么

如果 embedding、存储和检索散落在很多地方，你很快会遇到这些问题：

- 代码里到处都在直接调用 SDK
- provider 一换，很多地方都要改
- 分数规则、批处理规则、metadata 规则不统一
- 出现问题时很难知道是哪一层坏了

所以 service 的价值不是“多包了一层”，而是把这条链路变成一个稳定接口。

### 1.2 service 要抽象的不是“技术”，而是“业务动作”

对于 embedding 场景来说，比较合理的业务动作通常是：

- `embedTexts`：把一组文本转成向量
- `upsertDocuments`：把文档块写入向量库
- `search`：根据查询文本找出相似结果
- `searchWithFilter`：带 metadata 和阈值过滤的检索

这类方法比“直接把某个 SDK 方法抄进业务层”更有长期价值。

---

## 二、service 应该负责什么

### 2.1 该负责的事情

一个成熟的 embedding service，通常会负责这些任务：

1. 文本预处理
2. 批量 embedding
3. 文档切片后的向量写入
4. 向量库检索
5. 分数统一、阈值过滤和结果整理
6. 日志记录和错误包装

### 2.2 不该负责的事情

service 不应该吞掉所有层级的职责。它最好不要直接做这些事：

- 不直接处理 HTTP 请求和响应
- 不直接关心页面交互
- 不把底层 SDK 返回原样抛给上层
- 不把业务外的环境配置逻辑写死

这样分层之后，service 既能保持稳定，又能被上层复用。

---

## 三、一个推荐的 service 接口

### 3.1 接口形状

你可以把 embedding service 设计成一个统一对象：

```js
class EmbeddingService {
  async embedTexts(texts, options = {}) {}

  async upsertDocuments(documents, options = {}) {}

  async search(query, options = {}) {}

  async searchWithFilter(query, options = {}) {}
}
```

这套接口的好处是：

- 上层只需要记住一组稳定方法
- 后面可以随时换 provider
- 后面可以随时换向量库
- 后面可以随时加缓存或重排逻辑

### 3.2 依赖注入更灵活

更工程化一点的写法，会把 provider 和 store 注入进去：

```js
export class EmbeddingService {
  constructor({ provider, vectorStore, logger }) {
    this.provider = provider
    this.vectorStore = vectorStore
    this.logger = logger
  }
}
```

这样做的意义是：

- provider 可以是 OpenAI，也可以是 DeepSeek
- vectorStore 可以是 Chroma，也可以是本地文件索引
- logger 可以是控制台，也可以是正式日志系统

这就是 service 的真正价值：**把变化点隔离在边界外，把稳定逻辑留在边界内。**

---

## 四、把三类动作统一起来

### 4.1 embedding

```js
async embedTexts(texts, options = {}) {
  const normalized = texts.map((text) => text.replace(/\s+/g, ' ').trim()).filter(Boolean)
  return this.provider.embedTexts(normalized, options)
}
```

这里 service 的角色不是“重新实现 embedding”，而是：

- 统一输入清洗
- 统一调用约定
- 统一错误处理
- 统一返回结构

### 4.2 upsert

```js
async upsertDocuments(documents, options = {}) {
  const embedded = await this.embedTexts(
    documents.map((doc) => doc.text),
    options
  )

  const records = documents.map((doc, index) => ({
    id: doc.id,
    document: doc.text,
    vector: embedded[index].vector,
    metadata: doc.metadata ?? {},
  }))

  return this.vectorStore.upsert(records, options)
}
```

这一层真正关心的是数据形状是否统一，而不是底层写入到底是 Chroma、SQLite 还是内存索引。

### 4.3 search

```js
async search(query, options = {}) {
  const [queryItem] = await this.embedTexts([query], options)
  const rawResults = await this.vectorStore.search(queryItem.vector, options)
  return this.normalizeResults(rawResults, options)
}
```

search 也应该是 service 级别的“业务动作”：

- 先向量化查询
- 再调用向量库
- 最后整理为统一结构

---

## 五、服务封装的两个关键习惯

### 5.1 不要把原始 SDK 响应往外抛

原始响应通常包含很多和上层无关的细节。service 最好把它整理成更可读的结构，比如：

```js
{
  items: [
    {
      id: 'faq-001:0',
      document: '如何重置密码',
      score: 0.93,
      metadata: {}
    }
  ],
  meta: {
    count: 1,
    query: '如何重置密码'
  }
}
```

这样上层就不用去适配不同 provider、不同向量库的返回差异。

### 5.2 把可变项都做成参数

下面这些东西都不应该写死：

- 模型名
- topK
- minScore
- collection 名称
- metadata 过滤条件

它们应该作为 options 传进来，这样 service 才真正能被复用。

---

## 六、总结

这一节的重点不是“再写一个类”，而是把整条链路收束成一个稳定的入口。

记住这三句话：

1. service 的职责是统一动作，不是堆叠细节
2. provider 和 vector store 都应该可以被替换
3. 上层拿到的应该是清晰的应用层结果，而不是 SDK 原文

下一节，我们就把这些能力真正落到 demo 数据上，开始准备一套能喂给 embedding 和 search 的高质量样本。
