# Step 66: Chunking｜写一个自动 chunk 工具

## 学习目标

这一节要解决的是“切分这件事，能不能自动化，而且能不能切得更像人？”

完成后你应该能：

1. 设计一个自动 chunk 工具的分层结构
2. 先按文档结构分块，再按长度与 overlap 归并
3. 输出带有 metadata 的 chunk 结果
4. 把这个工具复用到不同类型的 Markdown 文档里

> 这一节的核心不是“把字符串切开”，而是把切分变成一条清晰的流水线：解析、分块、合并、打标、输出。这样后面无论接向量库、评估脚本还是 rerank，输入都稳定。

---

## 一、自动 chunk 工具应该长什么样

一个好用的 chunk 工具通常不是一个函数，而是一条小流水线：

```text
原始文档
  ↓
文本归一化
  ↓
结构识别（标题 / 段落 / 列表 / 代码块）
  ↓
候选块生成
  ↓
按长度合并
  ↓
加入 overlap
  ↓
输出 chunk + metadata
```

### 为什么要分层

如果你把所有逻辑都塞进一个函数里，会很快遇到这些问题：

- 规则越来越多，越来越难改
- 不同文档类型想复用时很痛苦
- 调试时不知道到底是哪一步出了问题

分层后，每层只做一件事：

| 层 | 任务 |
| --- | --- |
| 归一化 | 去掉多余空格、统一换行、处理页眉页脚 |
| 结构识别 | 找标题、段落、列表、代码块 |
| 合并策略 | 让小块合并成目标长度附近的 chunk |
| overlap | 让边界内容得到保留 |
| 输出层 | 统一封装 text、id、metadata |

---

## 二、第一层：文本归一化与结构识别

### 2.1 先清洗，再切分

自动 chunk 前，最好先做最小清洗：

```js
function normalizeMarkdown(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
```

这一步的意义很朴素：不要让多余空白、重复空行、不同平台换行符干扰后续分块。

### 2.2 识别结构块

对 Markdown 文档来说，最值得利用的结构就是标题和段落。

```js
function splitMarkdownBlocks(text) {
  const blocks = []
  const parts = text.split(/\n(?=#{1,6}\s)|\n{2,}/)

  for (const part of parts) {
    const block = part.trim()
    if (block) blocks.push(block)
  }

  return blocks
}
```

如果你的文档里有代码块、表格、引用块，建议把它们视为“不可随意打断的完整块”。这类内容一旦被切碎，检索效果会明显变差。

---

## 三、第二层：按长度合并

结构块识别出来后，下一步不是立刻输出，而是把太小的块合并到目标范围。

### 3.1 一个合并规则

```js
function estimateTokens(text) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  return Math.ceil(normalized.length / 4)
}

function mergeBlocks(blocks, targetTokens = 500, maxTokens = 700) {
  const chunks = []
  let buffer = []
  let bufferTokens = 0

  for (const block of blocks) {
    const tokens = estimateTokens(block)

    if (bufferTokens + tokens > maxTokens && buffer.length > 0) {
      chunks.push(buffer.join('\n\n'))
      buffer = []
      bufferTokens = 0
    }

    buffer.push(block)
    bufferTokens += tokens

    if (bufferTokens >= targetTokens) {
      chunks.push(buffer.join('\n\n'))
      buffer = []
      bufferTokens = 0
    }
  }

  if (buffer.length > 0) {
    chunks.push(buffer.join('\n\n'))
  }

  return chunks
}
```

### 3.2 这个合并规则解决了什么

1. 防止一个标题下面只有一两行，被切得过碎。
2. 避免 chunk 过长，超出检索友好的范围。
3. 让 chunk 粒度更接近“一个局部主题”，而不是单纯按字数切。

---

## 四、第三层：加入 overlap

合并完之后，还可以给 chunk 加 overlap，保住边界信息。

```js
function addOverlap(chunks, overlapTokens = 80) {
  if (chunks.length <= 1 || overlapTokens <= 0) return chunks

  const next = []
  for (let i = 0; i < chunks.length; i++) {
    const current = chunks[i]
    const prev = i > 0 ? chunks[i - 1] : ''
    const tail = prev.slice(Math.max(0, prev.length - overlapTokens * 4))
    next.push(i === 0 ? current : `${tail}\n\n${current}`)
  }
  return next
}
```

实际工程里，overlap 也可以按“前一个 chunk 的末尾句子”来取，而不是简单按字符截断。那样更自然，也更少出现半句话。

---

## 五、最终输出应该是什么样

一个自动 chunk 工具的输出，不应该只是字符串数组，而应该是完整对象数组。

```js
function chunkMarkdownDocument(text, options = {}) {
  const normalized = normalizeMarkdown(text)
  const blocks = splitMarkdownBlocks(normalized)
  const merged = mergeBlocks(blocks, options.targetTokens ?? 500, options.maxTokens ?? 700)
  const overlapped = addOverlap(merged, options.overlapTokens ?? 80)

  return overlapped.map((chunkText, index) => ({
    id: `${options.docId ?? 'doc'}-${index + 1}`,
    text: chunkText,
    tokenCount: estimateTokens(chunkText),
    metadata: {
      docName: options.docName ?? 'unknown',
      sectionPath: options.sectionPath ?? [],
      chunkIndex: index + 1,
      sourceType: 'markdown',
    },
  }))
}
```

### 输出对象的价值

有了对象而不是纯文本，你后面可以直接做这些事：

- 存向量库时把 metadata 一起写入
- 召回后直接知道这段内容来自哪一篇文档
- 做实验时方便统计每个 chunk 的大小和来源
- 调试时能够快速回到原始章节

---

## 六、怎么验证这个工具好不好

先别急着上复杂框架，最小验证就够了：

```js
const chunks = chunkMarkdownDocument(sampleDoc, {
  docId: 'week10-step66',
  docName: 'chunk-tool.md',
  targetTokens: 450,
  maxTokens: 650,
  overlapTokens: 60,
})

console.log(chunks.map(chunk => ({
  id: chunk.id,
  tokenCount: chunk.tokenCount,
  sectionPath: chunk.metadata.sectionPath.join(' > '),
})))
```

你要看的不是“有没有输出”，而是：

- 标题有没有保住
- 段落有没有被切碎
- overlap 是否真的覆盖边界
- 输出的 metadata 是否完整

---

## 七、小结

自动 chunk 工具的本质，是把“按经验切文档”变成“按规则切文档”。

好的工具不是最复杂的工具，而是：

1. 输入稳定
2. 结构清晰
3. 输出可追踪
4. 参数可调
5. 后续可实验、可优化
