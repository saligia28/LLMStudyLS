# Step 99: 模型量化｜学习量化（int8 / int4 / GPTQ）

## 学习目标

量化是把大模型从"实验室"带进"生产"的关键技术。学完本节后，你应该能：

1. 解释为什么量化是大模型部署的核心工程问题
2. 理解 FP32 → FP16 → int8 → int4 的精度压缩路径及各自的内存占用
3. 区分 GPTQ、AWQ、GGUF 三种主流量化方案的原理与适用场景
4. 使用 bitsandbytes 在 HuggingFace Transformers 中做 on-the-fly 量化
5. 根据部署目标（速度/内存/精度）选择合适的量化方案

> **核心**：量化不是"降低质量"，而是"用可接受的精度损失换取可部署性"。掌握量化，就是掌握把模型从 A100 搬进 RTX 3090 甚至 CPU 的钥匙。

---

## 一、问题背景：为什么大模型必须量化

### 1.1 显存墙

一个 7B 参数的模型，用 FP32 存储需要多少显存？

```text
7,000,000,000 参数 × 4 字节（FP32）= 28 GB
```

一张 RTX 4090 只有 24 GB 显存。你甚至连模型权重都放不下，更别提激活值和 KV Cache。

| 模型大小 | FP32 | FP16 | int8 | int4 |
|---------|------|------|------|------|
| 1.5B    | 6 GB | 3 GB | 1.5 GB | 0.75 GB |
| 7B      | 28 GB | 14 GB | 7 GB | 3.5 GB |
| 13B     | 52 GB | 26 GB | 13 GB | 6.5 GB |
| 70B     | 280 GB | 140 GB | 70 GB | 35 GB |

量化后，7B 模型用 int4 可以压到 3.5 GB，一张普通消费级显卡就能跑。

### 1.2 推理速度

量化不只省内存，还能加速：

- int8 矩阵乘法在现代 GPU 上有专用 Tensor Core 加速
- int4 进一步减少数据搬运量（memory bandwidth 是推理瓶颈之一）
- 量化使 batch size 可以更大，吞吐量更高

### 1.3 成本问题

如果你用云 GPU 部署：

```text
A100 80GB  → $3/小时（可跑 70B fp16）
RTX 4090   → $0.5/小时（可跑 70B int4）
```

量化直接把硬件成本降低 6 倍。

---

## 二、量化基础：浮点 vs 整数表示

### 2.1 数据类型对比

```text
FP32（32-bit float）：
┌─┬────────┬───────────────────────┐
│S│ Exp(8) │      Mantissa(23)     │
└─┴────────┴───────────────────────┘
范围：±3.4 × 10^38，精度极高，内存 4 字节

FP16（16-bit float）：
┌─┬─────┬──────────┐
│S│Exp5 │Mantissa10│
└─┴─────┴──────────┘
范围缩小，精度降低，内存 2 字节

BF16（Brain Float 16）：
┌─┬────────┬───────┐
│S│ Exp(8) │Mant(7)│
└─┴────────┴───────┘
保留 FP32 的指数范围，牺牲精度，TPU/A100 训练常用

int8（8-bit integer）：
┌─┬───────┐
│S│  val  │
└─┴───────┘
范围 -128 ~ 127，需要 scale + zero_point 映射，内存 1 字节

int4（4-bit integer）：
┌──────┐
│ val  │  （4 bits，两个值共享 1 字节）
└──────┘
范围 -8 ~ 7，内存 0.5 字节/参数
```

### 2.2 量化的本质：线性映射

量化就是把浮点值映射到整数范围：

```python
# 对称量化（symmetric quantization）
scale = max(abs(W)) / 127          # 计算缩放因子
W_int8 = round(W / scale)          # 量化
W_dequant = W_int8 * scale         # 反量化（推理时）

# 非对称量化（asymmetric quantization）
scale = (max(W) - min(W)) / 255
zero_point = round(-min(W) / scale)
W_uint8 = round(W / scale) + zero_point
```

