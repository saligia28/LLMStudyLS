# Step 101: 模型量化｜评估速度与损失

## 学习目标

这一节设计评估框架，测量量化对**推理速度**和**模型质量**的实际影响。

完成后你应该能：

1. 用代码精确测量不同精度下的 tokens/s
2. 理解困惑度（Perplexity）作为质量指标的含义
3. 用 ROUGE 分数评估生成文本质量
4. 找到速度和质量的"工程甜点"
5. 用表格形式呈现对比结果

---

## 一、速度评估

```python
# speed_benchmark.py
import time
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

def load_model(model_name, quantization=None):
    """加载不同精度的模型"""
    if quantization == 'int8':
        config = BitsAndBytesConfig(load_in_8bit=True)
    elif quantization == 'int4':
        config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_compute_dtype=torch.float16,
        )
    else:
        config = None

    model = AutoModelForCausalLM.from_pretrained(
        model_name,
        quantization_config=config,
        device_map='auto',
        torch_dtype=torch.float16 if not config else None,
    )
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    return model, tokenizer


def measure_speed(model, tokenizer, prompt, max_new_tokens=100, runs=3):
    """测量生成速度（tokens/s）"""
    inputs = tokenizer(prompt, return_tensors='pt').to(model.device)

    times = []
    token_counts = []

    for _ in range(runs):
        start = time.perf_counter()
        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                do_sample=False,
                temperature=1.0,
                pad_token_id=tokenizer.eos_token_id,
            )
        elapsed = time.perf_counter() - start

        # 只统计新生成的 token 数
        new_tokens = outputs.shape[1] - inputs['input_ids'].shape[1]
        times.append(elapsed)
        token_counts.append(new_tokens)

    # 中位数
    median_idx = len(times) // 2
    sorted_times = sorted(zip(times, token_counts))
    median_time, median_tokens = sorted_times[median_idx]

    return {
        'tps': median_tokens / median_time,
        'latency_ms': median_time * 1000,
        'token_count': median_tokens,
    }


# 测试
MODEL = 'Qwen/Qwen2.5-1.5B-Instruct'  # 用小模型测试更快
PROMPT = '请解释检索增强生成（RAG）的工作原理，包括入库和查询两个阶段。'

configs = [
    ('fp16',  None),
    ('int8',  'int8'),
    ('int4',  'int4'),
]

print('=== 推理速度对比 ===\n')
results = {}

for label, quant in configs:
    print(f'加载 {label} 模型...')
    model, tokenizer = load_model(MODEL, quant)

    # 内存占用
    memory_mb = torch.cuda.memory_allocated() / 1024 / 1024 if torch.cuda.is_available() else 0

    speed = measure_speed(model, tokenizer, PROMPT)
    results[label] = {**speed, 'memory_mb': memory_mb}

    print(f'  TPS: {speed["tps"]:.1f} tokens/s')
    print(f'  延迟: {speed["latency_ms"]:.0f} ms')
    print(f'  显存: {memory_mb:.0f} MB\n')

    del model
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
```

---

## 二、质量评估：困惑度（Perplexity）

困惑度衡量模型对文本的"意外程度"——PPL 越低，模型对文本预测得越准，质量越好。

