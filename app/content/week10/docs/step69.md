# Step 69: Chunking｜优化 chunk 工具

## 学习目标

这一节要把前面做出来的 chunk 工具，从“能跑”升级成“够稳、够快、够少重复”。

完成后你应该能：

1. 从性能、边界、去重三个方向优化 chunk 工具
2. 在 rerank 前先做一轮轻量清理
3. 处理表格、代码块、标题重复等常见边界问题
4. 知道什么时候该优化工具，什么时候该调整策略

> 真正上线的 chunk 工具，往往不是“切得最花哨”的那个，而是“最少出错、最少重复、最容易解释”的那个。

---

## 一、先想清楚要优化什么

优化 chunk 工具，通常不是只优化“切得更准”，还要同时照顾这四件事：

1. **性能**：切分快不快，能不能处理大文档
2. **边界**：标题、代码块、表格会不会被切坏
3. **去重**：重复页眉页脚、重复段落、重叠文本怎么处理
4. **下游**：chunk 是否适合进入 rerank 和最终 prompt

这四件事不是分开的。比如 overlap 提高了边界稳定性，但也会增加重复；性能优化如果只盯着速度，可能会把结构信息丢掉。

---

## 二、性能优化：让工具更适合大文档

### 2.1 先缓存 token 估算

如果每次都重复算 token，文档一大就会慢。

```js
const tokenCache = new Map()

function estimateTokens(text) {
  if (tokenCache.has(text)) return tokenCache.get(text)
  const tokens = Math.ceil(text.replace(/\s+/g, ' ').trim().length / 4)
  tokenCache.set(text, tokens)
  return tokens
}
```

### 2.2 只在必要时做 overlap

不是所有 chunk 都一定要 overlap。比如一个完整表格、一段独立 FAQ，如果本身已经完整，就不必强行加很多重叠。

### 2.3 流式处理大文件

对于特别长的文档，尽量边读边处理，而不是一次性把所有内容都塞进内存。

```text
读取一段
  → 归一化
  → 分块
  → 合并
  → 输出
  → 继续下一段
```

这类优化特别适合批量入库场景。

---

## 三、去重优化：减少重复召回

Chunking 最常见的副作用之一，就是重复内容太多。

### 3.1 按规范化文本去重

```js
import crypto from 'node:crypto'

function normalizeForHash(text) {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function hashText(text) {
  return crypto.createHash('sha1').update(normalizeForHash(text)).digest('hex')
}

function dedupeChunks(chunks) {
  const seen = new Set()
  const result = []

  for (const chunk of chunks) {
    const key = hashText(chunk.text)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(chunk)
  }

  return result
}
```

### 3.2 什么时候去重最合适

通常在这些节点做去重比较合适：

- 结构切分之后
- overlap 之后
- rerank 之前

这样能先保留结构信息，再减少重复噪声。

---

## 四、边界优化：别把结构切坏

### 4.1 标题不要孤零零挂着

如果标题太短，不要单独成块，最好和后面的首段合并。

### 4.2 代码块和表格要完整保留

代码块、表格、列表如果被截断，下游检索和回答都会很难看。

### 4.3 给异常块留 fallback

有些文档没有标准标题，也没有清晰段落。这种情况下，可以退回到：

1. 句子切分
2. 固定长度切分
3. 固定长度 + overlap

也就是说，工具要有“优雅降级”的能力。

---

## 五、rerank 前处理：别把重复块一起送进去

如果你后面还要做 rerank，建议在 rerank 之前加一层轻量预处理。

### 5.1 先按来源聚类

同一个文档、同一个 section 的 chunk，不要一次性送太多。

### 5.2 控制每个文档的上限

```js
function capPerDoc(chunks, maxPerDoc = 3) {
  const counts = new Map()
  const result = []

  for (const chunk of chunks) {
    const docId = chunk.metadata.docId
    const count = counts.get(docId) ?? 0
    if (count >= maxPerDoc) continue
    counts.set(docId, count + 1)
    result.push(chunk)
  }

  return result
}
```

### 5.3 先去重，再 rerank

顺序建议是：

```text
召回 Top-K
  ↓
去重
  ↓
按文档分组或限流
  ↓
rerank
  ↓
送入 LLM
```

这样能减少“同一段内容以不同 chunk 形式占满 Top-K”的情况。

---

## 六、一个更完整的优化流水线

```js
function optimizeChunks(chunks) {
  const withHash = chunks.map(chunk => ({
    ...chunk,
    hash: hashText(chunk.text),
  }))

  const deduped = dedupeChunks(withHash)
  const capped = capPerDoc(deduped, 3)

  return capped.sort((a, b) => {
    if (a.metadata.docId === b.metadata.docId) {
      return a.metadata.chunkIndex - b.metadata.chunkIndex
    }
    return a.metadata.docId.localeCompare(b.metadata.docId)
  })
}
```

这个函数很朴素，但它说明了一件事：**chunk 工具的优化，不只是切分算法本身，还包括下游使用方式的整理。**

---

## 七、小结

优化 chunk 工具的目标，不是让它看起来更高级，而是让它在真实数据上更稳定。

如果你记住一件事，那就是：

```text
切分负责质量
去重负责清洁
边界负责完整
rerank 前处理负责控制噪声
```

四者合起来，才是一个可上线的 chunk 工具。