量化误差来源：`round()` 操作丢失了小数部分。

### 2.3 量化粒度

```text
per-tensor quantization:  整个权重矩阵共用一个 scale
per-channel quantization: 每个输出通道一个 scale（精度更高）
per-group quantization:   每 128 个权重共用一个 scale（GPTQ/AWQ 常用）
```

粒度越细，精度越高，开销越大。

---

## 三、主流量化方案详解

### 3.1 bitsandbytes：最简单的 on-the-fly 量化

bitsandbytes 是 HuggingFace 生态里最常用的量化库，特点是无需提前量化，加载时动态量化。

```python
from transformers import AutoModelForCausalLM, BitsAndBytesConfig
import torch

# int8 量化配置
bnb_config_int8 = BitsAndBytesConfig(
    load_in_8bit=True,
)

# int4 量化配置（NF4 格式，更适合 LLM）
bnb_config_int4 = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",          # NormalFloat4，专为正态分布权重设计
    bnb_4bit_compute_dtype=torch.bfloat16,  # 计算时升级到 bf16
    bnb_4bit_use_double_quant=True,     # 对 scale 本身再量化，省 0.4 bit/参数
)

model_id = "Qwen/Qwen2-1.5B-Instruct"

# 加载 int8 模型
model_8bit = AutoModelForCausalLM.from_pretrained(
    model_id,
    quantization_config=bnb_config_int8,
    device_map="auto"
)

# 加载 int4 模型
model_4bit = AutoModelForCausalLM.from_pretrained(
    model_id,
    quantization_config=bnb_config_int4,
    device_map="auto"
)
```

**适合场景**：GPU 不足时快速上线，微调时用（QLoRA 就是基于 int4 量化 + LoRA）。

**局限**：仅支持 NVIDIA GPU，CPU 推理不支持。

### 3.2 GPTQ：Post-Training Quantization 的标杆

GPTQ（Generative Pre-trained Transformer Quantization）是目前最流行的 PTQ（训练后量化）方法，核心思想：

```text
普通量化：直接 round() → 累积误差大
GPTQ：利用 Hessian 矩阵（二阶梯度信息）计算最优量化误差补偿

数学直觉：
  量化第 i 个权重时，把误差"传播"给后续权重来补偿
  类似贪心搜索：局部最优 → 全局近似最优

步骤：
  1. 准备少量校准数据（calibration data，约 128 条）
  2. 逐层计算 Hessian 矩阵
  3. 按列顺序量化权重，实时补偿误差
  4. 导出量化权重文件（.safetensors）
```

```python
# 使用 AutoGPTQ 加载预量化模型
from auto_gptq import AutoGPTQForCausalLM

model = AutoGPTQForCausalLM.from_quantized(
    "TheBloke/Qwen-7B-Chat-GPTQ",
    device="cuda:0",
    use_triton=False,  # Triton kernel 可进一步加速
)
```

**优点**：精度损失小，有专用 GPU kernel（比 bitsandbytes int4 快 2-4x）。
**缺点**：需要提前量化（几小时），HuggingFace Hub 上已有大量预量化版本。

### 3.3 AWQ：激活感知量化

AWQ（Activation-aware Weight Quantization）的关键洞察：

```text
不是所有权重都同等重要。

观察：某些权重通道对应的激活值（activation）特别大，
      量化这些"重要"权重会造成更大的误差。

AWQ 方案：
  1. 分析激活值分布，找出"重要通道"
  2. 对重要通道的权重做缩放（scale up），让量化误差相对变小
  3. 对应激活值做反向缩放（scale down），保持乘积不变
  4. 量化缩放后的权重

效果：比 GPTQ 在极低 bit（3-bit、4-bit）下精度更好
```

```python
# 使用 llm-awq 加载
from awq import AutoAWQForCausalLM

model = AutoAWQForCausalLM.from_quantized(
    "TheBloke/Qwen-7B-Chat-AWQ",
    fuse_layers=True,  # 融合层，加速推理
)
```

### 3.4 GGUF：Ollama / llama.cpp 的量化格式

