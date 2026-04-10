# Step 60: Embedding + 向量存储｜实现 search 查询

## 学习目标

这一节的本质问题是：**用户输入一句话以后，系统如何把它变成 query embedding，再去向量库里找出最相关的候选结果？**

通过本教程，你将：

1. 理解 search 查询的完整链路：输入、向量化、召回、排序、返回
2. 掌握向量库检索接口里常见的参数：`queryEmbeddings`、`nResults`、`where`
3. 明白 query embedding 必须和文档 embedding 使用同一个模型
4. 学会把检索结果整理成 `score + metadata + document` 的可用结构
5. 为下一节的阈值过滤和 Top-K 组合策略打基础

> **本节目标**：把“向量存储”真正连到“语义搜索”上，形成可运行的检索闭环。

---

## 一、search 查询的完整流程

### 1.1 从一句话到结果列表

一个典型的 search 流程通常是这样：

```
用户查询
   ↓
文本预处理
   ↓
query embedding
   ↓
向量库召回候选
   ↓
metadata filter
   ↓
按相似度排序
   ↓
返回 Top-K 结果
```

这条链路里，真正的核心只有两步：

- 把查询转成向量
- 在向量空间里做相似度匹配

其他步骤都是为了让结果更稳、更准、更可控。

### 1.2 为什么不能直接拿原始文本去比

原始文本之间没法直接算语义距离。你能比较的是字符是否一样、词是否重复，但不是“意思是否接近”。

所以必须先把查询文本变成 embedding，然后再去和库里的向量做匹配。这也是 embedding 搜索和关键词搜索最根本的区别。

---

## 二、search 的最小实现

### 2.1 先把 query 向量化

```js
async function buildQueryVector(embeddingService, query) {
  const [result] = await embeddingService.embedTexts([query])
  return result.vector
}
```

这里有一个重要约定：

- 文档和查询必须使用同一个 embedding 模型
- 否则向量不在同一空间里，分数就不可靠

### 2.2 再向向量库发起检索

如果你使用的是 Chroma 风格的接口，通常可以这样写：

```js
async function search(collection, queryVector, { topK = 5, filters = {} } = {}) {
  const response = await collection.query({
    queryEmbeddings: [queryVector],
    nResults: topK,
    where: filters,
    include: ['documents', 'metadatas', 'distances'],
  })

  return response
}
```

这几个参数非常关键：

- `queryEmbeddings`：查询向量
- `nResults`：要召回多少个候选
- `where`：metadata 过滤条件
- `include`：返回哪些字段，便于后续组装结果

### 2.3 把结果整理成应用层结构

```js
function normalizeSearchResults(response) {
  const documents = response.documents?.[0] ?? []
  const metadatas = response.metadatas?.[0] ?? []
  const distances = response.distances?.[0] ?? []

  return documents.map((document, index) => ({
    document,
    metadata: metadatas[index] ?? {},
    distance: distances[index] ?? null,
  }))
}
```

不同向量库对返回值的命名不一定完全一样，但你的应用层最好统一成一个结构。这样上层逻辑只需要关心：

- 文档内容
- 元数据
- 分数或距离

---

## 三、metadata filter 是怎么进入检索的

### 3.1 什么时候先过滤

如果你的库支持在 query 时直接使用 metadata 过滤，那么最好直接放在检索接口里。比如：

- 只查 `category = account`
- 只查 `version = v2`
- 只查 `language = zh`

这种做法通常更高效，因为它能在召回阶段就缩小范围。

### 3.2 一个过滤示例

```js
const response = await collection.query({
  queryEmbeddings: [queryVector],
  nResults: 10,
  where: {
    category: 'account',
    language: 'zh',
  },
  include: ['documents', 'metadatas', 'distances'],
})
```

这会让系统优先在“正确的子空间”里找结果，而不是把所有数据混在一起再靠后处理硬筛。

### 3.3 如果库不支持 where

有些实现不支持 query 时直接过滤，或者你想先做更复杂的业务筛选，那么可以先召回，再在应用层过滤：

```js
const candidates = normalizeSearchResults(response)
const filtered = candidates.filter((item) => item.metadata.category === 'account')
```

这个方式更灵活，但也意味着你要承担更多后处理成本。

---

## 四、一个完整的 search 服务示例

```js
async function searchDocuments({
  embeddingService,
  collection,
  query,
  topK = 5,
  filters = {},
}) {
  const [queryItem] = await embeddingService.embedTexts([query])

  const raw = await collection.query({
    queryEmbeddings: [queryItem.vector],
    nResults: topK,
    where: filters,
    include: ['documents', 'metadatas', 'distances'],
  })

  return normalizeSearchResults(raw).map((item) => ({
    ...item,
    query,
  }))
}
```

这个函数体现了 search 服务最核心的职责：

- 把查询文本向量化
- 调向量库召回候选
- 统一整理结果结构
- 不把底层库的返回原样暴露给上层

---

## 五、结果分数怎么看

### 5.1 distance 和 score 不一定是同一个概念

有些向量库返回的是 `distance`，有些返回的是 `score`。这两个词不是同义词：

- `score` 通常表示越大越相关
- `distance` 通常表示越小越接近

所以你需要在应用层统一解释它们，避免后面过滤逻辑写反。

### 5.2 一个简单的统一函数

```js
function distanceToScore(distance) {
  if (distance === null || distance === undefined) return 0
  return 1 - distance
}
```

如果你的库本身就是直接返回相似度分数，那就不需要再做转换。关键是：**应用层要用一种稳定的语义理解分数**。

---

## 六、总结

这一节你要记住的，是 search 查询的四个核心动作：

1. 查询文本要先变成 query embedding
2. query embedding 要和文档向量处于同一空间
3. metadata filter 能让召回更精准
4. 最终返回的结构要方便后面的阈值过滤和工程封装

下一节，我们就把“找得到”升级成“只返回足够相关的结果”，也就是阈值过滤和 Top-K 组合策略。
