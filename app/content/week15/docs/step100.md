# Step 100: 模型量化｜做一次量化实验

## 学习目标

理论说清楚了，现在动手。完成本节后，你应该能：

1. 搭建一个可重复的量化实验环境（Python + bitsandbytes 或 Ollama）
2. 在相同 Prompt 集合下运行 fp16、int8、int4 三组对比
3. 记录每组的显存占用、推理时间、输出文本
4. 识别量化带来的输出差异（质量感知层面）
5. 形成一套可复用的实验脚本框架

> **核心**：一次动手实验抵过十遍阅读理论。量化的"感觉"只有跑过才有——你会发现 int4 有时候比你想象的好，有时候又会出现意想不到的退化。

---

## 一、实验设计原则

### 1.1 好实验的三个要素

```text
控制变量：除了量化精度，其他都一样
  - 相同的基础模型（同一个 checkpoint）
  - 相同的测试 Prompt
  - 相同的生成参数（temperature=0, max_new_tokens=256）

可测量：记录可以对比的数字
  - 加载时间（秒）
  - 峰值显存（MB）
  - 首 token 延迟（ms）
  - 总推理时间（ms）
  - 输出 token 数量

可复现：代码要能重跑
  - 固定随机种子
  - 记录库版本
  - 输出保存到文件
```

### 1.2 实验矩阵

本次实验将覆盖：

| 配置 | 精度 | 实现方式 | 预期显存 |
|------|------|---------|---------|
| A | FP16 | transformers 原生 | ~3 GB (1.5B 模型) |
| B | int8 | bitsandbytes load_in_8bit | ~1.5 GB |
| C | int4 NF4 | bitsandbytes load_in_4bit | ~0.75 GB |
| D | GPTQ int4 | auto-gptq（如可用） | ~0.75 GB |

使用模型：`Qwen/Qwen2-1.5B-Instruct`（较小，适合显存受限环境）

---

## 二、环境准备

### 2.1 Python 环境

```bash
# 创建虚拟环境
python -m venv quant_exp
source quant_exp/bin/activate   # Windows: quant_exp\Scripts\activate

# 安装依赖
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
pip install transformers==4.44.0
pip install bitsandbytes==0.43.3
pip install accelerate>=0.27.0
pip install auto-gptq optimum   # 可选，GPTQ 支持
pip install sentencepiece protobuf

# 验证安装
python -c "import bitsandbytes; print(bitsandbytes.__version__)"
python -c "import torch; print(torch.cuda.is_available())"
```

### 2.2 确认 GPU 状态

```bash
nvidia-smi
# 记录初始显存占用（应该接近 0）

# 或用 Python
python -c "
import torch
print(f'GPU: {torch.cuda.get_device_name(0)}')
print(f'总显存: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB')
print(f'当前空闲: {(torch.cuda.get_device_properties(0).total_memory - torch.cuda.memory_allocated()) / 1024**3:.1f} GB')
"
```

### 2.3 Ollama 备选方案（无 GPU 时）

```bash
# macOS
brew install ollama
ollama serve &   # 后台启动

# 拉取模型（GGUF 量化版）
ollama pull qwen2:1.5b          # 默认 q4_K_M
ollama pull nomic-embed-text    # 如果需要 embedding

# 验证
curl http://localhost:11434/api/tags | python -m json.tool
```

---

## 三、核心实验脚本

