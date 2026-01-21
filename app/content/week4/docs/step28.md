# Step 28: Node AI 后端封装｜完成"通用 AI Router"文档

## 学习目标

这个任务的本质是回答一个核心问题：**如何将我们构建的 AI 后端封装成一个通用的、可复用的模块**。

通过本教程,你将：

1. 总结前面所有学习内容
2. 编写完整的 API 文档
3. 创建使用示例和最佳实践
4. 构建一个可发布的 npm 包

---

## 一、通用 AI Router 概述

### 1.1 什么是通用 AI Router？

```
┌─────────────────────────────────────────────────────────────┐
│              通用 AI Router                                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   定义：                                                     │
│   一个开箱即用的、生产级别的 AI 后端解决方案                   │
│                                                             │
│   核心功能：                                                 │
│   ┌─────────────────────────────────────────────────┐       │
│   │  ✓ 多 AI 提供商支持 (OpenAI/DeepSeek/Claude)    │       │
│   │  ✓ 统一的 API 接口                               │       │
│   │  ✓ 流式和非流式响应                              │       │
│   │  ✓ 自动错误处理                                  │       │
│   │  ✓ 请求日志和性能监控                            │       │
│   │  ✓ CORS 和安全配置                               │       │
│   │  ✓ 参数验证                                     │       │
│   │  ✓ 可扩展的中间件系统                            │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   适用场景：                                                 │
│   - AI 聊天应用                                              │
│   - AI 助手                                                  │
│   - 内容生成工具                                             │
│   - 对话式 UI                                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│              系统架构                                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────────────────────────────────────────┐       │
│   │                 客户端                           │       │
│   │        (Web / Mobile / Desktop)                 │       │
│   └─────────────────────────────────────────────────┘       │
│                          ↓ HTTP/SSE                         │
│   ┌─────────────────────────────────────────────────┐       │
│   │               路由层 (Routes)                    │       │
│   │         定义 API 端点，应用中间件                 │       │
│   └─────────────────────────────────────────────────┘       │
│                          ↓                                  │
│   ┌─────────────────────────────────────────────────┐       │
│   │             控制器层 (Controllers)               │       │
│   │          编排业务流程，调用服务                   │       │
│   └─────────────────────────────────────────────────┘       │
│                          ↓                                  │
│   ┌─────────────────────────────────────────────────┐       │
│   │              服务层 (Services)                   │       │
│   │         封装业务逻辑，管理适配器                  │       │
│   └─────────────────────────────────────────────────┘       │
│                          ↓                                  │
│   ┌─────────────────────────────────────────────────┐       │
│   │             适配器层 (Adapters)                  │       │
│   │        统一不同 AI 提供商的接口                   │       │
│   └─────────────────────────────────────────────────┘       │
│                          ↓                                  │
│   ┌───────────┬─────────────┬───────────────────────┐       │
│   │  OpenAI   │  DeepSeek   │    Claude            │       │
│   │  API      │  API        │    API               │       │
│   └───────────┴─────────────┴───────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、API 文档

### 2.1 认证

所有请求需要在配置文件中提供 API Key：

```bash
# .env
DEEPSEEK_API_KEY=your-api-key
OPENAI_API_KEY=your-openai-key
```

### 2.2 通用请求格式

```
基础 URL: http://localhost:3000/api

请求头:
  Content-Type: application/json
```

### 2.3 API 端点

#### 2.3.1 POST /api/chat - 发送聊天请求

**请求示例**：

```json
{
  "messages": [
    {
      "role": "user",
      "content": "你好"
    }
  ],
  "provider": "deepseek",
  "model": "deepseek-chat",
  "temperature": 0.7,
  "maxTokens": 2000
}
```

**参数说明**：

| 参数        | 类型   | 必需 | 说明                                       |
| ----------- | ------ | ---- | ------------------------------------------ |
| messages    | Array  | 是   | 消息数组，每条消息包含 role 和 content     |
| provider    | String | 否   | AI 提供商 (deepseek/openai/claude)         |
| model       | String | 否   | 模型名称                                   |
| temperature | Number | 否   | 温度参数 (0-2)，控制创造性                 |
| maxTokens   | Number | 否   | 最大 token 数 (1-8000)                     |

**响应示例**：

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "role": "assistant",
    "content": "你好！有什么我可以帮助你的吗？",
    "provider": "deepseek"
  }
}
```

#### 2.3.2 POST /api/chat/stream - 流式聊天

**请求格式**：与 `/api/chat` 相同

**响应格式**：Server-Sent Events (SSE)

