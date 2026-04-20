# Step 94: vLLM 高性能推理｜研究 tensor parallel / paged attention

> **定位**：Week 14 属于进阶选修，服务于高并发部署方向。这里重点是理解系统原理，不要求你暂停 DeepSeek 主线去先做部署。

## 学习目标

理解 vLLM 的两个核心技术：PagedAttention 和 Tensor Parallelism，这是它相对于其他推理框架建立性能优势的根本原因。

完成后你应该能：

1. 说清楚 KV cache 为什么是推理的显存瓶颈
2. 用分页的思路理解 PagedAttention 如何解决碎片问题
3. 理解 Continuous Batching 如何让 GPU 几乎不空转
4. 配置 Tensor Parallelism 把模型拆分到多张 GPU
5. 量化评估这些优化在何种场景下效果最显著

> **核心**：PagedAttention 借鉴了操作系统虚拟内存分页的思想来管理 KV cache；Continuous Batching 借鉴了 CPU 流水线调度的思想来管理请求。这两个想法都不新，但把它们用对地方，效果显著。

---

## 一、KV Cache：推理的显存瓶颈

### 1.1 为什么需要 KV Cache

Transformer 的 Attention 计算需要对所有历史 token 计算 Key 和 Value 矩阵。如果每个 decode step 都重算，代价是 O(n²) 的计算量。

KV Cache 的做法是：把已经计算过的 K、V 矩阵缓存下来，下一步直接复用，只计算新增 token 的 K、V。

```text
生成过程（无 KV Cache）
  step 1: 计算 token[0] 的 K, V
  step 2: 重算 token[0] 的 K, V + 计算 token[1] 的 K, V  ← 浪费
  step 3: 重算 token[0..1] 的 K, V + 计算 token[2] 的 K, V  ← 更多浪费

生成过程（有 KV Cache）
  step 1: 计算 token[0] 的 K, V，缓存到 GPU 显存
  step 2: 读取缓存 + 只计算 token[1] 的 K, V
  step 3: 读取缓存 + 只计算 token[2] 的 K, V  ← O(n) 计算量
```

KV Cache 把计算量从 O(n²) 降到 O(n)，代价是显存占用随序列长度线性增长。

### 1.2 传统 KV Cache 的显存碎片问题

朴素实现通常在请求开始时按 **最大序列长度** 预分配 KV Cache：

```text
请求 A（实际只生成 50 tokens，但预留了 4096 tokens 的空间）
┌────────────────────────────────────────────┐
│ [used: 50 tokens] [wasted: 4046 tokens]   │
└────────────────────────────────────────────┘
请求 B（实际生成 200 tokens）
┌────────────────────────────────────────────┐
│ [used: 200 tokens] [wasted: 3896 tokens]  │
└────────────────────────────────────────────┘
```

浪费率可高达 60-80%，这直接限制了最大并发数。

---

## 二、PagedAttention：分页管理 KV Cache

### 2.1 核心思想

PagedAttention 把 KV Cache 切分成固定大小的"块"（block），每个 block 存储若干个 token 的 K、V 矩阵。请求不再预分配连续的显存空间，而是按需申请 block，就像操作系统的虚拟内存分页。

### 2.2 架构对比

```text
传统 KV Cache（连续分配）
GPU 显存
┌──────────────────────────────────────────────┐
│ Request A: [K0,V0][K1,V1]...[K50,V50][空空空]│  ← 大量内部碎片
│ Request B: [K0,V0][K1,V1]...[K200,V200][空空]│  ← 大量内部碎片
│ [外部碎片：不连续的小块无法使用]              │
└──────────────────────────────────────────────┘

PagedAttention（分页分配）
物理块池（block pool）
┌────┬────┬────┬────┬────┬────┬────┬────┐
│ B0 │ B1 │ B2 │ B3 │ B4 │ B5 │ B6 │ B7 │  ← 每块存 16 个 token 的 K,V
└────┴────┴────┴────┴────┴────┴────┴────┘
  ↑         ↑         ↑    ↑
  A的块1    A的块2    B的块 C的块

块表（block table，类比页表）
  Request A → [B0, B1]      （只申请了够用的块）
  Request B → [B2, B4]      （不要求连续！）
  Request C → [B3]
```

### 2.3 分页的效果

| 指标 | 传统方式 | PagedAttention |
|---|---|---|
| 显存利用率 | 60-80% | >95% |
| 最大并发数 | 受限于预分配碎片 | 接近物理显存上限 |
| 内部碎片 | 最后一个 block 内的碎片 | <4%（block 内未填满部分） |
| 外部碎片 | 严重 | 无 |

### 2.4 块共享：Prefix Caching

PagedAttention 的一个派生优化：如果多个请求有相同的前缀（比如相同的 system prompt），它们可以共享同一批物理块，不需要重复计算这部分的 K、V。

```text
Request A: [system prompt 的 K,V] + [用户问题 A 的 K,V]
Request B: [system prompt 的 K,V] + [用户问题 B 的 K,V]
                ↑
           共享同一批物理块，节省 system prompt 的计算与显存
```

在 vLLM 中启用：

```python
llm = LLM(
    model="Qwen/Qwen2-7B-Instruct",
    enable_prefix_caching=True,   # 启用前缀缓存
)
```

---

## 三、Continuous Batching：让 GPU 不空转

### 3.1 传统 Static Batching 的问题

传统批处理要求一批请求"同进同出"：

```text
时间轴 ────────────────────────────────────>
Batch 1: [req1────────────][req2──][req3──────────────]
          req1 结束后，等待 req2 和 req3 都完成，才能开始 Batch 2
          req2 结束后，GPU 等待 req3 完成（GPU 空转）
Batch 2: [req4──────────────────────────────────]
```