```python
#!/usr/bin/env python3
"""
quantization_experiment.py
完整量化对比实验：fp16 vs int8 vs int4
"""

import time
import json
import gc
from pathlib import Path
from datetime import datetime
from dataclasses import dataclass, asdict
from typing import Optional

import torch
from transformers import (
    AutoTokenizer,
    AutoModelForCausalLM,
    BitsAndBytesConfig
)

# ─────────────────────────────────────────────
# 实验配置
# ─────────────────────────────────────────────
MODEL_ID = "Qwen/Qwen2-1.5B-Instruct"
OUTPUT_DIR = Path("./experiment_results")
OUTPUT_DIR.mkdir(exist_ok=True)

# 5 个测试 Prompt，覆盖不同任务类型
TEST_PROMPTS = [
    {
        "id": "factual",
        "category": "事实问答",
        "prompt": "请问中国长城的总长度是多少公里？它建造于哪个朝代？"
    },
    {
        "id": "reasoning",
        "category": "逻辑推理",
        "prompt": "如果一列火车以 120km/h 的速度行驶，需要 2.5 小时才能到达目的地，请问这段距离是多少公里？请给出计算过程。"
    },
    {
        "id": "code",
        "category": "代码生成",
        "prompt": "请用 Python 写一个函数，接受一个整数列表，返回其中所有偶数的平方和。"
    },
    {
        "id": "chinese_text",
        "category": "中文写作",
        "prompt": "请用 100 字以内，描述春天的景色。要求文笔优美，有意境。"
    },
    {
        "id": "translation",
        "category": "翻译",
        "prompt": "请将以下句子翻译成英文：'量化技术可以在保持模型性能的同时，显著降低内存占用和推理延迟。'"
    }
]

GENERATION_CONFIG = {
    "max_new_tokens": 256,
    "do_sample": False,        # 贪心解码，确保可复现
    "temperature": 1.0,
    "repetition_penalty": 1.1,
}

# ─────────────────────────────────────────────
# 数据类
# ─────────────────────────────────────────────
@dataclass
class InferenceResult:
    prompt_id: str
    category: str
    prompt: str
    response: str
    input_tokens: int
    output_tokens: int
    inference_time_ms: float
    tokens_per_second: float

@dataclass
class ExperimentResult:
    quantization: str
    model_id: str
    load_time_s: float
    model_memory_mb: float
    peak_gpu_memory_mb: float
    results: list
    timestamp: str

# ─────────────────────────────────────────────
# 模型加载函数
# ─────────────────────────────────────────────
def load_model_fp16(model_id: str):
    """加载 FP16 全精度模型"""
    start = time.time()
    model = AutoModelForCausalLM.from_pretrained(
        model_id,
        torch_dtype=torch.float16,
        device_map="auto",
        trust_remote_code=True,
    )
    load_time = time.time() - start
    return model, load_time

def load_model_int8(model_id: str):
    """加载 int8 量化模型"""
    config = BitsAndBytesConfig(load_in_8bit=True)
    start = time.time()
    model = AutoModelForCausalLM.from_pretrained(
        model_id,
        quantization_config=config,
        device_map="auto",
        trust_remote_code=True,
    )
    load_time = time.time() - start
    return model, load_time

def load_model_int4(model_id: str):
    """加载 int4 NF4 量化模型"""
    config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_use_double_quant=True,
    )
    start = time.time()
    model = AutoModelForCausalLM.from_pretrained(
        model_id,
        quantization_config=config,
        device_map="auto",
        trust_remote_code=True,
    )
    load_time = time.time() - start
    return model, load_time

# ─────────────────────────────────────────────
# 推理函数
# ─────────────────────────────────────────────
def run_inference(model, tokenizer, prompt_info: dict) -> InferenceResult:
    """对单个 Prompt 运行推理，返回结果和计时"""
    messages = [{"role": "user", "content": prompt_info["prompt"]}]
    text = tokenizer.apply_chat_template(
        messages,
        tokenize=False,
        add_generation_prompt=True
    )
    inputs = tokenizer([text], return_tensors="pt").to(model.device)
    input_len = inputs.input_ids.shape[1]

    # 预热（第一次推理有 JIT 编译开销）
    if not hasattr(run_inference, "_warmed_up"):
        with torch.no_grad():
            model.generate(**inputs, max_new_tokens=5)
        run_inference._warmed_up = True

    # 计时推理
    torch.cuda.synchronize() if torch.cuda.is_available() else None
    start = time.perf_counter()

    with torch.no_grad():
        outputs = model.generate(**inputs, **GENERATION_CONFIG)

    torch.cuda.synchronize() if torch.cuda.is_available() else None
    elapsed_ms = (time.perf_counter() - start) * 1000

    # 解码输出
    response_ids = outputs[0][input_len:]
    response = tokenizer.decode(response_ids, skip_special_tokens=True)
    output_tokens = len(response_ids)

    return InferenceResult(
        prompt_id=prompt_info["id"],
        category=prompt_info["category"],
        prompt=prompt_info["prompt"],
        response=response.strip(),
        input_tokens=input_len,
        output_tokens=output_tokens,
        inference_time_ms=elapsed_ms,
        tokens_per_second=output_tokens / (elapsed_ms / 1000),
    )

# ─────────────────────────────────────────────
# 内存测量
# ─────────────────────────────────────────────
def get_model_param_memory_mb(model) -> float:
    """计算模型参数自身占用的内存"""
    total = sum(p.numel() * p.element_size() for p in model.parameters())
    return total / 1024**2

def get_peak_gpu_memory_mb() -> float:
    """获取峰值 GPU 显存（MB）"""
    if torch.cuda.is_available():
        return torch.cuda.max_memory_allocated() / 1024**2
    return 0.0

# ─────────────────────────────────────────────
# 主实验函数
# ─────────────────────────────────────────────
def run_experiment(quant_name: str, load_fn, tokenizer) -> ExperimentResult:
    print(f"\n{'='*60}")
    print(f"开始实验：{quant_name}")
    print(f"{'='*60}")

    # 清理 GPU 缓存
    if torch.cuda.is_available():
        torch.cuda.reset_peak_memory_stats()
        torch.cuda.empty_cache()

    # 加载模型
    model, load_time = load_fn(MODEL_ID)
    param_mem = get_model_param_memory_mb(model)
    print(f"加载完成：{load_time:.1f}s，参数内存 {param_mem:.1f} MB")

    # 运行推理
    all_results = []
    for prompt_info in TEST_PROMPTS:
        print(f"  推理: [{prompt_info['category']}] {prompt_info['prompt'][:30]}...")
        result = run_inference(model, tokenizer, prompt_info)
        all_results.append(asdict(result))
        print(f"    → {result.output_tokens} tokens，{result.inference_time_ms:.0f}ms，"
              f"{result.tokens_per_second:.1f} tok/s")

    peak_gpu = get_peak_gpu_memory_mb()

    # 清理模型释放显存
    del model
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    return ExperimentResult(
        quantization=quant_name,
        model_id=MODEL_ID,
        load_time_s=load_time,
        model_memory_mb=param_mem,
        peak_gpu_memory_mb=peak_gpu,
        results=all_results,
        timestamp=datetime.now().isoformat(),
    )

# ─────────────────────────────────────────────
# 主程序
# ─────────────────────────────────────────────
def main():
    print(f"量化实验开始：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"模型：{MODEL_ID}")

    # 加载 tokenizer（所有配置共用）
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, trust_remote_code=True)

    experiments = [
        ("FP16",  load_model_fp16),
        ("INT8",  load_model_int8),
        ("INT4",  load_model_int4),
    ]

    all_results = []
    for quant_name, load_fn in experiments:
        exp = run_experiment(quant_name, load_fn, tokenizer)
        all_results.append(asdict(exp))

        # 逐个保存结果，避免中途崩溃丢失数据
        out_file = OUTPUT_DIR / f"result_{quant_name.lower()}.json"
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(asdict(exp), f, ensure_ascii=False, indent=2)
        print(f"结果已保存: {out_file}")

    # 保存汇总
    summary_file = OUTPUT_DIR / "summary.json"
    with open(summary_file, "w", encoding="utf-8") as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)

    # 打印摘要
    print_summary(all_results)

def print_summary(results: list):
    print(f"\n{'='*60}")
    print("实验摘要")
    print(f"{'='*60}")
    print(f"{'量化':10} {'加载时间':>10} {'参数内存':>12} {'峰值显存':>12} {'平均延迟':>12} {'平均速度':>12}")
    print("-" * 70)
    for r in results:
        avg_latency = sum(x["inference_time_ms"] for x in r["results"]) / len(r["results"])
        avg_tps = sum(x["tokens_per_second"] for x in r["results"]) / len(r["results"])
        print(f"{r['quantization']:10} "
              f"{r['load_time_s']:>9.1f}s "
              f"{r['model_memory_mb']:>10.1f}MB "
              f"{r['peak_gpu_memory_mb']:>10.1f}MB "
              f"{avg_latency:>10.0f}ms "
              f"{avg_tps:>10.1f}t/s")

if __name__ == "__main__":
    main()
```

