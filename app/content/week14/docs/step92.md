# Step 92: vLLM 高性能推理｜安装 vLLM

## 学习目标

vLLM 是目前生产级 LLM 推理领域最受关注的开源框架之一。这一节我们先把它装起来，然后理解它为什么比朴素 Transformers 推理快。

完成后你应该能：

1. 说清楚 vLLM 相比朴素 Transformers 推理快在哪里
2. 完成 GPU 环境检查与 vLLM 安装
3. 用 Python 跑一个冒烟验证，确认安装成功
4. 用 Docker 启动 vLLM OpenAI 兼容服务作为备选方案
5. 处理安装过程中最常见的 CUDA 版本冲突问题

> **核心**：vLLM 的速度优势不来自模型权重，而来自它彻底重写了 KV cache 管理和请求调度两个底层模块。

---

## 一、vLLM 是什么，为什么快

### 1.1 定位

vLLM 是 UC Berkeley 开源的高吞吐量 LLM 推理引擎，专门面向多并发请求的服务场景。与 HuggingFace `transformers` 库相比，它不是在"用模型做推理"，而是在"把推理当作系统问题来解决"。

主要特性一览：

| 特性 | 说明 |
|---|---|
| PagedAttention | 把 KV cache 按页管理，彻底消除显存碎片 |
| Continuous Batching | 请求级调度，GPU 几乎不空转 |
| OpenAI 兼容 API | 直接替换 OpenAI endpoint，无需改前端代码 |
| Tensor Parallelism | 原生支持多卡张量并行 |
| 量化支持 | 支持 AWQ / GPTQ / FP8 等格式 |
| 广泛模型支持 | LLaMA / Qwen / Mistral / Gemma / ChatGLM 等 |

### 1.2 朴素 Transformers 推理的瓶颈在哪里

朴素推理的典型流程：

```text
请求 A 到来
  -> 分配固定长度 KV cache（按 max_seq_len 预留显存）
  -> 推理中 A
  -> A 结束，释放显存
请求 B 到来
  -> 分配固定长度 KV cache
  -> 推理中 B
  ...
```

这个模型有两个根本问题：

1. **显存碎片**：每个请求预留的 KV cache 是最大长度，实际用不到的那部分白白浪费
2. **串行批处理**：一批请求必须同时开始、同时结束，GPU 利用率依赖最慢的那个请求

vLLM 的 PagedAttention 把 KV cache 变成动态分页，Continuous Batching 把请求调度变成流式插入，两者合力让 GPU 几乎没有空闲。

### 1.3 架构对比

```text
朴素 Transformers 推理
┌─────────────────────────────────────────┐
│  Batch [req1, req2, req3]               │
│  KV cache: [max_len × batch] 预分配      │
│  req1 结束 → 等 req2、req3 → 释放显存    │
│  GPU 利用率 60-70%，显存浪费 20-40%      │
└─────────────────────────────────────────┘

vLLM 推理
┌─────────────────────────────────────────┐
│  Scheduler (Continuous Batching)        │
│  ┌─────────────────────────────────┐    │
│  │  运行中: [req1(t=5), req3(t=2)] │    │
│  │  等待中: [req4, req5, req6]     │    │
│  └─────────────────────────────────┘    │
│  PagedAttention: KV cache 按需分页      │
│  req1 结束 → 立即插入 req4 → 继续推理   │
│  GPU 利用率 >90%，显存浪费 <5%          │
└─────────────────────────────────────────┘
```

---

## 二、系统要求

### 2.1 硬件要求

| 项目 | 最低配置 | 推荐配置 |
|---|---|---|
| GPU | NVIDIA 显卡（Ampere 架构及以上最佳） | A100 / H100 / RTX 3090+ |
| 显存 | 16 GB（7B 模型 FP16） | 40 GB+（13B+模型） |
| CUDA | 11.8+ | 12.1+ |
| 系统 | Linux | Ubuntu 22.04 / RHEL 8 |

> **注意**：vLLM 目前仅官方支持 Linux + NVIDIA GPU。macOS 和 Windows 均不在官方支持范围内，本地开发可以使用 Docker 或云 GPU 实例。

### 2.2 软件要求

```text
Python  3.9 - 3.12
CUDA    11.8 / 12.1 / 12.4（选一个，与驱动版本匹配）
pip     23.0+
```

检查 CUDA 版本：

```bash
nvidia-smi
# 查看右上角 CUDA Version: x.x

nvcc --version
# 查看编译器版本，需与 nvidia-smi 匹配
```

---

## 三、安装 vLLM

### 3.1 pip 安装（推荐）

```bash
# 创建独立虚拟环境（强烈建议）
python -m venv vllm-env
source vllm-env/bin/activate

# 升级 pip
pip install --upgrade pip

# 安装 vLLM（自动匹配 CUDA 版本）
pip install vllm

# 如果需要指定 CUDA 版本（例如 CUDA 12.1）
pip install vllm --extra-index-url https://download.pytorch.org/whl/cu121
```

安装时间通常在 5-15 分钟，因为需要下载 torch 和其他依赖项。

### 3.2 冒烟验证

安装完成后立即验证：

```bash
python -c "from vllm import LLM, SamplingParams; print('vLLM import OK')"
```

期望输出：

```text
vLLM import OK
```

如果看到报错，跳到第五节排查。

### 3.3 查看版本信息

