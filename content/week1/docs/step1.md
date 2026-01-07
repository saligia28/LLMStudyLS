# Step 1: LLM 基础 + Prompt 结构与 API 调用实践教程

## 一、LLM 基础概念

### 1.1 什么是 LLM？
LLM (Large Language Model) 是大型语言模型的缩写，是一种基于深度学习的 AI 模型，通过训练海量文本数据来理解和生成人类语言。

**主流 LLM 服务商：**
- OpenAI（GPT 系列）
- DeepSeek（国产，支持中文优化）
- Anthropic（Claude）
- Google（Gemini）

### 1.2 LLM 的工作原理
- 用户输入提示词（Prompt）
- 模型根据训练数据和上下文生成回复
- 通过 API 接口进行交互

---

## 二、Prompt 结构详解

### 2.1 什么是 Prompt？
Prompt（提示词）是你发送给 LLM 的指令或问题，是与 AI 交互的核心。

### 2.2 Prompt 的基本结构

```
[角色设定] + [任务描述] + [输出格式] + [限制条件]
```

**示例：**
```
你是一个专业的 Python 编程导师。
请帮我解释什么是列表推导式。
用简单的语言回答，并提供一个示例代码。
回答限制在 200 字以内。
```

### 2.3 优质 Prompt 的特征
- **清晰明确**：避免模糊的表述
- **具体详细**：提供足够的上下文信息
- **结构化**：分步骤或分段落组织
- **可迭代**：根据回复调整优化

### 2.4 常见 Prompt 类型
1. **问答型**：直接提问获取答案
2. **创作型**：让 AI 生成内容（文章、代码等）
3. **分析型**：对数据或文本进行分析
4. **对话型**：多轮对话保持上下文

---

## 三、OpenAI API 调用实践

### 3.1 准备工作