GGUF（GPT-Generated Unified Format）是 llama.cpp 生态的通用量化格式，主要用于 CPU 推理。

```text
GGUF 量化命名规则：
q4_0  → 4-bit，对称量化，最基础
q4_1  → 4-bit，非对称量化（有 zero_point），精度略好
q4_K_M → 4-bit，K-quant 方法，M=Medium，推荐日常使用
q4_K_S → 4-bit，K-quant，S=Small，更省内存
q5_K_M → 5-bit，K-quant，精度比 q4 好，内存多 25%
q6_K   → 6-bit，K-quant，接近 fp16 精度
q8_0   → 8-bit，对称量化，精度损失极小
f16    → FP16，无量化，最高精度

"K-quant"：对重要层（attention、FFN）用更高 bit，次要层用更低 bit
```

```bash
# Ollama 拉取不同量化版本
ollama pull qwen2:7b-instruct-q4_K_M   # 推荐：4GB，速度快
ollama pull qwen2:7b-instruct-q8_0     # 精度高：8GB，速度中
ollama pull qwen2:7b-instruct           # 默认版本（通常是 q4_K_M）
```

---

## 四、方案横向对比

| 方案 | 量化时机 | 精度 | 速度 | 内存 | 硬件要求 | 推荐场景 |
|------|---------|------|------|------|---------|---------|
| FP16 | 无 | ★★★★★ | ★★★ | ★★ | GPU | 训练、高精度推理 |
| bitsandbytes int8 | 加载时 | ★★★★☆ | ★★★ | ★★★★ | NVIDIA GPU | 快速上线、QLoRA |
| bitsandbytes int4 | 加载时 | ★★★☆☆ | ★★★☆ | ★★★★★ | NVIDIA GPU | 显存极少时 |
| GPTQ int4 | 提前离线 | ★★★★☆ | ★★★★ | ★★★★★ | NVIDIA GPU | 生产部署首选 |
| AWQ int4 | 提前离线 | ★★★★☆ | ★★★★ | ★★★★★ | NVIDIA GPU | 低 bit 时比 GPTQ 好 |
| GGUF q4_K_M | 提前离线 | ★★★☆☆ | ★★★★ | ★★★★★ | CPU / GPU | 本地 CPU 推理 |
| GGUF q8_0 | 提前离线 | ★★★★☆ | ★★★★ | ★★★★ | CPU / GPU | 本地高质量推理 |

> **核心**：GPU 部署首选 GPTQ/AWQ；本地 CPU 推理首选 GGUF（通过 Ollama）；快速实验用 bitsandbytes。

---

## 五、量化的精度损失在哪里

### 5.1 精度损失的根因

```text
量化误差链：
  权重精度损失 → 中间激活值误差 → 层层累积 → 最终输出偏差

典型表现：
  - 事实性错误增加（hallucination 更多）
  - 长文本连贯性下降
  - 逻辑推理步骤容易出错
  - 代码生成中细节错误增多
```

### 5.2 哪些任务最敏感

| 任务类型 | 对量化的敏感度 | 推荐最低精度 |
|---------|-------------|------------|
| 闲聊、简单问答 | 低 | int4 / q4_K_M |
| 中文文章写作 | 低-中 | int4 / q4_K_M |
| 代码生成 | 中 | int8 / q5_K_M |
| 数学推理 | 高 | int8 / q8_0 |
| 多语言翻译 | 中 | int8 / q5_K_M |
| 复杂逻辑推断 | 高 | int8 / q8_0 |

### 5.3 模型越大，量化损失越小

```text
经验规律：
  1.5B int4 < 7B int4（精度上，大模型量化后仍优于小模型原始版本）
  7B int4   ≈ 3B fp16（大致等价）
  
  这意味着：如果显存允许，宁可用更大模型的量化版，不用更小模型的全精度版。
```

---

## 六、动手：用 bitsandbytes 量化第一个模型

