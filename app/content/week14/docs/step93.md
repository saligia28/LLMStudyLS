# Step 93: vLLM 高性能推理｜加载一个 7B 模型

> **定位**：Week 14 属于进阶选修，服务于高并发部署方向，不是继续学习 DeepSeek 主线的前置条件。下文模型 ID 仅作示例，请以当前官方支持列表与可下载模型为准。

## 学习目标

安装完成后，我们要把一个真实的 7B 参数量模型跑起来，理解它在 vLLM 里的生命周期。

完成后你应该能：

1. 从 HuggingFace 下载并加载 7B 模型
2. 计算模型推理所需的显存预算
3. 使用 vLLM 的 `LLM` 类和 `SamplingParams` 做单条与批量推理
4. 理解 vLLM 如何在内部处理 tokenization 和生成
5. 调整采样参数控制输出质量与随机性

> **核心**：vLLM 的批量推理不是"把多个请求串起来跑"，而是让多个请求共享同一个 GPU 执行周期，吞吐量的提升是真实的并发，而不是并发模拟。

---

## 一、选择合适的 7B 模型

### 1.1 推荐模型

| 模型 | HuggingFace ID | 显存需求（FP16） | 特点 |
|---|---|---|---|
| Qwen2-7B-Instruct | `Qwen/Qwen2-7B-Instruct` | ~14 GB | 中英双语，指令跟随好 |
| Llama-3-8B-Instruct | `meta-llama/Meta-Llama-3-8B-Instruct` | ~16 GB | 英文强，需申请访问 |
| Mistral-7B-Instruct-v0.3 | `mistralai/Mistral-7B-Instruct-v0.3` | ~14 GB | 速度快，社区生态好 |
| Gemma-7B-it | `google/gemma-7b-it` | ~14 GB | 需申请访问 |

本节以 `Qwen/Qwen2-7B-Instruct` 为例，它无需申请权限即可下载。

### 1.2 显存预算公式

粗略估算：

```text
FP16 模型显存(GB) = 参数量(B) × 2
FP8  模型显存(GB) = 参数量(B) × 1
INT4 模型显存(GB) = 参数量(B) × 0.5

7B FP16 模型 ≈ 14 GB
加上 KV cache (默认 gpu_memory_utilization=0.9，剩余 ~10%):
  单张 24GB 显卡：勉强可以跑（需要降低 max_model_len）
  单张 40GB 显卡：舒适运行
  单张 80GB 显卡：富裕，可以运行 13B FP16
```

---

## 二、下载模型

### 2.1 使用 HuggingFace CLI

```bash
pip install huggingface_hub

# 登录（可选，公开模型不需要）
huggingface-cli login

# 下载模型到本地缓存
huggingface-cli download Qwen/Qwen2-7B-Instruct
```

默认缓存路径：`~/.cache/huggingface/hub/`

### 2.2 设置镜像加速（国内环境）

```bash
# 使用 HuggingFace 镜像站
export HF_ENDPOINT=https://hf-mirror.com

# 然后正常下载
huggingface-cli download Qwen/Qwen2-7B-Instruct
```

或者在 Python 脚本里设置：

```python
import os
os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"
```

---

## 三、用 vLLM LLM 类加载并推理

### 3.1 最简单的单条推理

```python
from vllm import LLM, SamplingParams

# 加载模型
# 第一次运行会花几分钟加载权重到 GPU
llm = LLM(model="Qwen/Qwen2-7B-Instruct")

# 定义采样参数
sampling_params = SamplingParams(
    temperature=0.7,
    top_p=0.9,
    max_tokens=200,
)

# 推理
prompt = "请用一句话解释什么是大语言模型。"
outputs = llm.generate([prompt], sampling_params)

# 输出结果
for output in outputs:
    print(f"Prompt: {output.prompt!r}")
    print(f"Output: {output.outputs[0].text!r}")
```

### 3.2 LLM 类的关键参数

```python
llm = LLM(
    model="Qwen/Qwen2-7B-Instruct",

    # 显存使用比例（0.0-1.0），默认 0.9
    # 剩余 10% 留给 CUDA kernel、激活值等
    gpu_memory_utilization=0.9,

    # 最大序列长度（prompt + output tokens）
    # 超出模型原生长度会报错，设小可以省显存
    max_model_len=4096,

    # 数据类型：auto / float16 / bfloat16
    # A100/H100 用 bfloat16 更稳定
    dtype="auto",

    # 张量并行度（多卡时使用，单卡设为 1）
    tensor_parallel_size=1,
)
```

### 3.3 批量推理

批量推理是 vLLM 最重要的使用场景，吞吐量远高于逐条推理：

```python
from vllm import LLM, SamplingParams

llm = LLM(model="Qwen/Qwen2-7B-Instruct")

sampling_params = SamplingParams(
    temperature=0.8,
    top_p=0.95,
    max_tokens=300,
)

# 一次提交多条 prompt
prompts = [
    "请解释什么是 Transformer 架构。",
    "Python 和 JavaScript 的主要区别是什么？",
    "写一首关于春天的五言绝句。",
    "解释一下 TCP/IP 协议的四层模型。",
    "什么是向量数据库，它的应用场景有哪些？",
]

# vLLM 在内部将这些请求并发调度
outputs = llm.generate(prompts, sampling_params)

for i, output in enumerate(outputs):
    prompt = output.prompt
    generated = output.outputs[0].text
    print(f"\n--- 问题 {i+1} ---")
    print(f"输入: {prompt}")
    print(f"输出: {generated[:200]}...")
```

> **核心**：这里的 `llm.generate(prompts, ...)` 不是串行执行的，vLLM 的调度器会将这 5 个请求的 token 生成过程交织在一起，在同一个前向传播 batch 里混合处理。

