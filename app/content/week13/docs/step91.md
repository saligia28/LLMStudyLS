# Step 91: Ollama 入门｜整理笔记

## 学习目标

这一节是 Week 13 的收尾，整理和巩固本周所学。

完成后你应该能：

1. 总结 Ollama 的核心能力和局限性
2. 用对比表格说清楚 Ollama 与云端 API 的适用场景
3. 了解 Modelfile 定制模型行为
4. 为 Week 14（vLLM）做好认知铺垫

---

## 一、Ollama 核心能力总结

```text
Ollama 能做什么：
  ✓ 本地运行开源 LLM（无需 GPU，CPU 也可以）
  ✓ 提供 OpenAI 兼容 API（/v1 端点）
  ✓ 支持流式输出
  ✓ 支持多轮对话
  ✓ 模型自动管理（pull/run/rm）
  ✓ 支持自定义 Modelfile
  ✓ 跨平台（Mac/Linux/Windows）

Ollama 不擅长什么：
  ✗ 高并发（无连续批处理，Ollama 是单请求串行的）
  ✗ 生产级高吞吐（这是 vLLM 的领域）
  ✗ 微调训练（只负责推理）
  ✗ 超大模型（70B+ 需要多卡）
```

---

## 二、适用场景对比

| 场景 | 推荐方案 | 理由 |
| --- | --- | --- |
| 个人开发 / 原型 | Ollama | 零成本，快速迭代 |
| 隐私敏感数据处理 | Ollama | 数据不出本机 |
| 离线环境使用 | Ollama | 不依赖网络 |
| 生产环境高并发 | vLLM / API | Ollama 不支持批处理 |
| 中文效果最优 | qwen2.5 (Ollama) | 专门中文优化 |
| 快速集成 / 无 GPU | DeepSeek API | 最低部署成本 |
| 成本敏感型大规模应用 | vLLM 自托管 | 省去 API 费用 |

---

## 三、Modelfile：定制模型行为

Ollama 允许通过 Modelfile 给模型设置固定的 system prompt 和参数：

```dockerfile
# Modelfile — 创建一个专门用于代码审查的助手
FROM llama3

SYSTEM """
你是一个专业的 Node.js 代码审查助手。
- 只关注代码质量、安全性和性能问题
- 回答使用中文
- 每个问题列出具体的改进建议
- 不要说废话，直接指出问题
"""

PARAMETER temperature 0.1
PARAMETER top_p 0.9
PARAMETER num_ctx 4096
```

```bash
# 创建自定义模型
ollama create code-reviewer -f ./Modelfile

# 使用自定义模型
ollama run code-reviewer
```

---

## 四、Week 13 学习路径回顾

```text
Day 85: 安装 Ollama
  → 理解 Ollama 是什么，安装并验证

Day 86: 运行模型
  → pull + run llama3 / qwen2，理解模型格式

Day 87: API 脚本
  → Node.js 调用 /api/chat，理解请求/响应格式

Day 88: 流式输出
  → NDJSON 格式解析，推荐用 OpenAI SDK + /v1 端点

Day 89: 模型大小对比
  → 1B/3B/7B 在不同任务上的能力差距

Day 90: 性能测试
  → TTFT / TPS 测量，建立本地模型基线数据

Day 91: 整理（本节）
  → 总结、对比、Modelfile
```

---

## 五、预告：Week 14 vLLM

Ollama 适合开发和个人使用，但如果你需要：

- 同时处理多个请求（并发）
- 追求最大 tokens/s 吞吐
- 生产级部署

就需要 **vLLM**。vLLM 的核心技术 PagedAttention 可以把吞吐量提升 2-4 倍，下周我们深入研究它。

---

## 六、小结

1. **Ollama = 本地模型的 Docker**，拉取即用，适合开发环境。
2. 中文任务用 **qwen2.5**，英文任务用 **llama3**。
3. **OpenAI SDK + /v1 端点** 是最简单的集成方式，一行改 baseURL 就切换到本地。
4. Modelfile 让你可以把模型定制成专用助手，固定 system prompt。
5. Week 13 的性能数据是 Week 14 vLLM 对比的基准，保存好。
