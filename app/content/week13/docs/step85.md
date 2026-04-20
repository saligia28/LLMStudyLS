# Step 85: Ollama 入门｜安装 Ollama

> **定位**：Week 13 属于进阶选修，服务于本地部署方向，不是继续学习 DeepSeek 主线的前置条件。下文模型标签与版本号仅作示例，请以 Ollama 官方当前稳定版本与模型库标签为准。

## 学习目标

这一节的重点是建立「本地运行 LLM」的完整心智模型，并完成 Ollama 的安装与第一次模型拉取。

做完本节后，你应该能：

1. 解释 Ollama 是什么，以及为什么本地模型值得学
2. 在 Mac / Linux / Windows 上完成 Ollama 安装并验证
3. 理解 Ollama daemon 的工作方式与模型存储位置
4. 用 `ollama pull` 拉取第一个模型，用 `ollama run` 跑起来
5. 掌握基础 CLI 命令：`list`、`run`、`rm`、`show`

> **核心**：Ollama 把"本地运行大模型"这件复杂的事情降维成了一条命令。理解它背后的机制，是后续 API 调用与性能调优的基础。

---

## 一、什么是 Ollama，为什么要用本地模型

### 1.1 Ollama 的定位

Ollama 是一个本地大模型运行框架，核心做三件事：

1. **模型管理**：类似 Docker，用 pull / push / rm 管理模型版本
2. **推理服务**：在本地启动一个 REST API server（端口 11434）
3. **格式统一**：将各种开源模型统一打包为 GGUF 格式，屏蔽底层差异

```text
你的应用
   |
   v
Ollama REST API (localhost:11434)
   |
   v
llama.cpp 推理引擎
   |
   v
GGUF 模型文件（本地磁盘）
```

### 1.2 为什么要跑本地模型

| 场景 | 云端 API | 本地 Ollama |
|---|---|---|
| 数据隐私 | 数据上传到第三方 | 数据不离开本机 |
| 成本 | 按 token 计费 | 硬件一次性投入 |
| 延迟 | 受网络影响 | 纯本地，无网络延迟 |
| 可用性 | 依赖服务商 SLA | 离线可用 |
| 定制化 | 有限（prompt 层） | 可微调、可改 system prompt |
| 模型选择 | 受限于服务商提供 | 数千个开源模型可选 |

本地模型不是为了替代 OpenAI，而是为了解决 **隐私敏感**、**离线场景**、**成本敏感** 这三类问题。

### 1.3 Ollama 与 llama.cpp 的关系

Ollama 本质上是 llama.cpp 的高级封装：

- **llama.cpp**：底层 C++ 推理引擎，支持 CPU/GPU 混合推理
- **GGUF**：llama.cpp 的模型格式，支持多种量化级别（Q4、Q8 等）
- **Ollama**：在 llama.cpp 上加了模型管理、HTTP API、多并发管理

---

## 二、系统要求

### 2.1 RAM 与模型大小的对应关系

| 模型参数量 | 推荐最低 RAM | 典型模型 |
|---|---|---|
| 1B–3B | 4 GB | llama3.2:1b、phi3:mini |
| 7B–8B | 8 GB | llama3:8b、qwen2:7b |
| 13B | 16 GB | llama2:13b |
| 70B | 48 GB | llama3:70b |

> **注意**：这里的 RAM 指的是可用内存，包括系统内存与 GPU 显存。如果没有独立 GPU，模型会在 CPU + 系统 RAM 上运行，速度更慢但依然可用。

### 2.2 支持的平台

- **macOS**：Apple Silicon（M1/M2/M3）原生支持 Metal GPU 加速；Intel Mac 支持 CPU 模式
- **Linux**：支持 NVIDIA CUDA、AMD ROCm、以及纯 CPU 模式
- **Windows**：通过 WSL2 或原生安装包支持

---

## 三、安装 Ollama

### 3.1 macOS / Linux 一键安装

```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

安装脚本会自动：
1. 检测操作系统与架构
2. 下载对应的 Ollama 二进制文件
3. 注册为系统服务（macOS 注册 LaunchAgent，Linux 注册 systemd service）
4. 启动 Ollama daemon

安装完成后验证：

```bash
ollama --version
# 输出示例：ollama version is 0.3.x
```

### 3.2 macOS 图形安装（可选）

访问 [https://ollama.ai](https://ollama.ai) 下载 `.dmg` 文件，拖入 Applications 即可。安装后菜单栏会出现 Ollama 图标，代表 daemon 已启动。

### 3.3 Linux 手动安装（无 root 权限场景）

```bash
# 下载二进制
curl -L https://ollama.ai/download/ollama-linux-amd64 -o ollama

# 赋予执行权限
chmod +x ollama

# 移动到 PATH 中的目录
sudo mv ollama /usr/local/bin/

