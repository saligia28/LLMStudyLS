# Step 59: Embedding + 向量存储｜用本地向量库（比如 chroma）存数据

## 学习目标

这一节的本质问题是：**当我们已经拿到了 embedding，应该怎样把它们组织成一个可增量更新、可检索、可带过滤条件的数据集？**

通过本教程，你将：

1. 理解本地向量库的数据模型：id、vector、document、metadata 各自负责什么
2. 明白为什么 collection / namespace / index 这类概念对检索系统很重要
3. 学会用 upsert 思维写入向量，而不是只会一次性插入
4. 了解 metadata 为什么不是“可有可无”，而是后面过滤和调试的基础
5. 为下一节的 search 查询准备稳定的数据底座

> **本节目标**：把向量真正放进一个可重复写入、可持续更新的存储结构里。

---

## 一、向量库到底存什么

### 1.1 不只是“存一串数字”

一个可用的向量检索记录，通常不只有 vector。它至少应该包含：

| 字段 | 作用 |
| --- | --- |
| `id` | 这条记录的唯一标识，决定能不能稳定更新 |
| `vector` | 文本的向量表示，用于相似度计算 |
| `document` | 原始文本或切片文本，方便返回给用户 |
| `metadata` | 业务过滤、追踪来源、调试排查的附加信息 |

只存向量会让你后面很难解释“这个结果来自哪里、属于哪一类、为什么被召回”。所以真正实用的向量库，一定是“向量 + 文本 + 元数据”的组合体。

### 1.2 为什么需要 collection

你可以把 collection 理解成“一个命名清晰、语义一致的向量集合”。比如：

- `faq_docs`
- `product_manual`
- `week9_demo`

这样做的好处是：

- 不同数据集不会互相污染
- 索引和检索范围更明确
- 后续做实验时可以平行比较不同集合

如果把所有向量扔进一个大池子，调试会非常痛苦。

---

## 二、为什么 upsert 比 insert 更适合索引场景

### 2.1 insert 的问题

如果你只会 insert，那么每次文档更新时就很麻烦：

- 旧向量要先删
- 新向量要重新加
- 文档切分变化后，id 可能对不上

这种流程一旦数据量大，就很容易失控。

### 2.2 upsert 的思路

upsert = insert + update。也就是说：

- id 不存在时，新增
- id 已存在时，覆盖更新

对于知识库索引来说，这非常重要，因为文档本来就会变：

- 内容被修订
- 切片策略被调整
- metadata 被补充
- 模型版本被切换

用 upsert，你可以把“重建索引”变成“增量修订索引”。

### 2.3 一个推荐的 id 方案

建议把 id 设计成可追踪的组合键：

```js
`${docId}:${chunkIndex}`
```

比如：

- `faq-001:0`
- `faq-001:1`
- `doc-2024-03:2`

这种 id 结构有几个好处：

- 可以直接定位某个文档的某个切片
- 改写时容易精确覆盖
- 方便排查召回结果来自哪个 chunk

---

## 三、一个最小的本地向量库数据模型

### 3.1 记录形态

下面是一个推荐的数据形态：

```js
const record = {
  id: 'faq-001:0',
  document: '如何重置密码：进入设置页后点击“忘记密码”',
  vector: [0.12, -0.03, 0.87, ...],
  metadata: {
    docId: 'faq-001',
    chunkIndex: 0,
    title: '重置密码 FAQ',
    category: 'account',
    source: 'handbook',
    version: 'v1',
    language: 'zh',
    tags: ['account', 'password'],
  },
}
```

这里的 metadata 不是摆设，它决定了你后面能不能做这些事：

- 只查某个类别
- 只看某个版本
- 只返回某个来源的数据
- 只过滤某些标签

### 3.2 如果你用的是 Chroma 风格接口

很多本地向量库的写入接口都长得很像：

```js
await collection.upsert({
  ids: records.map((item) => item.id),
  embeddings: records.map((item) => item.vector),
  documents: records.map((item) => item.document),
  metadatas: records.map((item) => item.metadata),
})
```

这一类接口的关键点是：

- 四个数组必须严格对齐
- id、文本、向量、metadata 不能错位
- 更新时用同样的 id 就能覆盖旧数据

### 3.3 如果你先做一个内存版

在真正接 Chroma 之前，你也可以先用 `Map` 模拟 upsert：

```js
const memoryIndex = new Map()

function upsertRecords(records) {
  for (const record of records) {
    memoryIndex.set(record.id, record)
  }
}

function getRecord(id) {
  return memoryIndex.get(id)
}
```

这样做的意义是先把“数据形状”跑通。等你以后换成真正的向量库，只需要替换底层存储实现，不需要重写上层数据组织方式。

---

## 四、写入流程应该怎么设计

### 4.1 推荐的写入步骤

一个稳定的写入流程，通常会按这个顺序走：

1. 接收切好的文档块
2. 对每个块生成稳定的 id
3. 绑定原文和 metadata
4. 获取对应的 embedding
5. 统一 upsert 到 collection
6. 记录写入数量、版本和时间

### 4.2 一个最小示例

```js
async function indexDocuments(collection, chunks) {
  const records = chunks.map((chunk) => ({
    id: `${chunk.docId}:${chunk.chunkIndex}`,
    document: chunk.text,
    vector: chunk.vector,
    metadata: {
      docId: chunk.docId,
      chunkIndex: chunk.chunkIndex,
      title: chunk.title,
      section: chunk.section,
      category: chunk.category,
      version: chunk.version,
    },
  }))

  await collection.upsert({
    ids: records.map((item) => item.id),
    embeddings: records.map((item) => item.vector),
    documents: records.map((item) => item.document),
    metadatas: records.map((item) => item.metadata),
  })

  return {
    count: records.length,
    ids: records.map((item) => item.id),
  }
}
```

这段代码看起来简单，但它已经把“文本 -> 向量 -> 存储”这一段基础链路固定住了。后面的 search、阈值过滤和 service 封装，都会依赖这个结构。

---

## 五、总结

这一节真正要记住的不是某个库的专有 API，而是三个工程原则：

1. 向量库里的每条记录都应该能追踪来源
2. upsert 能让索引更新变得可重复、可修订
3. metadata 是检索系统的第二个入口，不是附属字段

下一节，我们就基于这份数据结构，完整跑一遍 search 查询流程。