GPU 的等待时间就是浪费的计算资源。

### 3.2 Continuous Batching 的调度方式

vLLM 的调度器在每个 decode step 都重新决定哪些请求进入这一轮 batch：

```text
时间轴 ────────────────────────────────────>
Step 1: [req1, req2, req3]          ← 三个请求一起推进
Step 2: [req1, req2, req3]
Step 3: [req1, req2, req3]
        req2 完成 → 立即插入 req4
Step 4: [req1, req3, req4]          ← req4 插队进来
Step 5: [req1, req3, req4]
        req1 完成 → 立即插入 req5
Step 6: [req3, req4, req5]          ← req5 插队进来
```

没有等待，没有空转，GPU 始终在处理有效请求。

---

## 四、Tensor Parallelism：多卡拆分模型

### 4.1 什么时候需要 Tensor Parallelism

单张 GPU 显存不够装下整个模型时，就需要把模型拆分到多张 GPU 上：

```text
7B  FP16 ≈ 14 GB  → 单张 16 GB 显卡刚好，不需要多卡
13B FP16 ≈ 26 GB  → 需要 2×16 GB 或 1×40 GB
70B FP16 ≈ 140 GB → 需要 2×80 GB 或 4×40 GB
```

### 4.2 Tensor Parallelism 的原理

Tensor Parallelism（TP）把矩阵乘法拆分到多张 GPU 上并行计算：

```text
单卡（完整权重矩阵）
  GPU 0: W[d_model × d_ff] × x → 结果

2 卡 Tensor Parallel
  GPU 0: W[d_model × d_ff/2] × x → 部分结果
  GPU 1: W[d_model × d_ff/2] × x → 部分结果
  AllReduce: GPU0 + GPU1 → 完整结果
```

每张 GPU 只存一半权重，计算量也分摊，但需要 GPU 间通信（AllReduce）。

### 4.3 配置 Tensor Parallelism

```python
from vllm import LLM, SamplingParams

# 使用 2 张 GPU
llm = LLM(
    model="meta-llama/Meta-Llama-3-70B-Instruct",
    tensor_parallel_size=2,       # 使用 2 张 GPU
    gpu_memory_utilization=0.9,
    dtype="bfloat16",
)

# 推理方式不变
outputs = llm.generate(
    ["解释一下量子纠缠。"],
    SamplingParams(max_tokens=300, temperature=0.7),
)
```

或者通过命令行启动 API 服务时指定：

```bash
python -m vllm.entrypoints.openai.api_server \
  --model meta-llama/Meta-Llama-3-70B-Instruct \
  --tensor-parallel-size 4 \
  --port 8000
```

### 4.4 多卡配置建议

| 模型大小 | 推荐 TP 大小 | 原因 |
|---|---|---|
| 7B FP16 | 1 | 单张 24GB 可以跑 |
| 13B FP16 | 2 | 需要 2×16GB 或以上 |
| 34B FP16 | 4 | 需要约 68GB 显存 |
| 70B FP16 | 4-8 | 需要约 140GB 显存 |

> TP 大小必须能整除模型的 attention head 数量，否则会报错。LLaMA-3 70B 有 64 个 head，所以 TP=1/2/4/8 都合法。

---

## 五、Pipeline Parallelism（进阶）

当单机多卡不够时，还可以加 Pipeline Parallelism（PP），把模型的不同层分配到不同节点：

```text
Node 1, GPU 0-3: Layers 0-39  (TP=4)
Node 2, GPU 0-3: Layers 40-79 (TP=4)
总计: 8 张 GPU，PP=2, TP=4
```

vLLM 通过 `pipeline_parallel_size` 参数启用（需要配合 Ray 分布式框架）：

```bash
python -m vllm.entrypoints.openai.api_server \
  --model meta-llama/Meta-Llama-3-70B-Instruct \
  --tensor-parallel-size 4 \
  --pipeline-parallel-size 2 \
  --distributed-executor-backend ray
```

---

## 六、优化效果的量化理解

这些优化在什么条件下最有效：

```text
PagedAttention 效果最显著的场景：
  - 请求的输出长度差异大（有的生成 10 tokens，有的生成 1000 tokens）
  - 系统 prompt 很长（可以利用 Prefix Caching）
  - 并发请求数多（显存碎片的节省累积显著）

Continuous Batching 效果最显著的场景：
  - 请求持续稳定到来（而不是批量一次性来）
  - 不同请求的生成速度差异大
  - 对延迟敏感（新请求不需要等待前一批完成）

Tensor Parallelism 效果最显著的场景：
  - 单张 GPU 装不下模型
  - 有高速互联的多 GPU（NVLink > PCIe）
  - 需要减少单个请求的延迟（不只是吞吐量）
```

---

## 小结

- KV Cache 是推理的必要缓存，但传统连续分配方式会造成大量显存碎片和浪费
- PagedAttention 用分页思想管理 KV Cache，把显存利用率从 60-80% 提升到 95% 以上，本质上是借鉴了操作系统虚拟内存的设计
- Continuous Batching 让每个 decode step 都能动态调度请求的进入和退出，GPU 几乎不空转，这才是吞吐量大幅提升的核心原因
- Tensor Parallelism 把矩阵乘法横向切分到多张 GPU，解决大模型单卡装不下的问题，TP 大小需要能整除模型的 attention head 数
- 这些优化不是孤立的，在 vLLM 里它们同时运作，叠加效果才产生了相比 Transformers 朴素推理 5-24x 的吞吐量提升