# 手动启动 daemon（前台运行）
ollama serve
```

### 3.4 Windows 安装

1. 从 [https://ollama.ai/download/OllamaSetup.exe](https://ollama.ai/download/OllamaSetup.exe) 下载安装包
2. 双击运行，按提示完成安装
3. Ollama 会自动注册为 Windows 服务并启动

或通过 WSL2 使用 Linux 安装方式（推荐，体验更接近 Linux 环境）。

---

## 四、理解 Ollama Daemon

### 4.1 什么是 Ollama Daemon

Ollama daemon 是一个后台服务进程，持续监听端口 `11434`，负责：
- 接收 REST API 请求
- 加载/卸载模型到内存
- 管理并发推理请求
- 与 llama.cpp 推理引擎通信

```text
ollama serve（daemon）
   |
   +-- 监听 http://localhost:11434
   |
   +-- 模型缓存管理（LRU，默认保留 5 分钟）
   |
   +-- 与 llama.cpp 子进程通信
```

### 4.2 检查 Daemon 状态

```bash
# 检查 daemon 是否运行
curl http://localhost:11434/

# 正常返回：
# Ollama is running

# 如果没有运行，手动启动：
ollama serve
```

### 4.3 模型存储位置

| 平台 | 默认存储路径 |
|---|---|
| macOS | `~/.ollama/models/` |
| Linux | `~/.ollama/models/` |
| Windows | `C:\Users\<用户名>\.ollama\models\` |

可以通过环境变量 `OLLAMA_MODELS` 修改存储位置：

```bash
# 修改存储到外部磁盘（Linux/macOS）
export OLLAMA_MODELS=/Volumes/ExternalDisk/ollama-models
ollama serve
```

---

## 五、第一次拉取模型

### 5.1 拉取 llama3:8b

```bash
ollama pull llama3:8b
```

输出示例：

```text
pulling manifest
pulling 8eeb52dfb3bb... 100% ▕████████████████▏ 4.7 GB
pulling 948af2743fc7... 100% ▕████████████████▏ 1.4 KB
pulling 0ba8f0e314b4... 100% ▕████████████████▏  12 KB
pulling 56bb8bd477a5... 100% ▕████████████████▏   96 B
pulling 1a4c3c319823... 100% ▕████████████████▏  485 B
verifying sha256 digest
writing manifest
removing any unused layers
success
```

> llama3:8b 约 4.7 GB，拉取时间取决于网络速度。国内用户可能需要代理或镜像。

### 5.2 拉取更小的模型（网络受限时）

```bash
# 1B 模型，约 1.3 GB
ollama pull llama3.2:1b

# 3B 模型，约 2.0 GB
ollama pull llama3.2:3b
```

---

## 六、基础 CLI 命令速查

### 6.1 模型管理

```bash
# 列出已下载的模型
ollama list

# 输出示例：
# NAME              ID              SIZE    MODIFIED
# llama3:8b         365c0bd3c000    4.7 GB  2 minutes ago
# llama3.2:1b       baf6a787fdff    1.3 GB  5 minutes ago

# 拉取模型
ollama pull <model-name>

# 删除模型
ollama rm llama3:8b

# 查看模型详情
ollama show llama3:8b
```

### 6.2 运行模型

```bash
# 交互式对话（进入 REPL）
ollama run llama3:8b

# 单次提问（管道输入）
echo "用一句话解释什么是机器学习" | ollama run llama3:8b

# 带系统提示
ollama run llama3:8b "你是一个 Python 专家，请帮我..."
```

### 6.3 ollama show 详情

```bash
ollama show llama3:8b

# 输出示例：
#   Model
#     architecture        llama
#     parameters          8.0B
#     context length      8192
#     embedding length    4096
#     quantization        Q4_0
#
#   Parameters
#     stop    "<|start_header_id|>"
#     stop    "<|end_header_id|>"
#     stop    "<|eot_id|>"
```

---

## 七、常见问题排查

### 7.1 Daemon 无法启动

```bash
# 查看日志
journalctl -u ollama -f         # Linux systemd
cat ~/.ollama/logs/server.log   # macOS

# 检查端口占用
lsof -i :11434
```

### 7.2 模型加载太慢

原因通常是内存不足，模型无法完全加载到 RAM，开始使用磁盘 swap。

解决方案：
1. 换用更小的模型（如 `llama3.2:1b`）
2. 关闭其他内存占用大的应用
3. 使用更高量化压缩版本（如 `Q4_K_M` 代替 `Q8_0`）

### 7.3 国内网络拉取失败

```bash
# 方案一：配置代理
export HTTPS_PROXY=http://127.0.0.1:7890
ollama pull llama3:8b

# 方案二：使用镜像（社区维护）
# 查找 HuggingFace 上的 GGUF 文件，用 ollama 导入
ollama pull hf.co/bartowski/Meta-Llama-3-8B-Instruct-GGUF
```

---

## 小结

1. Ollama 是 llama.cpp 的高级封装，提供类 Docker 的模型管理与统一 REST API
2. 安装一条命令搞定：`curl -fsSL https://ollama.ai/install.sh | sh`
3. Daemon 在 `localhost:11434` 持续监听，模型存储在 `~/.ollama/models/`
4. 基本命令：`pull`（下载）、`run`（运行）、`list`（列表）、`rm`（删除）、`show`（详情）
5. RAM 是关键约束：7B 模型需要至少 8 GB 可用内存，不足时换用 1B/3B 模型