---

## 四、Ollama 版实验（无 GPU 时使用）

```python
#!/usr/bin/env python3
"""
ollama_experiment.py
使用 Ollama 对比不同 GGUF 量化模型
不需要 GPU，纯 CPU 运行
"""

import time
import json
import requests
from pathlib import Path

OLLAMA_BASE = "http://localhost:11434"
OUTPUT_DIR = Path("./ollama_results")
OUTPUT_DIR.mkdir(exist_ok=True)

# 要测试的模型（先用 ollama pull 拉取）
MODELS = [
    "qwen2:1.5b",           # 默认 q4_K_M
    # "qwen2:7b-instruct",  # 如果有足够内存
]

TEST_PROMPTS = [
    {"id": "factual",   "prompt": "请问中国长城的总长度是多少公里？"},
    {"id": "reasoning", "prompt": "3 的 8 次方等于多少？请给出计算过程。"},
    {"id": "code",      "prompt": "用 Python 写一个冒泡排序函数。"},
    {"id": "chinese",   "prompt": "用 50 字描述秋天的景色。"},
    {"id": "english",   "prompt": "Translate to English: 量化可以显著降低模型的内存占用。"},
]

def chat(model: str, prompt: str) -> dict:
    """调用 Ollama chat API，返回响应和计时"""
    start = time.perf_counter()
    resp = requests.post(
        f"{OLLAMA_BASE}/api/chat",
        json={
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False,
            "options": {
                "temperature": 0,
                "num_predict": 256,
            }
        },
        timeout=120
    )
    elapsed_ms = (time.perf_counter() - start) * 1000
    data = resp.json()
    return {
        "response": data["message"]["content"],
        "elapsed_ms": elapsed_ms,
        "eval_count": data.get("eval_count", 0),        # 输出 token 数
        "eval_duration_ns": data.get("eval_duration", 0),  # 推理时间（纳秒）
        "tokens_per_second": (
            data.get("eval_count", 0) /
            (data.get("eval_duration", 1) / 1e9)
        ) if data.get("eval_duration") else 0,
    }

def run_ollama_experiment(model: str) -> dict:
    print(f"\n测试模型: {model}")
    results = []
    for p in TEST_PROMPTS:
        print(f"  [{p['id']}] {p['prompt'][:30]}...")
        r = chat(model, p["prompt"])
        results.append({
            "prompt_id": p["id"],
            "prompt": p["prompt"],
            "response": r["response"][:200],  # 截断显示
            "elapsed_ms": r["elapsed_ms"],
            "tokens_per_second": r["tokens_per_second"],
        })
        print(f"    → {r['elapsed_ms']:.0f}ms, {r['tokens_per_second']:.1f} tok/s")

    return {"model": model, "results": results}

def main():
    all_results = []
    for model in MODELS:
        exp = run_ollama_experiment(model)
        all_results.append(exp)

    # 保存结果
    out = OUTPUT_DIR / "ollama_summary.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)
    print(f"\n结果保存至: {out}")

if __name__ == "__main__":
    main()
```