```python
#!/usr/bin/env python3
"""
quantization_demo.py
比较 fp16 和 int4 量化的内存占用与基本输出
"""

import torch
from transformers import (
    AutoTokenizer,
    AutoModelForCausalLM,
    BitsAndBytesConfig
)

MODEL_ID = "Qwen/Qwen2-1.5B-Instruct"  # 小模型，适合演示

def get_model_memory_mb(model):
    """计算模型参数占用内存（MB）"""
    total_bytes = sum(
        p.numel() * p.element_size()
        for p in model.parameters()
    )
    return total_bytes / (1024 ** 2)

def load_fp16():
    print("加载 FP16 模型...")
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        torch_dtype=torch.float16,
        device_map="auto"
    )
    return model

def load_int4():
    print("加载 int4 量化模型...")
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_use_double_quant=True,
    )
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        quantization_config=bnb_config,
        device_map="auto"
    )
    return model

def generate_response(model, tokenizer, prompt: str) -> str:
    messages = [{"role": "user", "content": prompt}]
    text = tokenizer.apply_chat_template(
        messages,
        tokenize=False,
        add_generation_prompt=True
    )
    inputs = tokenizer([text], return_tensors="pt").to(model.device)

    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=128,
            do_sample=False,
        )
    response = outputs[0][inputs.input_ids.shape[1]:]
    return tokenizer.decode(response, skip_special_tokens=True)

if __name__ == "__main__":
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    test_prompt = "请用一句话解释什么是机器学习。"

    # FP16 测试
    model_fp16 = load_fp16()
    mem_fp16 = get_model_memory_mb(model_fp16)
    resp_fp16 = generate_response(model_fp16, tokenizer, test_prompt)
    print(f"\n[FP16] 内存: {mem_fp16:.1f} MB")
    print(f"[FP16] 回答: {resp_fp16}")
    del model_fp16
    torch.cuda.empty_cache()

    # int4 测试
    model_int4 = load_int4()
    mem_int4 = get_model_memory_mb(model_int4)
    resp_int4 = generate_response(model_int4, tokenizer, test_prompt)
    print(f"\n[int4] 内存: {mem_int4:.1f} MB")
    print(f"[int4] 回答: {resp_int4}")

    print(f"\n内存节省: {(1 - mem_int4/mem_fp16)*100:.1f}%")
```

运行前确认环境：

```bash
pip install transformers bitsandbytes accelerate torch
# 需要 NVIDIA GPU，bitsandbytes 不支持 CPU
nvidia-smi  # 确认 GPU 可用
python quantization_demo.py
```

---

## 七、没有 GPU 怎么办：GGUF + Ollama

如果你只有 CPU，Ollama 是最简单的方案：

```bash
# 安装 Ollama（macOS）
brew install ollama

# 拉取量化模型
ollama pull qwen2:1.5b          # 默认 q4_K_M，约 1GB
ollama pull qwen2:7b-instruct-q4_K_M   # 7B q4，约 4GB

# 命令行测试
ollama run qwen2:1.5b "什么是量化？"

# API 调用（兼容 OpenAI 格式）
curl http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen2:1.5b",
    "messages": [{"role": "user", "content": "什么是量化？"}]
  }'
```

Ollama 内部使用 llama.cpp，把 GGUF 格式的量化模型在 CPU 上高效运行。

---

## 小结

1. **量化的本质**是用整数近似浮点数，核心公式是 `W_int = round(W / scale)`，误差来自 `round()` 操作。

2. **精度与内存的权衡**：FP32 → FP16（精度几乎无损，内存减半）→ int8（轻微损失，再减半）→ int4（明显损失，再减半）。

3. **三大主流方案**各有侧重：bitsandbytes 最方便（on-the-fly）、GPTQ/AWQ 最快（预量化 + 专用 kernel）、GGUF 最通用（CPU 推理）。

4. **模型越大，量化越划算**：7B int4 的实际效果往往好过 3B fp16，所以优先选大模型量化版。

5. **没有 GPU？用 Ollama**：一行命令拉取 GGUF 量化模型，本地 CPU 即可运行。