```bash
python -c "import vllm; print(vllm.__version__)"
# 例如: 0.4.2

python -c "import torch; print(torch.cuda.is_available(), torch.version.cuda)"
# 期望: True 12.1
```

---

## 四、Docker 方式（无 GPU 环境的备选）

### 4.1 拉取官方镜像

```bash
# 官方 OpenAI 兼容服务镜像
docker pull vllm/vllm-openai:latest
```

### 4.2 启动服务

```bash
docker run --runtime nvidia --gpus all \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  --env "HUGGING_FACE_HUB_TOKEN=<your-hf-token>" \
  -p 8000:8000 \
  --ipc=host \
  vllm/vllm-openai:latest \
  --model Qwen/Qwen2-7B-Instruct
```

参数说明：

| 参数 | 说明 |
|---|---|
| `--runtime nvidia --gpus all` | 将所有 GPU 挂载进容器 |
| `-v ~/.cache/huggingface:...` | 挂载 HuggingFace 模型缓存目录 |
| `--ipc=host` | 共享主机 IPC 命名空间（多进程通信需要） |
| `--model` | 指定要加载的模型 |

启动后访问 `http://localhost:8000/v1/models` 验证服务是否就绪。

### 4.3 用 curl 快速测试

```bash
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen/Qwen2-7B-Instruct",
    "messages": [{"role": "user", "content": "你好"}],
    "max_tokens": 50
  }'
```

---

## 五、常见安装问题与修复

### 5.1 CUDA 版本不匹配

**症状**：

```text
RuntimeError: CUDA error: no kernel image is available for execution on the device
```

**原因**：pip 安装的 torch 版本与系统 CUDA 驱动不匹配。

**修复**：

```bash
# 先卸载冲突版本
pip uninstall torch torchvision torchaudio vllm -y

# 指定与驱动版本匹配的 CUDA 版本重新安装
# CUDA 11.8:
pip install torch --index-url https://download.pytorch.org/whl/cu118
pip install vllm

# CUDA 12.1:
pip install torch --index-url https://download.pytorch.org/whl/cu121
pip install vllm
```

### 5.2 显存不足

**症状**：

```text
torch.cuda.OutOfMemoryError: CUDA out of memory
```

**修复**：

```python
# 降低 gpu_memory_utilization（默认 0.9）
from vllm import LLM
llm = LLM(model="...", gpu_memory_utilization=0.7)
```

### 5.3 `triton` 依赖报错

**症状**：

```text
ImportError: cannot import name 'cdiv' from 'triton.language'
```

**修复**：

```bash
pip install triton==2.1.0
```

### 5.4 `flash-attn` 编译失败

vLLM 对 flash-attention 的依赖是可选的，如果编译失败可以跳过：

```bash
pip install vllm --no-build-isolation
# 或者直接忽略 flash-attn
export VLLM_NO_USAGE_STATS=1
pip install vllm
```

---

## 六、验证安装的完整脚本

将以下内容保存为 `check_vllm.py`：

```python
#!/usr/bin/env python3
"""vLLM 安装验证脚本"""

import sys

def check_python():
    version = sys.version_info
    ok = version >= (3, 9)
    print(f"Python {version.major}.{version.minor}: {'OK' if ok else 'FAIL (需要 3.9+)'}")
    return ok

def check_torch():
    try:
        import torch
        cuda_ok = torch.cuda.is_available()
        print(f"PyTorch {torch.__version__}: OK")
        print(f"CUDA 可用: {'OK (' + torch.version.cuda + ')' if cuda_ok else 'FAIL'}")
        if cuda_ok:
            for i in range(torch.cuda.device_count()):
                props = torch.cuda.get_device_properties(i)
                mem_gb = props.total_memory / 1024**3
                print(f"  GPU {i}: {props.name} ({mem_gb:.1f} GB)")
        return cuda_ok
    except ImportError:
        print("PyTorch: FAIL (未安装)")
        return False

def check_vllm():
    try:
        import vllm
        print(f"vLLM {vllm.__version__}: OK")
        return True
    except ImportError as e:
        print(f"vLLM: FAIL ({e})")
        return False

def main():
    print("=" * 50)
    print("vLLM 环境检查")
    print("=" * 50)
    results = [
        check_python(),
        check_torch(),
        check_vllm(),
    ]
    print("=" * 50)
    if all(results):
        print("所有检查通过，可以开始使用 vLLM")
    else:
        print("有检查项未通过，请参考文档排查")

if __name__ == "__main__":
    main()
```

运行：

```bash
python check_vllm.py
```

期望输出：

```text
==================================================
vLLM 环境检查
==================================================
Python 3.11: OK
PyTorch 2.3.0: OK
CUDA 可用: OK (12.1)
  GPU 0: NVIDIA A100-SXM4-80GB (79.2 GB)
vLLM 0.4.2: OK
==================================================
所有检查通过，可以开始使用 vLLM
```

---

## 小结

- vLLM 的速度优势来自 PagedAttention（解决显存碎片）和 Continuous Batching（解决批处理空转），而不是模型权重的变化
- 安装推荐使用独立 venv，避免与其他项目的 torch 版本冲突
- CUDA 版本匹配是安装失败的首要原因，要先确认 `nvidia-smi` 输出再选择对应的安装命令
- 无 GPU 本地环境可以用 Docker 镜像启动 OpenAI 兼容服务，下一步同样适用
- 冒烟验证通过后再进入下一步，省得在模型加载阶段才发现环境问题