#### 步骤 1：注册 OpenAI 账号
1. 访问 [https://platform.openai.com](https://platform.openai.com)
2. 点击 "Sign up" 注册账号
3. 验证邮箱

#### 步骤 2：获取 API Key
1. 登录后访问 [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. 点击 "Create new secret key"
3. 复制并保存 API Key（只显示一次，务必保存好）
4. **注意**：新用户可能需要充值才能使用 API

#### 步骤 3：配置开发环境
```bash
# 创建项目目录
mkdir llm-api-test
cd llm-api-test

# 初始化 Node.js 项目（如果使用 JavaScript）
npm init -y

# 或创建 Python 虚拟环境（如果使用 Python）
python3 -m venv venv
source venv/bin/activate  # macOS/Linux
# 或 venv\Scripts\activate  # Windows
```

### 3.2 安装 SDK

**Python 方式：**
```bash
pip install openai
```

**Node.js 方式：**
```bash
npm install openai
```

### 3.3 代码实现示例

#### Python 示例（推荐）

**创建文件 `openai_test.py`：**

```python
from openai import OpenAI

# 初始化客户端
client = OpenAI(
    api_key="你的-API-Key-放这里"
)

# 发送请求
response = client.chat.completions.create(
    model="gpt-3.5-turbo",  # 可选: gpt-4, gpt-4-turbo 等
    messages=[
        {"role": "system", "content": "你是一个有帮助的助手。"},
        {"role": "user", "content": "请解释什么是机器学习？"}
    ],
    temperature=0.7,  # 控制随机性，0-2 之间
    max_tokens=500    # 限制返回的最大 token 数
)

# 打印结果
print(response.choices[0].message.content)
```

**运行：**
```bash
python openai_test.py
```

#### Node.js 示例

**创建文件 `openai_test.js`：**

```javascript
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: '你的-API-Key-放这里'
});

async function main() {
  const response = await client.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: '你是一个有帮助的助手。' },
      { role: 'user', content: '请解释什么是机器学习？' }
    ],
    temperature: 0.7,
    max_tokens: 500
  });

  console.log(response.choices[0].message.content);
}

main();
```

**运行：**
```bash
node openai_test.js
```

### 3.4 重要参数说明

| 参数 | 说明 | 推荐值 |
|------|------|--------|
| `model` | 使用的模型版本 | gpt-3.5-turbo（性价比高）<br>gpt-4（质量更高） |
| `messages` | 对话消息数组 | 包含 system、user、assistant 角色 |
| `temperature` | 创造性/随机性 | 0.7（平衡）<br>0.2（精确）<br>1.5（创意） |
| `max_tokens` | 最大返回长度 | 按需设置，影响费用 |
| `top_p` | 采样范围 | 0.9（默认） |

---

## 四、DeepSeek API 调用实践

### 4.1 准备工作

#### 步骤 1：注册 DeepSeek 账号
1. 访问 [https://platform.deepseek.com](https://platform.deepseek.com)
2. 注册并登录账号
3. 新用户通常有免费额度

#### 步骤 2：获取 API Key
1. 进入控制台 [https://platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys)
2. 创建新的 API Key
3. 复制保存

### 4.2 DeepSeek API 特点
- **兼容 OpenAI 接口**：可以使用 OpenAI SDK
- **国内访问稳定**：无需代理
- **性价比高**：价格更优惠
- **中文优化**：对中文理解更好

### 4.3 代码实现示例

#### Python 示例

**创建文件 `deepseek_test.py`：**

```python
from openai import OpenAI

# DeepSeek 兼容 OpenAI SDK，只需修改 base_url
client = OpenAI(
    api_key="你的-DeepSeek-API-Key",
    base_url="https://api.deepseek.com"
)

response = client.chat.completions.create(
    model="deepseek-chat",  # DeepSeek 的模型名称
    messages=[
        {"role": "system", "content": "你是一个专业的 AI 助手。"},
        {"role": "user", "content": "请用简单的语言解释什么是神经网络？"}
    ],
    temperature=0.7,
    max_tokens=500,
    stream=False  # 设置为 True 可以启用流式输出
)

print(response.choices[0].message.content)
```

#### Node.js 示例

**创建文件 `deepseek_test.js`：**

```javascript
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: '你的-DeepSeek-API-Key',
  baseURL: 'https://api.deepseek.com'
});

async function main() {
  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: '你是一个专业的 AI 助手。' },
      { role: 'user', content: '请用简单的语言解释什么是神经网络？' }
    ],
    temperature: 0.7,
    max_tokens: 500
  });

  console.log(response.choices[0].message.content);
}

main();
```

---

## 五、进阶技巧

### 5.1 环境变量管理 API Key

**永远不要将 API Key 硬编码在代码中！**

#### 方法 1：使用 `.env` 文件

**创建 `.env` 文件：**
```
OPENAI_API_KEY=sk-xxx...
DEEPSEEK_API_KEY=sk-xxx...
```

**Python 使用方式：**
```bash
pip install python-dotenv
```

```python
import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY")
)
```

**Node.js 使用方式：**
```bash
npm install dotenv
```

```javascript
import 'dotenv/config';
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});
```

**重要：添加 `.env` 到 `.gitignore`**
```
.env
```

### 5.2 流式输出（Stream）

适合实时显示长文本生成过程：

**Python 示例：**
```python
stream = client.chat.completions.create(
    model="gpt-3.5-turbo",
    messages=[{"role": "user", "content": "写一首关于春天的诗"}],
    stream=True
)

for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end='', flush=True)
```

### 5.3 多轮对话上下文管理

```python
messages = [
    {"role": "system", "content": "你是一个编程助手。"}
]

# 第一轮
messages.append({"role": "user", "content": "什么是变量？"})
response = client.chat.completions.create(model="gpt-3.5-turbo", messages=messages)
assistant_reply = response.choices[0].message.content
messages.append({"role": "assistant", "content": assistant_reply})

# 第二轮（带上下文）
messages.append({"role": "user", "content": "给我举个例子"})
response = client.chat.completions.create(model="gpt-3.5-turbo", messages=messages)
print(response.choices[0].message.content)
```

---

## 六、实践任务清单

### 任务 1：基础调用
- [ ] 注册 OpenAI 或 DeepSeek 账号
- [ ] 获取 API Key
- [ ] 安装对应的 SDK
- [ ] 完成第一次 API 调用
- [ ] 成功打印出模型的回复

### 任务 2：Prompt 优化
- [ ] 尝试不同的 system prompt
- [ ] 调整 temperature 参数观察效果
- [ ] 设计一个复杂的提示词（包含角色、任务、格式）

### 任务 3：安全实践
- [ ] 使用环境变量管理 API Key
- [ ] 创建 `.gitignore` 防止密钥泄露

### 任务 4：进阶探索
- [ ] 实现流式输出
- [ ] 完成一次多轮对话
- [ ] 记录 API 调用的 token 消耗

---

## 七、常见问题 FAQ

### Q1: API Key 在哪里找？
**OpenAI**：https://platform.openai.com/api-keys
**DeepSeek**：https://platform.deepseek.com/api_keys

### Q2: 如何计费？
- 按 token 数量计费（输入 + 输出）
- 1 token ≈ 0.75 个英文单词 ≈ 1.5 个汉字
- 使用 `max_tokens` 控制费用

### Q3: 调用失败怎么办？
**常见错误：**
- `Authentication Error`：检查 API Key 是否正确
- `Rate Limit`：请求过于频繁，稍后重试
- `Invalid Model`：检查模型名称是否正确
- `Quota Exceeded`：额度不足，需要充值

**调试技巧：**
```python
try:
    response = client.chat.completions.create(...)
except Exception as e:
    print(f"错误类型: {type(e)}")
    print(f"错误信息: {e}")
```

### Q4: OpenAI 在国内访问不了？
- 使用 DeepSeek 等国内服务（推荐）
- 配置代理（需要合法手段）
- 使用第三方中转 API（注意安全）

### Q5: 如何选择模型？
- **学习/测试**：gpt-3.5-turbo 或 deepseek-chat
- **生产/高质量**：gpt-4-turbo
- **成本敏感**：DeepSeek（性价比更高）

---

## 八、参考资源

### 官方文档
- [OpenAI API 文档](https://platform.openai.com/docs)
- [DeepSeek API 文档](https://platform.deepseek.com/docs)

### 学习资源
- [Prompt Engineering Guide](https://www.promptingguide.ai/zh)
- [OpenAI Cookbook](https://github.com/openai/openai-cookbook)

### 社区
- [OpenAI 官方论坛](https://community.openai.com/)
- GitHub 搜索 "LLM tutorial"

---

## 九、下一步学习方向

1. **Prompt Engineering 进阶**
   - Few-shot learning
   - Chain of Thought (CoT)
   - ReAct 框架

2. **功能扩展**
   - Function Calling（函数调用）
   - Embeddings（向量化）
   - Fine-tuning（微调）

3. **应用开发**
   - 构建聊天机器人
   - RAG（检索增强生成）
   - LangChain 框架

---

**祝学习顺利！记得动手实践才是最好的学习方式。**
