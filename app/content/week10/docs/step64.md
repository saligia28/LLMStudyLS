# Step 64: Chunking｜研究 chunk 切分策略（长度、重叠）

## 学习目标

这一节要解决的不是“chunk 是什么”，而是更重要的：**为什么同一份文档，不同切法会直接改变 RAG 的检索效果？**

完成后你应该能：

1. 说明 chunking 在 RAG 流程中的位置
2. 区分固定长度、滑动窗口和语义切分
3. 解释长度和 overlap 如何影响边界、噪声与召回
4. 用 Node.js 写出一个最小可用的切分函数

> Week 9 你已经把文本送进 embedding 和向量存储了，这一节开始处理“进入 embedding 之前，文本应该长什么样”。

---

## 一、Chunking 在 RAG 里的位置

先把流程看清楚：

```text
原始文档
  ↓
清洗 / 解析
  ↓
Chunking
  ↓
Embedding
  ↓
向量存储
  ↓
召回 / rerank
  ↓
LLM 回答
```

Chunking 是整条链路的入口。入口如果切得太粗，后面会被噪声淹没；入口如果切得太碎，后面又会丢掉语义连续性。

### 为什么一定要切

1. embedding 和 LLM 都有上下文上限。
2. 检索更喜欢“局部完整”的语义块。
3. 召回结果要尽量少噪声、多命中。
4. chunk 的粒度会直接影响索引、检索和生成成本。

### 一个直觉图

```text
太大:
[安装流程 + FAQ + API + 错误码]
  ↑ 一个 chunk 装太多主题，向量被“稀释”

太小:
[“返回值是”] [“一个 Promise”]
  ↑ 语义被切碎，答案不完整

刚刚好:
[“返回值是一个 Promise 对象，失败时抛出业务错误”]
  ↑ 局部主题完整，检索更稳
```

---

## 二、三种主流切分策略

### 2.1 固定长度切分

固定长度切分最简单：按字符数或 token 数直接切。

```js
function fixedSizeChunk(text, chunkSize = 800) {
  const chunks = []
  for (let i = 0; i < text.length; i += chunkSize) {
    const part = text.slice(i, i + chunkSize)
    if (part) chunks.push(part)
  }
  return chunks
}
```

优点是简单、快、可预测。缺点也很明显：**它不懂语义边界**，容易把一句话、一个表格或一段代码从中间切开。

### 2.2 滑动窗口切分

滑动窗口是在固定长度基础上加 overlap，让相邻 chunk 共享一段内容。

```text
chunkSize = 800
overlap   = 160
step      = 640

Chunk 1: [0................799]
Chunk 2:       [640................1439]
Chunk 3:              [1280...............]
```

```js
function slidingWindowChunk(text, chunkSize = 800, overlap = 160) {
  if (overlap >= chunkSize) throw new Error('overlap 必须小于 chunkSize')

  const step = chunkSize - overlap
  const chunks = []

  for (let i = 0; i < text.length; i += step) {
    const chunk = text.slice(i, i + chunkSize)
    if (chunk) chunks.push(chunk)
    if (i + chunkSize >= text.length) break
  }

  return chunks
}
```

Overlap 的作用是给边界信息加保险。很多答案刚好落在边界附近，不加 overlap 时很容易只拿到半句。

### 2.3 语义切分

语义切分不是“按长度硬切”，而是先识别文档结构，再按结构合并。

适合优先利用的边界有：

- Markdown 标题
- 段落空行
- 列表项
- 代码块
- 表格

```js
function splitBySemanticBlocks(markdown) {
  return markdown
    .split(/\n(?=#{1,6}\s)|\n{2,}/)
    .map(block => block.trim())
    .filter(Boolean)
}
```

真实工程里，通常不是三选一，而是“语义切分 + 长度约束 + overlap”组合起来用。

---

## 三、长度与 overlap 怎么定

### 3.1 先看 token，不要只看字符

字符数只是粗略估算，真正进入 embedding 的是 token。对于中文、代码、混合文本，字符和 token 的比例会波动。

```js
function estimateTokens(text) {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  return Math.ceil(cleaned.length / 4) // 粗略估算，用来做预判
}
```

### 3.2 一个经验判断

```text
chunkSize 选“能表达完整局部主题”的最小值
overlap   选“足以覆盖边界语义”的最小值
```

### 3.3 过大和过小的代价

| 情况 | 风险 |
| --- | --- |
| chunk 太小 | 语义破碎，答案不完整，召回块数变多 |
| chunk 太大 | 主题混杂，向量被稀释，噪声变高 |
| overlap 太小 | 边界信息丢失 |
| overlap 太大 | 重复召回、存储增加、rerank 变重 |

---

## 四、如何判断切得对不对

不要只看“能不能切出来”，要看切出来的 chunk 是否真的适合检索。

### 检查清单

1. 一个 chunk 是否尽量只讲一个主题
2. 标题是否和正文一起保留
3. 表格和代码块是否完整
4. 边界处的信息是否被 overlap 覆盖
5. chunk 数量是否过多，导致成本和噪声上升

### 一个最小验证脚本

```js
const text = '这是一段很长的文本，用来测试滑动窗口切分的效果。'.repeat(50)
const chunks = slidingWindowChunk(text, 500, 100)

console.log(`原始文本长度: ${text.length}`)
console.log(`chunk 数量: ${chunks.length}`)
console.log(`前两个 chunk 的重叠区是否一致: ${
  chunks.length >= 2
    ? chunks[0].slice(-100) === chunks[1].slice(0, 100)
    : 'N/A'
}`)
```

### 为什么要人工扫一眼

因为很多问题不是参数错了，而是文档结构没被尊重。比如：

- 标题单独挂着
- 代码块被截断
- 表格中间断行
- 列表项被切到两块里

这些问题不会在第一眼的数量统计里暴露出来，但会在召回和回答里放大。

---

## 五、最小练习

拿一篇 Markdown 文档，分别试三种方式：

1. 固定长度切分
2. 固定长度 + overlap
3. 标题感知 + 段落合并

然后观察：

- chunk 数量变化
- 每个 chunk 的 token 估算
- 标题与段落是否被截断
- 哪种策略最适合你的文档类型

---

## 六、小结

Chunking 不是一个机械预处理步骤，而是对文档语义的重新组织。

记住这三句话就够了：

1. 长度决定上下文密度。
2. overlap 决定边界保险。
3. 语义切分决定 chunk 是否像“一个可检索的局部主题”。