---

## 五、分析结果

### 5.1 用脚本解析结果

```python
#!/usr/bin/env python3
"""
analyze_results.py
从保存的 JSON 结果中生成对比报告
"""

import json
from pathlib import Path

def analyze():
    result_dir = Path("./experiment_results")
    results = []
    for f in sorted(result_dir.glob("result_*.json")):
        with open(f) as fp:
            results.append(json.load(fp))

    if not results:
        print("未找到结果文件，请先运行 quantization_experiment.py")
        return

    # 按 Prompt 类型对比
    print("\n=== 按任务类型的推理速度（tokens/s）===")
    headers = ["任务类型"] + [r["quantization"] for r in results]
    print(f"{'任务类型':15}" + "".join(f"{h:>12}" for h in headers[1:]))
    print("-" * (15 + 12 * len(results)))

    categories = set(x["category"] for x in results[0]["results"])
    for cat in sorted(categories):
        row = f"{cat:15}"
        for r in results:
            match = next((x for x in r["results"] if x["category"] == cat), None)
            tps = match["tokens_per_second"] if match else 0
            row += f"{tps:>12.1f}"
        print(row)

    # 内存对比
    print("\n=== 内存占用对比 ===")
    for r in results:
        ratio = r["model_memory_mb"] / results[0]["model_memory_mb"] * 100
        print(f"{r['quantization']:10} 参数内存: {r['model_memory_mb']:8.1f} MB "
              f"（FP16 的 {ratio:.0f}%）  "
              f"峰值显存: {r['peak_gpu_memory_mb']:8.1f} MB")

    # 输出质量差异（主观对比）
    print("\n=== 输出质量对比（[事实问答] Prompt）===")
    for r in results:
        factual = next((x for x in r["results"] if x["prompt_id"] == "factual"), None)
        if factual:
            print(f"\n[{r['quantization']}]")
            print(f"  {factual['response'][:150]}...")

if __name__ == "__main__":
    analyze()
```

