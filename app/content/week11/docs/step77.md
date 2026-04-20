# Step 77: RAG Pipeline｜整理 Pipeline 文档

## 学习目标

这一节是 Week 11 的收尾，目标是：**把“DeepSeek 生成 + 本地 embedding”的 RAG 主线整理成可复用文档。**

完成后你应该能：

1. 清楚画出 ingest / query 两条流程
2. 总结每个模块的职责边界
3. 列出常见故障与修复方向
4. 用一份 checklist 复盘你的 Pipeline 是否稳定

---

## 一、当前推荐架构

```text
RAG Pipeline

入库链路
文档
  → Chunking
  → Local Embedding
  → Vector Store

问答链路
问题
  → Query Embedding
  → Vector Search
  → Query Rewrite / Rerank（可选，DeepSeek）
  → Prompt Build
  → DeepSeek Answer
```

建议把职责写成一句话：

- Chunking：决定入库颗粒度
- Local Embedding：把文本变成向量
- Vector Store：负责召回
- DeepSeek：负责生成与语言组织

---

## 二、最佳实践 checklist

### 2.1 配置边界

- [ ] `LLM_*` 和 `EMBEDDING_*` 是否分开
- [ ] `LLM_MODEL` 是否明确指向 `deepseek-chat`
- [ ] `EMBEDDING_MODEL` 是否明确指向本地 embedding provider

### 2.2 检索层

- [ ] 文档和查询是否使用同一个 embedding 模型
- [ ] 是否为 chunk 保留了来源 metadata
- [ ] 检索是否设置了合理的 `topK` 和阈值

### 2.3 生成层

- [ ] system prompt 是否明确“只基于上下文回答”
- [ ] query rewrite / rerank 是否明确属于 DeepSeek 生成能力
- [ ] 不确定时是否允许模型返回“文档中未提及”

### 2.4 性能层

- [ ] embedding 是否有缓存
- [ ] 查询结果是否有 TTL 或版本失效机制

---

## 三、常见失败模式

### 3.1 检索不到

先查这四点：

1. chunk 是否切得过大
2. embedding 模型是否前后一致
3. query 文本是否需要 rewrite
4. 阈值是否设得过高

### 3.2 回答有幻觉

先查这三点：

1. system prompt 是否约束不足
2. 召回的 chunk 是否不够相关
3. context 是否混入了太多噪声块

### 3.3 成本或延迟过高

优先检查：

1. embedding 是否重复计算
2. 是否可以先加 query cache
3. rerank 是否召回过多候选

---

## 四、推荐的文档模板

你在项目里整理 README 或架构文档时，建议按这个顺序写：

1. 一句话说明主线：DeepSeek 生成 + 本地 embedding
2. 说明 ingest 流程
3. 说明 query 流程
4. 说明配置分层
5. 说明缓存策略
6. 说明已知限制

---

## 五、小结

Week 11 收尾后，你应该已经把 RAG 主线说清楚了：

1. DeepSeek 不负责整条检索链，而是负责生成链
2. 本地 embedding 是检索必修底座
3. 两条链要在配置、代码、文档里都明确拆开

下一周开始，我们把这条主线封装成真正可用的应用。