```python
# perplexity.py
import torch
import math
from transformers import AutoModelForCausalLM, AutoTokenizer

def compute_perplexity(model, tokenizer, texts, stride=512):
    """计算模型在给定文本上的困惑度"""
    model.eval()
    total_loss = 0
    total_tokens = 0

    for text in texts:
        encodings = tokenizer(text, return_tensors='pt')
        input_ids = encodings.input_ids.to(model.device)
        seq_len = input_ids.shape[1]

        # 滑动窗口计算，避免超出上下文长度
        for begin_loc in range(0, seq_len, stride):
            end_loc = min(begin_loc + 1024, seq_len)
            chunk_ids = input_ids[:, begin_loc:end_loc]

            with torch.no_grad():
                outputs = model(chunk_ids, labels=chunk_ids)
                loss = outputs.loss
                total_loss += loss.item() * chunk_ids.shape[1]
                total_tokens += chunk_ids.shape[1]

            if end_loc == seq_len:
                break

    avg_loss = total_loss / total_tokens
    return math.exp(avg_loss)


# 使用 5 段中文测试文本
test_texts = [
    "大语言模型是一种基于 Transformer 架构的深度学习模型，通过在大规模语料上预训练，学习语言的统计规律。",
    "检索增强生成（RAG）将检索系统与生成模型结合，先从知识库中检索相关信息，再由 LLM 生成回答。",
    "向量数据库存储文本的语义表示（embedding），支持相似度搜索，是 RAG 系统的核心组件之一。",
    "量化是将模型权重从高精度（FP32/FP16）压缩为低精度（INT8/INT4）的技术，可以减少内存占用和加速推理。",
    "Python 是一种解释型高级编程语言，因其简洁的语法和丰富的生态系统而广泛用于机器学习领域。",
]

print('\n=== 困惑度对比 ===\n')
for label, quant in configs:
    model, tokenizer = load_model(MODEL, quant)
    ppl = compute_perplexity(model, tokenizer, test_texts)
    print(f'{label:8s}: PPL = {ppl:.2f}')
    del model
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
```

---

## 三、质量评估：ROUGE 分数

ROUGE 通过 n-gram 重叠衡量生成文本与参考答案的相似度：

```python
# rouge_eval.py
from rouge_score import rouge_scorer

def evaluate_quality(model, tokenizer, test_cases):
    """用 ROUGE 评估生成质量"""
    scorer = rouge_scorer.RougeScorer(['rouge1', 'rougeL'], use_stemmer=False)

    scores_r1 = []
    scores_rl = []

    for case in test_cases:
        inputs = tokenizer(case['prompt'], return_tensors='pt').to(model.device)
        with torch.no_grad():
            outputs = model.generate(**inputs, max_new_tokens=150, do_sample=False)
        generated = tokenizer.decode(
            outputs[0][inputs['input_ids'].shape[1]:], skip_special_tokens=True
        )

        score = scorer.score(case['reference'], generated)
        scores_r1.append(score['rouge1'].fmeasure)
        scores_rl.append(score['rougeL'].fmeasure)

    return {
        'rouge1': sum(scores_r1) / len(scores_r1),
        'rougeL': sum(scores_rl) / len(scores_rl),
    }
```

---

## 四、综合对比表

把速度、质量、内存汇总成决策表：

| 精度 | TPS | PPL | ROUGE-1 | 显存 | 综合评分 |
| --- | --- | --- | --- | --- | --- |
| fp16 | 基准 1.0x | 基准 | 基准 | 100% | 质量最好 |
| int8 | ~1.5x | +5-10% | -2-5% | ~60% | 推荐生产 |
| int4 | ~2-3x | +15-25% | -5-15% | ~35% | 推荐边缘/低资源 |

> PPL 变化百分比：量化后相对基准的增量，越小越好。

---

## 五、工程甜点在哪里

```text
通常：int8 是"质量损失最小、速度提升明显"的最优点

适合 int4 的场景：
  · 内存极度受限（< 8GB 显存）
  · 对话类任务（质量损失不明显）
  · 需要跑 13B+ 模型但只有 8B 显存

慎用 int4 的场景：
  · 代码生成（对精度敏感）
  · 数学推理
  · 专业领域知识问答
```

---

## 六、小结

1. **速度提升**：int4 比 fp16 快 2-3x，int8 快约 1.5x。
2. **质量损失**：int8 对日常任务几乎无感，int4 在推理类任务上会有明显下降。
3. **显存节约**：int4 只需 fp16 的 35% 显存，让 7B 在 4GB 显存上跑成为可能。
4. **工程甜点** = int8：质量损失 < 5%，速度提升 50%，性价比最高。
5. 评估要包含多种任务类型，不能只看单一指标。