### 5.2 预期结果解读

```text
典型实验结果（Qwen2-1.5B，RTX 4080）：

量化      加载时间  参数内存    峰值显存   平均延迟  平均速度
FP16       8.2s    2,940MB    3,840MB    1,450ms   87.2 t/s
INT8       9.8s    1,485MB    2,210MB    1,890ms   66.8 t/s
INT4       11.1s    795MB    1,420MB    1,210ms   104.3 t/s

关键发现：
1. int4 速度比 fp16 快！（因为内存带宽降低，实际计算吞吐更高）
2. int8 反而最慢（量化/反量化开销未被带宽节省完全抵消）
3. int4 内存仅 fp16 的 27%（压缩比 ~3.7x）
4. 质量差异：闲聊和简单问答几乎无差异，数学推理 int4 开始出错
```

---

## 六、常见问题排查

### 6.1 bitsandbytes 安装失败

```bash
# 常见错误：CUDA 版本不匹配
pip install bitsandbytes --upgrade
# 或手动指定版本
pip install bitsandbytes==0.43.3

# Linux 上确认 CUDA toolkit
nvcc --version
# 如果没有，安装
conda install cudatoolkit=12.1
```

### 6.2 显存不足

```python
# 降低生成长度
GENERATION_CONFIG["max_new_tokens"] = 64

# 或使用更小的模型
MODEL_ID = "Qwen/Qwen2-0.5B-Instruct"  # 0.5B 参数

# 或启用 CPU offload
model = AutoModelForCausalLM.from_pretrained(
    MODEL_ID,
    quantization_config=config,
    device_map="auto",
    max_memory={0: "6GiB", "cpu": "30GiB"}  # 超出 GPU 部分放 CPU
)
```

### 6.3 Ollama 连接失败

```bash
# 检查 Ollama 是否启动
curl http://localhost:11434/api/tags

# 如果没有运行
ollama serve

# 检查模型是否已拉取
ollama list
```

---

## 小结

1. **实验设计先行**：控制变量（相同模型、相同 Prompt、相同生成参数）是可靠对比的前提。

2. **bitsandbytes 入门最简单**：三行配置即可从 fp16 切换到 int8 或 int4，无需提前量化。

3. **int4 有时比 int8 快**：内存带宽节省带来的加速可以超过量化开销，实际测试才能确认。

4. **记录要全面**：加载时间、参数内存、峰值显存、推理延迟、tokens/s 缺一不可。

5. **Ollama 是无 GPU 用户的救星**：命令行一键拉取量化模型，API 格式兼容 OpenAI。