```
data: {"id":"chatcmpl-123","choices":[{"delta":{"content":"你"}}]}

data: {"id":"chatcmpl-123","choices":[{"delta":{"content":"好"}}]}

data: [DONE]
```

**前端示例**：

```javascript
const response = await fetch('/api/chat/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ messages }),
})

const reader = response.body.getReader()
const decoder = new TextDecoder()

while (true) {
  const { done, value } = await reader.read()
  if (done) break

  const text = decoder.decode(value)
  // 处理 SSE 数据
}
```

#### 2.3.3 GET /api/providers - 获取可用提供商

**响应示例**：

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "providers": ["deepseek", "openai"]
  }
}
```

#### 2.3.4 GET /api/health - 健康检查

**响应示例**：

```json
{
  "status": "ok",
  "timestamp": "2024-01-20T10:00:00.000Z",
  "uptime": 3600.5,
  "memory": {
    "rss": 50331648,
    "heapTotal": 18874368,
    "heapUsed": 11567984
  }
}
```

#### 2.3.5 GET /api/stats - 系统统计

**响应示例**：

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "requests": {
      "POST /api/chat": 150,
      "POST /api/chat/stream": 80,
      "GET /api/providers": 20
    },
    "memory": {
      "rss": 50331648,
      "heapTotal": 18874368,
      "heapUsed": 11567984
    },
    "uptime": 3600.5
  }
}
```

### 2.4 错误响应

所有错误响应遵循统一格式：

```json
{
  "success": false,
  "code": 400,
  "message": "错误描述",
  "requestId": "abc-123-def"
}
```

**常见错误码**：

| 错误码 | 说明                 |
| ------ | -------------------- |
| 400    | 请求参数错误         |
| 401    | 未认证               |
| 403    | 无权限               |
| 404    | 资源不存在           |
| 429    | 请求过于频繁         |
| 500    | 服务器内部错误       |
| 503    | 服务不可用           |
| 10001  | AI 服务调用失败      |
| 30001  | 消息格式错误         |

---

## 三、快速开始

### 3.1 安装

```bash
# 克隆项目
git clone https://github.com/your-username/ai-router.git
cd ai-router

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入你的 API Key
```

### 3.2 启动服务

```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

### 3.3 测试

```bash
# 测试聊天接口
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "你好"}
    ]
  }'
```

---

## 四、配置指南

### 4.1 环境变量

```bash
# 服务器
NODE_ENV=development        # 环境 (development/production)
PORT=3000                   # 端口

# CORS
CORS_ORIGIN=http://localhost:5173   # 允许的来源
CORS_CREDENTIALS=true               # 是否允许凭证

# AI 服务
AI_DEFAULT_PROVIDER=deepseek        # 默认提供商

# DeepSeek
DEEPSEEK_API_KEY=your-key
DEEPSEEK_BASEURL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

# OpenAI
OPENAI_API_KEY=your-key
OPENAI_MODEL=gpt-3.5-turbo

# 日志
LOG_LEVEL=info              # 日志级别 (debug/info/warn/error)

# 性能
SLOW_REQUEST_THRESHOLD=1000 # 慢请求阈值（毫秒）

# 安全
REQUEST_BODY_MAX_SIZE=1048576  # 请求体最大大小（字节）
```

### 4.2 添加新的 AI 提供商

1. 创建适配器：

```javascript
// src/adapters/your-provider.adapter.js
import BaseAdapter from './base.adapter.js'

class YourProviderAdapter extends BaseAdapter {
  async chat(messages, options = {}) {
    // 实现你的逻辑
  }
}

export default YourProviderAdapter
```

2. 注册提供商：

```javascript
// src/services/ai.service.js
import YourProviderAdapter from '../adapters/your-provider.adapter.js'

factory.register('your-provider', YourProviderAdapter, config.ai.yourProvider)
```

3. 添加配置：

```javascript
// src/config/index.js
yourProvider: {
  apiKey: process.env.YOUR_PROVIDER_API_KEY,
  // 其他配置...
}
```

---

## 五、最佳实践

### 5.1 错误处理

```javascript
// ✓ 好的做法
try {
  const result = await aiService.chat(messages)
  res.json(success(result))
} catch (error) {
  // 错误会被全局错误处理中间件捕获
  throw new AIServiceError('AI 调用失败', provider, error)
}

// ✗ 不好的做法
try {
  const result = await aiService.chat(messages)
  res.json(success(result))
} catch (error) {
  // 不要在路由层直接处理错误
  res.status(500).json({ error: error.message })
}
```

### 5.2 日志记录

```javascript
// ✓ 结构化日志
logger.info('Chat request completed', {
  provider,
  duration,
  requestId,
})

