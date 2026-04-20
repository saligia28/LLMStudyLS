# Step 84: 应用落地｜写产品 README

## 学习目标

这一节要为你的文档问答应用写一份真正能指导别人上手的 README。

完成后你应该能：

1. 在开头就说明产品主线
2. 清楚写出生成链与 embedding 链的配置边界
3. 给出快速开始、接口示例和已知限制
4. 为整个 Week 12 做一次产品级收尾

---

## 一、README 最先要说明什么

对于本阶段项目，README 前几行最该说明的是：

1. 这是什么产品
2. 它的技术主线是什么
3. 运行它需要哪两类模型能力

推荐写法：

```markdown
# Doc QA

一个基于 DeepSeek 生成链和本地 embedding 检索链的文档问答应用。
```

---

## 二、推荐 README 结构

```text
1. 项目名 + 一句话描述
2. 核心能力
3. 快速开始
4. 环境变量
5. API 示例
6. 架构说明
7. 已知限制
```

---

## 三、README 示例片段

````markdown
# Doc QA

上传文档后建立本地向量索引，使用 DeepSeek 生成最终回答，并附带来源引用。

## 技术主线

- 生成链：DeepSeek (`LLM_MODEL=deepseek-chat`)
- 检索链：本地 OpenAI-compatible embedding 服务 (`EMBEDDING_MODEL=...`)
- 应用层：Express + SSE + 简单前端

## 快速开始

```bash
npm install
cp .env.example .env
npm start
```

## 环境变量

### 生成链

- `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASEURL`
- `LLM_MODEL`

### Embedding 链

- `EMBEDDING_BACKEND`
- `EMBEDDING_BASE_URL`
- `EMBEDDING_API_KEY`
- `EMBEDDING_MODEL`
- `EMBEDDING_CACHE_FILE`

### 应用参数

- `PORT`
- `CHUNK_SIZE`
- `CHUNK_OVERLAP`
- `TOP_K`
- `SIMILARITY_THRESHOLD`
````

---

## 四、README 里容易写错的地方

### 4.1 不要把 embedding 写成 DeepSeek 默认能力

如果 README 写成“全部由 DeepSeek 完成”，后面使用者会直接配错环境变量。

### 4.2 不要省略技术边界

别人最想知道的，不是你会多少名词，而是：

- 哪个模型负责生成
- 哪个服务负责向量化
- 要不要本地部署 embedding

### 4.3 已知限制要写清楚

建议主动写出：

- 当前只支持哪些文档格式
- 本地向量索引是否持久化
- 是否支持多用户隔离

---

## 五、小结

Week 12 收尾时，一份好的 README 至少要把这句话说透：

**这是一个“DeepSeek 生成 + 本地 embedding 检索”的文档问答应用。**

只要这条主线写清楚，后面的部署、调试、扩展都会顺得多。
