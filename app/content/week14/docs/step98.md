# Step 98: vLLM 高性能推理｜写性能分析结论

> **定位**：Week 14 属于进阶选修，服务于高并发部署方向。这里的性能结论是帮助你判断何时需要从 DeepSeek 主线扩展到本地高并发部署。

## 学习目标

这一节是 Week 14 的收尾，把测试数据整理成一份可交付的性能分析文档。

完成后你应该能：

1. 理解性能报告的标准结构
2. 把 Week 13-14 的测试数据组织成结论
3. 写出清晰的技术决策依据
4. 为 Week 15 的量化实验做好铺垫

---

## 一、性能报告结构

一份好的推理性能报告包含：

```text
1. 测试目标与方法
2. 测试环境（硬件、软件版本）
3. 指标定义
4. 测试结果（表格+数字）
5. 分析与解读
6. 结论与建议
```

---

## 二、示例性能报告

```markdown
# LLM 推理性能对比报告
测试日期：2026-03

## 测试目标
对比三种推理方案在相同模型（Qwen2.5-7B）下的延迟和吞吐量表现。

## 测试环境
- 硬件：Apple M2 Max (32GB 统一内存) / NVIDIA A10 24GB（vLLM）
- 模型：Qwen2.5-7B-Instruct（Ollama: q4_K_M，vLLM: bfloat16）
- 测试脚本：custom benchmark (Node.js fetch + OpenAI SDK)
- 重复次数：每场景 5 次，取中位数

## 指标定义
- TTFT：发出请求到收到第一个 token 的时间（ms）
- TPS：每秒输出 token 数（tokens/second）
- 并发吞吐：N 个并发请求完成时的总 tokens/s

## 测试结果

### 单请求性能

| 方案 | 模型精度 | TTFT (p50) | TPS (p50) |
|------|----------|------------|-----------|
| DeepSeek API | FP32 (云端) | 180ms | 45 |
| Ollama | q4_K_M GGUF | 350ms | 28 |
| vLLM | bfloat16 | 220ms | 95 |

### 并发吞吐（总 tokens/s）

| 并发数 | DeepSeek API | Ollama | vLLM |
|--------|-------------|--------|------|
| 1      | 45          | 28     | 95   |
| 5      | 200         | 28*    | 380  |
| 10     | 380         | 28*    | 650  |

*Ollama 串行处理，总吞吐不随并发增加

### 资源使用

| 方案 | 内存/显存 | CPU | 网络依赖 |
|------|-----------|-----|---------|
| DeepSeek API | 极低 | 极低 | 需要 |
| Ollama | ~8GB RAM | 中等 | 无 |
| vLLM | ~16GB VRAM | 低 | 无 |

## 分析

1. **单请求性能**：vLLM > DeepSeek API > Ollama
   - vLLM 使用 bfloat16 精度，比 Ollama 的 q4 量化质量更高，速度也更快（依赖 GPU）
   - DeepSeek API 速度受网络影响，国内访问延迟约 150-300ms

2. **并发能力**：DeepSeek API ≈ vLLM >> Ollama
   - Ollama 的串行架构是根本限制，无论多少并发请求，吞吐量不增加
   - vLLM 的连续批处理在 10 并发时吞吐接近单请求的 7 倍

3. **部署成本**：DeepSeek API > Ollama > vLLM
   - DeepSeek API：按 token 收费，无部署成本
   - Ollama：需要一台开发机，无 GPU 要求
   - vLLM：需要 NVIDIA GPU（成本较高）

## 结论与建议

| 场景 | 推荐方案 | 理由 |
|------|---------|------|
| 个人开发 / 原型 | Ollama | 零成本，快速 |
| 隐私数据 + 低并发 | Ollama | 本地，够用 |
| 生产服务 + 高并发 | vLLM | 吞吐量最高 |
| 快速上线 + 无 GPU | DeepSeek API | 低运维成本 |
| 成本敏感 + 长期运行 | vLLM | 省去 API 费用 |
```

---

## 三、Week 14 学习路径回顾

```text
Step 92: 安装 vLLM        → 理解 vLLM 定位，完成安装
Step 93: 加载 7B 模型     → 第一次用 Python 跑推理
Step 94: PagedAttention   → 理解 vLLM 为什么快
Step 95: API 服务器       → 启动 OpenAI 兼容 HTTP 服务
Step 96: 对比 Ollama      → 测量并发吞吐量差异
Step 97: 接入前端         → 适配器模式，切换后端
Step 98: 性能报告         → 汇总结论（本节）
```

---

## 四、预告：Week 15 模型量化

你现在知道了：
- Ollama 默认用 q4_K_M（4-bit 量化）
- vLLM 默认用 bfloat16（全精度）

Week 15 深入探索量化本身：**同一个模型，不同量化精度，速度和质量如何变化？** 如何用 int8、int4、GPTQ 做量化实验？

---

## 五、小结

1. 性能报告的核心是**数字说话**：把 TTFT、TPS、并发吞吐量记录清楚，不要只写"vLLM 更快"。
2. 对比要**公平**：相同模型、相同 prompt、相同硬件，否则结论没有参考价值。
3. DeepSeek API / Ollama / vLLM 不是竞争关系，而是**不同场景的最优选择**。
4. 把这份报告写进你的项目文档里，是对技术决策过程的完整记录。
5. 量化是在 Ollama（GGUF）里已经默默用了的技术，Week 15 会把它拆开来深入理解。