---

## 四、理解采样参数

### 4.1 SamplingParams 详解

```python
sampling_params = SamplingParams(
    # 温度：控制随机性。0 = 贪婪搜索，越高越随机
    temperature=0.7,

    # top-p：只从累积概率达到 p 的 token 中采样
    top_p=0.9,

    # top-k：只从概率最高的 k 个 token 中采样
    top_k=50,

    # 最大生成 token 数
    max_tokens=512,

    # 重复惩罚：> 1.0 惩罚重复，< 1.0 鼓励重复
    repetition_penalty=1.1,

    # 停止词：遇到这些字符串就停止生成
    stop=["<|endoftext|>", "\n\n---"],

    # 最少生成 token 数（防止太短的回答）
    min_tokens=10,

    # 返回多少个候选结果
    n=1,

    # 是否返回 log probability（调试用）
    logprobs=None,
)
```

### 4.2 不同场景的参数建议

| 场景 | temperature | top_p | max_tokens | 说明 |
|---|---|---|---|---|
| 代码生成 | 0.0-0.2 | 0.95 | 1024 | 确定性强，避免幻觉 |
| 问答 | 0.5-0.7 | 0.9 | 512 | 平衡准确性与流畅度 |
| 创意写作 | 0.8-1.0 | 0.95 | 1024 | 高随机性增加多样性 |
| 数据提取 | 0.0 | 1.0 | 256 | 完全确定性 |

---

## 五、Chat 模板与消息格式

7B 指令微调模型通常需要特定的 chat 模板格式。vLLM 支持直接传入格式化好的 prompt，也可以用 tokenizer 的 apply_chat_template。

### 5.1 手动构造 Qwen2 格式的 prompt

```python
def build_qwen_prompt(system: str, user: str) -> str:
    return (
        f"<|im_start|>system\n{system}<|im_end|>\n"
        f"<|im_start|>user\n{user}<|im_end|>\n"
        f"<|im_start|>assistant\n"
    )

prompt = build_qwen_prompt(
    system="你是一个专业的 AI 助手，回答简洁准确。",
    user="什么是 PagedAttention？"
)

outputs = llm.generate([prompt], SamplingParams(max_tokens=300, temperature=0.7))
print(outputs[0].outputs[0].text)
```

### 5.2 使用 tokenizer 的 apply_chat_template

```python
from transformers import AutoTokenizer

tokenizer = AutoTokenizer.from_pretrained("Qwen/Qwen2-7B-Instruct")

messages = [
    {"role": "system", "content": "你是一个专业的 AI 助手。"},
    {"role": "user", "content": "解释一下什么是 PagedAttention。"},
]

# 使用 tokenizer 的模板
prompt = tokenizer.apply_chat_template(
    messages,
    tokenize=False,
    add_generation_prompt=True,
)

outputs = llm.generate([prompt], SamplingParams(max_tokens=300, temperature=0.7))
print(outputs[0].outputs[0].text)
```

---

## 六、完整示例：多轮对话批量推理

```python
#!/usr/bin/env python3
"""vLLM 批量推理示例"""
import time
from vllm import LLM, SamplingParams
from transformers import AutoTokenizer

MODEL_ID = "Qwen/Qwen2-7B-Instruct"

def build_prompts(conversations: list[dict]) -> list[str]:
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    prompts = []
    for conv in conversations:
        prompt = tokenizer.apply_chat_template(
            conv["messages"],
            tokenize=False,
            add_generation_prompt=True,
        )
        prompts.append(prompt)
    return prompts


def main():
    print("加载模型中...")
    llm = LLM(
        model=MODEL_ID,
        gpu_memory_utilization=0.85,
        max_model_len=4096,
        dtype="auto",
    )

    conversations = [
        {"messages": [
            {"role": "user", "content": "请用 3 句话解释神经网络。"}
        ]},
        {"messages": [
            {"role": "user", "content": "Python 的 GIL 是什么？"}
        ]},
        {"messages": [
            {"role": "user", "content": "什么是 Transformer 的 Attention 机制？"}
        ]},
    ]

    prompts = build_prompts(conversations)

    sampling_params = SamplingParams(
        temperature=0.7,
        top_p=0.9,
        max_tokens=256,
    )

    print(f"\n开始批量推理，共 {len(prompts)} 条请求...")
    start = time.time()
    outputs = llm.generate(prompts, sampling_params)
    elapsed = time.time() - start

    total_tokens = sum(len(o.outputs[0].token_ids) for o in outputs)
    print(f"完成！耗时 {elapsed:.2f}s，共生成 {total_tokens} tokens")
    print(f"平均吞吐量: {total_tokens / elapsed:.1f} tokens/s\n")

    for i, output in enumerate(outputs):
        question = conversations[i]["messages"][0]["content"]
        answer = output.outputs[0].text
        print(f"Q{i+1}: {question}")
        print(f"A{i+1}: {answer[:150]}...")
        print()

if __name__ == "__main__":
    main()
```

---

## 小结

- 7B FP16 模型约需 14 GB 显存，加上 KV cache 建议至少 24 GB，40 GB 以上最为舒适
- `LLM` 类的核心参数：`gpu_memory_utilization`（显存占比）和 `max_model_len`（最大序列长度），这两个参数最影响是否能成功加载
- `SamplingParams` 中 `temperature=0` 等于贪婪搜索，代码生成和结构化提取建议用低温度
- 指令微调模型需要 chat 模板，推荐用 tokenizer 的 `apply_chat_template` 构造 prompt，避免手动拼接出错
- 批量推理时把多条 prompt 一次传入 `llm.generate`，而不是循环调用，这样才能利用 vLLM 的并发调度
