# Step 84: 应用落地｜写产品 README

## 学习目标

这一节学习如何为技术产品写一份高质量的 README，也是 Week 12 的收尾。

完成后你应该能：

1. 理解 README 在技术产品中的作用
2. 掌握 README 的标准结构和写作要点
3. 为你构建的文档问答应用写完整的 README
4. 区分技术文档的不同受众（使用者 vs. 贡献者）

> **核心**：代码是产品的主体，README 是产品的门面。一个没有 README 的项目，别人不知道它是什么、怎么用、能做什么。

---

## 一、README 的作用

README 的核心读者是**3 分钟内决定要不要用这个项目的人**。

| 读者 | 他们想知道的 |
| --- | --- |
| 潜在用户 | 这是什么？能解决我什么问题？ |
| 评估者 | 依赖什么？怎么部署？有没有坑？ |
| 贡献者 | 怎么跑起来？架构是什么？ |

好的 README 要在前 10 行就回答"这是什么"，在前 30 行能让人跑起来。

---

## 二、README 标准结构

```text
1. 项目名 + 一句话描述
2. 功能特性（bullet points）
3. 快速开始（Quick Start，越短越好）
4. 详细安装和配置
5. 使用说明 / API 文档
6. 架构说明（可选）
7. 已知问题 / 限制
8. 贡献指南（可选）
9. License
```

---

## 三、示例：文档问答应用 README

下面是一份为你本周构建的应用写的完整 README：

---

```markdown
# Doc QA — 本地文档问答助手

上传任意文档，基于文档内容进行智能问答，答案附带原文引用。

## 功能特性

- 支持上传 `.txt`、`.md` 格式文档
- 基于语义检索（RAG）从文档中找到最相关内容
- 流式输出答案，逐字显示，延迟低
- 答案附带来源引用，可点击展开原文
- Embedding 缓存，重复内容不重复调用 API

## 快速开始

### 1. 安装依赖

\`\`\`bash
git clone <your-repo>
cd doc-qa-app
npm install
\`\`\`

### 2. 配置环境变量

\`\`\`bash
cp .env.example .env
# 编辑 .env，填入 DEEPSEEK_API_KEY
\`\`\`

### 3. 启动服务

\`\`\`bash
npm start
# 访问 http://localhost:3000
\`\`\`

## 环境变量

| 变量名 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `DEEPSEEK_API_KEY` | 是 | — | DeepSeek API 密钥 |
| `DEEPSEEK_BASEURL` | 否 | `https://api.deepseek.com` | API 地址 |
| `PORT` | 否 | `3000` | 服务端口 |
| `CHUNK_SIZE` | 否 | `800` | 文档切分大小（字符数） |
| `CHUNK_OVERLAP` | 否 | `160` | 切分重叠长度 |
| `TOP_K` | 否 | `5` | 检索返回的最大 chunk 数 |
| `MAX_FILE_SIZE_MB` | 否 | `10` | 允许上传的最大文件大小 |

## API 接口

### 上传文档

\`\`\`
POST /api/upload
Content-Type: multipart/form-data

file: <文件>

响应:
{
  "docId": "doc_20240113_abc123",
  "filename": "example.md",
  "chunks": 42,
  "message": "文档已上传并索引"
}
\`\`\`

### 问答（普通）

\`\`\`
POST /api/query
Content-Type: application/json

{ "question": "什么是 RAG？" }

响应:
{
  "answer": "RAG 是检索增强生成... [来源1]",
  "sources": [
    { "index": 1, "source": "example.md", "score": "0.923" }
  ]
}
\`\`\`

### 问答（流式）

\`\`\`
POST /api/query/stream
Content-Type: application/json

{ "question": "RAG 有哪些优势？" }

响应 (SSE):
data: {"type":"sources","sources":[...]}
data: {"type":"token","text":"RAG"}
data: {"type":"token","text":" 的主要"}
...
data: {"type":"done"}
\`\`\`

### 健康检查

\`\`\`
GET /health

响应: { "status": "ok", "timestamp": "..." }
\`\`\`

## 架构

\`\`\`
前端 (public/)
  └── 上传界面 + 问答框 + 引用展示

后端 (server/)
  ├── routes/upload.js   → multer 接收文件 → 调用 chunker
  ├── routes/query.js    → 接收问题 → 调用 RagPipeline
  └── services/
       ├── chunker.js    → 文档切分（固定长度 + 段落感知）
       ├── embedder.js   → OpenAI Embedding API + 本地缓存
       └── rag.js        → 向量搜索 + Prompt 构建 + LLM 调用
\`\`\`

## 已知限制

- 暂不支持 PDF（需要额外的 PDF 解析库）
- 向量索引存储在内存，重启服务后需要重新上传文档
- 不支持多用户并发（无 session 隔离）

## 下一步可能的改进

- [ ] 接入 Chroma / Qdrant 实现持久化向量存储
- [ ] 支持 PDF 解析（pdfjs-dist）
- [ ] 多轮对话（携带历史上下文）
- [ ] 用户认证（多用户隔离）
- [ ] 部署到 Railway / Render

## License

MIT
```

---

## 四、README 写作要点

### 4.1 开头要明确回答"这是什么"

不好：`A Node.js application that leverages OpenAI embeddings...`
好：`上传文档，基于文档内容问答，答案附带来源引用。`

### 4.2 快速开始要能真的快速起来

快速开始章节不超过 5 步，每步都能直接复制粘贴执行。不要在这里解释原理。

### 4.3 API 文档要给示例

只列接口名和参数名是不够的，要给出完整的请求和响应示例。

### 4.4 已知限制不要藏

主动说明限制，反而让用户信任你的文档是真实的，而不是营销材料。

---

## 五、Week 12 总结

Week 12 的收获：

1. **文件上传 → chunk → embed → 存储 → 问答 → 引用**，一条完整的 RAG 应用链路。
2. 好的应用不只是 RAG 逻辑，还包括**UI 体验、错误处理、配置管理**。
3. 流式输出是问答类应用的体验关键点，用 SSE 实现成本低、效果好。
4. README 是产品的一部分，和代码同等重要。
5. 你现在有了一个可以交付的文档问答小产品，接下来 Week 13 开始探索本地模型。
