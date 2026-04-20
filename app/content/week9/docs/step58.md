# Step 58: Embedding + 向量存储｜用本地 OpenAI-compatible 服务做 embedding

## 学习目标

这一节回答的核心问题是：**在 DeepSeek 主线下，embedding 应该由谁来负责？**

完成后你应该能：

1. 理解为什么要把“生成模型”和“embedding 模型”拆开配置
2. 使用本地 OpenAI-compatible embedding 服务生成向量
3. 建立 `LLM_MODEL` 与 `EMBEDDING_MODEL` 分层配置
4. 为后续 RAG 主线准备稳定的本地向量化入口

> **本节默认能力边界**：DeepSeek 负责聊天、改写、rerank 与最终回答；embedding 默认交给本地 OpenAI-compatible 服务，例如 Ollama、vLLM 前的本地嵌入服务，或其他兼容接口。不要把 DeepSeek 聊天模型和 embedding provider 混为一谈。

---

## 一、为什么要拆成两条模型链

从这一周开始，请把模型能力分成两类：

```text
生成链路
  LLM_BACKEND / LLM_MODEL
  负责：回答、改写、总结、rerank

向量链路
  EMBEDDING_BACKEND / EMBEDDING_MODEL
  负责：文档向量、查询向量
```

这样做的原因是：

1. 生成模型和 embedding 模型不是一回事
2. 它们的接口稳定性、成本和部署方式都不同
3. 后面切换本地向量服务时，不需要动 DeepSeek 主线

---

## 二、推荐的环境变量分层

```bash
# 生成模型
DEEPSEEK_API_KEY=your-key
DEEPSEEK_BASEURL=https://api.deepseek.com
LLM_MODEL=deepseek-chat

# 本地 embedding 服务
EMBEDDING_BACKEND=openai-compatible
EMBEDDING_BASE_URL=http://localhost:11434/v1
EMBEDDING_API_KEY=ollama
EMBEDDING_MODEL=nomic-embed-text
```

其中：

- `LLM_MODEL` 只负责生成
- `EMBEDDING_MODEL` 只负责向量化

---

## 三、一个最小 embedding 客户端

```js
import OpenAI from 'openai'

const embeddingClient = new OpenAI({
  apiKey: process.env.EMBEDDING_API_KEY || 'local',
  baseURL: process.env.EMBEDDING_BASE_URL,
})

export async function embedTexts(texts, model = process.env.EMBEDDING_MODEL) {
  const normalized = texts
    .map((text) => text.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  if (normalized.length === 0) return []

  const response = await embeddingClient.embeddings.create({
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

这个版本和后面 RAG 主线的契合点有三个：

1. 客户端和 DeepSeek 聊天客户端彻底分开
2. 接口形状和 OpenAI SDK 一致，易于替换
3. 输出直接可喂给向量库存储

---

## 四、为什么这里默认用本地 embedding

本地 embedding 的好处是：

- 更适合做大量文档入库
- 配置上和主聊天模型解耦
- 后面做缓存和批量索引时更稳定

你可以把这条路线理解成：

```text
DeepSeek = 生成大脑
Local Embedding = 检索底座
```

---

## 五、工程上要统一的数据形状

推荐统一成：

```js
export async function embedDocuments(documents) {
  const vectors = await embedTexts(documents.map((doc) => doc.text))

  return documents.map((doc, index) => ({
    id: doc.id,
    text: doc.text,
    vector: vectors[index].vector,
    metadata: doc.metadata ?? {},
  }))
}
```

后面无论是：

- 写入向量库
- 做 query embedding
- 加缓存

都沿用同样的数据结构，就不会在不同章节里反复换形状。

---

## 六、小结

从这一节开始，请固定一个新的学习习惯：

1. DeepSeek 负责生成，不负责 embedding 这条必修主线
2. embedding 统一走本地 OpenAI-compatible 服务
3. 配置上始终分成 `LLM_*` 和 `EMBEDDING_*`

下一节我们就把这些向量真正写进本地向量库。