// ✗ 纯文本日志
console.log('Chat completed in ' + duration + 'ms')
```

### 5.3 参数验证

```javascript
// ✓ 使用验证器
const validatedData = validateChatRequest(req.body)

// ✗ 手动验证
if (!messages || !Array.isArray(messages)) {
  return res.status(400).json({ error: 'Invalid messages' })
}
```

---

## 六、部署指南

### 6.1 Docker 部署

创建 `Dockerfile`：

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
```

构建和运行：

```bash
docker build -t ai-router .
docker run -p 3000:3000 --env-file .env ai-router
```

### 6.2 PM2 部署

```bash
# 安装 PM2
npm install -g pm2

# 启动应用
pm2 start server.js --name ai-router

# 查看日志
pm2 logs ai-router

# 重启
pm2 restart ai-router
```

### 6.3 Nginx 反向代理

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;

        # SSE 支持
        proxy_buffering off;
        proxy_cache off;
    }
}
```

---

## 七、性能优化

### 7.1 优化建议

```
┌─────────────────────────────────────────────────────────────┐
│              性能优化清单                                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   1. 【缓存】                                                 │
│      ✓ 缓存相同的请求结果                                    │
│      ✓ 使用 Redis 存储会话                                   │
│                                                             │
│   2. 【连接池】                                               │
│      ✓ 复用 HTTP 连接                                        │
│      ✓ 使用连接池管理                                        │
│                                                             │
│   3. 【负载均衡】                                             │
│      ✓ 多实例部署                                            │
│      ✓ 使用 Nginx 负载均衡                                   │
│                                                             │
│   4. 【监控告警】                                             │
│      ✓ 接入 APM 工具                                         │
│      ✓ 设置错误告警                                          │
│                                                             │
│   5. 【限流】                                                 │
│      ✓ 限制单个 IP 请求频率                                  │
│      ✓ 防止恶意攻击                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 八、故障排查

### 8.1 常见问题

**Q1: CORS 错误**

```
解决：检查 CORS_ORIGIN 配置，确保包含前端地址
```

**Q2: API Key 无效**

```
解决：确认 .env 文件中的 API Key 正确
```

**Q3: 流式响应不工作**

```
解决：检查 Nginx 配置，确保 proxy_buffering off
```

**Q4: 内存泄漏**

```
解决：检查日志文件大小，配置日志轮转
```

---

## 九、贡献指南

欢迎贡献代码！请遵循以下步骤：

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

---

## 十、项目总结

### 10.1 我们学到了什么

```
┌─────────────────────────────────────────────────────────────┐
│              Week 4 学习总结                                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Step 22: 项目结构设计                                       │
│     ✓ 分层架构 (routes/services/utils)                       │
│     ✓ 单一职责原则                                           │
│     ✓ 模块化设计                                             │
│                                                             │
│   Step 23: AI 请求封装                                        │
│     ✓ 适配器模式                                             │
│     ✓ 多提供商支持                                           │
│     ✓ 统一接口设计                                           │
│                                                             │
│   Step 24: 中间件系统                                         │
│     ✓ CORS 处理                                              │
│     ✓ 请求日志                                               │
│     ✓ 性能监控                                               │
│                                                             │
│   Step 25: 日志系统                                           │
│     ✓ Winston 日志库                                         │
│     ✓ 日志轮转                                               │
│     ✓ 结构化日志                                             │
│                                                             │
│   Step 26: 错误处理                                           │
│     ✓ 自定义错误类                                           │
│     ✓ 统一错误处理                                           │
│     ✓ 错误码设计                                             │
│                                                             │
│   Step 27: 代码重构                                           │
│     ✓ 提取控制器层                                           │
│     ✓ 参数验证器                                             │
│     ✓ 代码模块化                                             │
│                                                             │
│   Step 28: 完整文档                                           │
│     ✓ API 文档                                               │
│     ✓ 部署指南                                               │
│     ✓ 最佳实践                                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 十一、下一步学习

完成了 Week 4，你已经掌握了构建生产级 AI 后端的核心技能。接下来可以：

1. **前端集成**：将后端接口集成到前端应用
2. **数据库集成**：添加对话历史存储
3. **用户认证**：实现 JWT 认证系统
4. **WebSocket**：实现实时双向通信
5. **微服务**：将系统拆分为多个微服务

---

**恭喜你完成 Week 4 的学习！你现在拥有了构建专业 AI 后端应用的完整技能栈。**

## 许可证

MIT License - 详见 LICENSE 文件
