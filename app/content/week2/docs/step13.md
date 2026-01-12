# Step 13: 给前端页面加入基本样式 - 构建简洁美观的聊天 UI

## 学习目标

这个任务的本质是回答一个核心问题：**如何用现代 CSS 技术为聊天应用构建一个简洁、美观、响应式的用户界面**。

通过本教程，你将：

1. 掌握聊天界面的 CSS 布局技巧
2. 学会实现消息气泡、打字指示器等 UI 组件
3. 理解响应式设计的基本原则
4. 构建一个完整的聊天 UI 设计系统

---

## 一、核心认知：聊天 UI 设计原则

### 1.1 优秀聊天界面的特征

```
┌─────────────────────────────────────────────────────────────┐
│               优秀聊天 UI 的设计原则                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   1. 清晰的视觉层次                                          │
│   ┌─────────────────────────────────────────────────┐       │
│   │  - 用户消息和 AI 消息明显区分                    │       │
│   │  - 时间戳、状态等次要信息不喧宾夺主               │       │
│   │  - 输入区域突出，引导用户操作                    │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   2. 即时反馈                                                │
│   ┌─────────────────────────────────────────────────┐       │
│   │  - 发送消息后立即显示                            │       │
│   │  - AI 思考时显示加载指示                         │       │
│   │  - 流式输出时显示打字光标                        │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   3. 舒适的阅读体验                                          │
│   ┌─────────────────────────────────────────────────┐       │
│   │  - 适当的行高和字间距                            │       │
│   │  - 合理的最大宽度限制                            │       │
│   │  - 充足的内边距和外边距                          │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   4. 响应式适配                                              │
│   ┌─────────────────────────────────────────────────┐       │
│   │  - 桌面端充分利用空间                            │       │
│   │  - 移动端触控友好                                │       │
│   │  - 自动适应不同屏幕尺寸                          │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 聊天界面的结构组成

```
┌─────────────────────────────────────────────────────────────┐
│                    聊天界面结构分解                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────────────────────────────────────────┐       │
│   │  Header（头部）                                  │       │
│   │  - Logo/标题                                    │       │
│   │  - 状态指示                                     │       │
│   │  - 操作按钮（清空、设置等）                      │       │
│   └─────────────────────────────────────────────────┘       │
│                          ↓                                  │
│   ┌─────────────────────────────────────────────────┐       │
│   │  Message List（消息列表）                        │       │
│   │  - 用户消息气泡                                 │       │
│   │  - AI 消息气泡                                  │       │
│   │  - 时间戳分隔线                                 │       │
│   │  - 加载指示器                                   │       │
│   └─────────────────────────────────────────────────┘       │
│                          ↓                                  │
│   ┌─────────────────────────────────────────────────┐       │
│   │  Input Area（输入区域）                          │       │
│   │  - 文本输入框                                   │       │
│   │  - 发送按钮                                     │       │
│   │  - 停止按钮                                     │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、CSS 基础架构

### 2.1 CSS 变量（设计令牌）

创建 `experiments/chat-ui/styles/variables.css` 文件：

```css
/**
 * CSS 变量 - 设计令牌
 * 集中管理颜色、间距、字体等设计参数
 */

:root {
  /* === 颜色系统 === */

  /* 主色调 */
  --color-primary: #4a90d9;
  --color-primary-hover: #3a7bc8;
  --color-primary-light: #e8f2fc;

  /* 语义颜色 */
  --color-success: #28a745;
  --color-warning: #ffc107;
  --color-danger: #dc3545;
  --color-info: #17a2b8;

  /* 中性色 */
  --color-white: #ffffff;
  --color-gray-50: #f8f9fa;
  --color-gray-100: #f0f2f5;
  --color-gray-200: #e9ecef;
  --color-gray-300: #dee2e6;
  --color-gray-400: #ced4da;
  --color-gray-500: #adb5bd;
  --color-gray-600: #6c757d;
  --color-gray-700: #495057;
  --color-gray-800: #343a40;
  --color-gray-900: #212529;
  --color-black: #000000;

  /* 消息颜色 */
  --color-user-bubble: var(--color-primary);
  --color-user-text: var(--color-white);
  --color-ai-bubble: var(--color-gray-100);
  --color-ai-text: var(--color-gray-900);

  /* === 字体系统 === */
  --font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    'Helvetica Neue', Arial, sans-serif;
  --font-family-mono: 'SF Mono', 'Consolas', 'Monaco', monospace;

  --font-size-xs: 12px;
  --font-size-sm: 14px;
  --font-size-base: 15px;
  --font-size-lg: 18px;
  --font-size-xl: 20px;
  --font-size-2xl: 24px;

  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;

  --line-height-tight: 1.25;
  --line-height-normal: 1.5;
  --line-height-relaxed: 1.75;

  /* === 间距系统 === */
  --spacing-1: 4px;
  --spacing-2: 8px;
  --spacing-3: 12px;
  --spacing-4: 16px;
  --spacing-5: 20px;
  --spacing-6: 24px;
  --spacing-8: 32px;
  --spacing-10: 40px;
  --spacing-12: 48px;

  /* === 圆角 === */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-full: 9999px;

  /* === 阴影 === */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);
  --shadow-xl: 0 20px 25px rgba(0, 0, 0, 0.15);

  /* === 过渡 === */
  --transition-fast: 0.15s ease;
  --transition-normal: 0.2s ease;
  --transition-slow: 0.3s ease;

  /* === 层级 === */
  --z-dropdown: 100;
  --z-sticky: 200;
  --z-modal: 300;
  --z-tooltip: 400;

  /* === 布局 === */
  --chat-max-width: 900px;
  --message-max-width: 80%;
  --header-height: 60px;
  --input-area-min-height: 80px;
}

/* 暗色主题（可选） */
@media (prefers-color-scheme: dark) {
  :root {
    --color-gray-50: #1a1a1a;
    --color-gray-100: #2d2d2d;
    --color-gray-200: #3d3d3d;
    --color-gray-700: #b0b0b0;
    --color-gray-800: #d0d0d0;
    --color-gray-900: #e0e0e0;

    --color-ai-bubble: var(--color-gray-100);
    --color-ai-text: var(--color-gray-900);
  }
}
```

### 2.2 基础重置样式

创建 `experiments/chat-ui/styles/reset.css` 文件：

```css
/**
 * CSS Reset - 基础重置
 */

*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  font-size: 16px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  font-family: var(--font-family);
  font-size: var(--font-size-base);
  line-height: var(--line-height-normal);
  color: var(--color-gray-900);
  background-color: var(--color-gray-100);
}

a {
  color: var(--color-primary);
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

button {
  font-family: inherit;
  font-size: inherit;
  cursor: pointer;
  border: none;
  background: none;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

input,
textarea {
  font-family: inherit;
  font-size: inherit;
  border: none;
  outline: none;
}

img {
  max-width: 100%;
  height: auto;
}

/* 隐藏滚动条但保持可滚动（可选） */
.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
```

---

## 三、核心组件样式

### 3.1 聊天容器布局

创建 `experiments/chat-ui/styles/layout.css` 文件：

```css
/**
 * 聊天容器布局
 */

/* 页面容器 */
.chat-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: var(--spacing-4);
}

/* 聊天容器 */
.chat-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: var(--chat-max-width);
  height: 90vh;
  max-height: 800px;
  background: var(--color-white);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-xl);
  overflow: hidden;
}

/* 头部 */
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--header-height);
  padding: 0 var(--spacing-5);
  background: var(--color-primary);
  color: var(--color-white);
  flex-shrink: 0;
}

.chat-header__title {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
}

.chat-header__title h1 {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
}

.chat-header__actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
}

/* 消息区域 */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-5);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
}

/* 输入区域 */
.chat-input-area {
  display: flex;
  align-items: flex-end;
  gap: var(--spacing-3);
  padding: var(--spacing-4) var(--spacing-5);
  background: var(--color-white);
  border-top: 1px solid var(--color-gray-200);
  min-height: var(--input-area-min-height);
  flex-shrink: 0;
}

/* 响应式 */
@media (max-width: 768px) {
  .chat-page {
    padding: 0;
  }

  .chat-container {
    height: 100vh;
    max-height: none;
    border-radius: 0;
  }
}
```

### 3.2 消息气泡样式

创建 `experiments/chat-ui/styles/message.css` 文件：

```css
/**
 * 消息气泡样式
 */

/* 消息容器 */
.message {
  display: flex;
  gap: var(--spacing-3);
  max-width: var(--message-max-width);
  animation: messageSlideIn 0.3s ease;
}

@keyframes messageSlideIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 用户消息 - 右对齐 */
.message--user {
  flex-direction: row-reverse;
  align-self: flex-end;
}

/* AI 消息 - 左对齐 */
.message--assistant {
  align-self: flex-start;
}

/* 头像 */
.message__avatar {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  flex-shrink: 0;
}

.message--user .message__avatar {
  background: var(--color-primary-light);
  color: var(--color-primary);
}

.message--assistant .message__avatar {
  background: var(--color-gray-200);
  color: var(--color-gray-700);
}

/* 气泡主体 */
.message__bubble {
  padding: var(--spacing-3) var(--spacing-4);
  border-radius: var(--radius-lg);
  line-height: var(--line-height-relaxed);
  word-break: break-word;
  white-space: pre-wrap;
}

.message--user .message__bubble {
  background: var(--color-user-bubble);
  color: var(--color-user-text);
  border-bottom-right-radius: var(--radius-sm);
}

.message--assistant .message__bubble {
  background: var(--color-ai-bubble);
  color: var(--color-ai-text);
  border-bottom-left-radius: var(--radius-sm);
}

/* 错误消息 */
.message--error .message__bubble {
  background: #fee2e2;
  color: #dc2626;
  border: 1px solid #fecaca;
}

/* 消息时间戳 */
.message__time {
  font-size: var(--font-size-xs);
  color: var(--color-gray-500);
  margin-top: var(--spacing-1);
}

.message--user .message__time {
  text-align: right;
}

/* 打字光标 */
.message__cursor {
  display: inline-block;
  width: 2px;
  height: 1.1em;
  background: currentColor;
  margin-left: 2px;
  vertical-align: text-bottom;
  animation: cursorBlink 1s step-end infinite;
}

@keyframes cursorBlink {
  0%, 50% {
    opacity: 1;
  }
  51%, 100% {
    opacity: 0;
  }
}

/* 代码块 */
.message__bubble pre {
  background: var(--color-gray-800);
  color: var(--color-gray-100);
  padding: var(--spacing-3);
  border-radius: var(--radius-md);
  overflow-x: auto;
  font-family: var(--font-family-mono);
  font-size: var(--font-size-sm);
  margin: var(--spacing-2) 0;
}

.message__bubble code {
  font-family: var(--font-family-mono);
  font-size: 0.9em;
  background: rgba(0, 0, 0, 0.1);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}

.message__bubble pre code {
  background: none;
  padding: 0;
}
```

### 3.3 输入框样式

创建 `experiments/chat-ui/styles/input.css` 文件：

```css
/**
 * 输入框样式
 */

/* 输入框容器 */
.chat-input {
  flex: 1;
  display: flex;
  flex-direction: column;
}

/* 文本输入框 */
.chat-input__textarea {
  width: 100%;
  min-height: 44px;
  max-height: 150px;
  padding: var(--spacing-3) var(--spacing-4);
  border: 1px solid var(--color-gray-300);
  border-radius: var(--radius-lg);
  resize: none;
  font-size: var(--font-size-base);
  line-height: var(--line-height-normal);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.chat-input__textarea:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-light);
}

.chat-input__textarea::placeholder {
  color: var(--color-gray-500);
}

.chat-input__textarea:disabled {
  background: var(--color-gray-100);
  cursor: not-allowed;
}

/* 输入提示 */
.chat-input__hint {
  font-size: var(--font-size-xs);
  color: var(--color-gray-500);
  margin-top: var(--spacing-1);
}

/* 按钮组 */
.chat-input__actions {
  display: flex;
  gap: var(--spacing-2);
  flex-shrink: 0;
}

/* 按钮基础样式 */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-2);
  padding: var(--spacing-3) var(--spacing-5);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  border-radius: var(--radius-md);
  transition: all var(--transition-fast);
  white-space: nowrap;
}

/* 主要按钮 */
.btn--primary {
  background: var(--color-primary);
  color: var(--color-white);
}

.btn--primary:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.btn--primary:active:not(:disabled) {
  transform: scale(0.98);
}

/* 危险按钮 */
.btn--danger {
  background: var(--color-danger);
  color: var(--color-white);
}

.btn--danger:hover:not(:disabled) {
  background: #c82333;
}

/* 次要按钮 */
.btn--secondary {
  background: var(--color-gray-200);
  color: var(--color-gray-700);
}

.btn--secondary:hover:not(:disabled) {
  background: var(--color-gray-300);
}

/* 图标按钮 */
.btn--icon {
  width: 40px;
  height: 40px;
  padding: 0;
  border-radius: var(--radius-full);
}

/* 禁用状态 */
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

### 3.4 状态指示器样式

创建 `experiments/chat-ui/styles/indicators.css` 文件：

```css
/**
 * 状态指示器样式
 */

/* 状态徽章 */
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-1) var(--spacing-3);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.2);
}

.status-badge--ready {
  background: rgba(40, 167, 69, 0.2);
  color: var(--color-success);
}

.status-badge--streaming {
  background: rgba(255, 193, 7, 0.2);
  color: #d39e00;
}

.status-badge--error {
  background: rgba(220, 53, 69, 0.2);
  color: var(--color-danger);
}

/* 状态点 */
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  background: currentColor;
}

.status-badge--streaming .status-dot {
  animation: statusPulse 1.5s ease-in-out infinite;
}

@keyframes statusPulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(0.8);
  }
}

/* 打字指示器（三个点） */
.typing-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: var(--spacing-3) var(--spacing-4);
}

.typing-indicator__dot {
  width: 8px;
  height: 8px;
  background: var(--color-gray-400);
  border-radius: var(--radius-full);
  animation: typingBounce 1.4s ease-in-out infinite;
}

.typing-indicator__dot:nth-child(1) {
  animation-delay: 0s;
}

.typing-indicator__dot:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-indicator__dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes typingBounce {
  0%, 60%, 100% {
    transform: translateY(0);
  }
  30% {
    transform: translateY(-6px);
  }
}

/* 加载 Spinner */
.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--color-gray-300);
  border-top-color: var(--color-primary);
  border-radius: var(--radius-full);
  animation: spinnerRotate 0.8s linear infinite;
}

@keyframes spinnerRotate {
  to {
    transform: rotate(360deg);
  }
}

/* 欢迎消息 */
.welcome-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: var(--spacing-10);
  color: var(--color-gray-600);
}

.welcome-message__icon {
  font-size: 48px;
  margin-bottom: var(--spacing-4);
}

.welcome-message__title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--color-gray-800);
  margin-bottom: var(--spacing-2);
}

.welcome-message__subtitle {
  font-size: var(--font-size-base);
  color: var(--color-gray-500);
  max-width: 400px;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-8);
  text-align: center;
}

.empty-state__icon {
  font-size: 64px;
  color: var(--color-gray-400);
  margin-bottom: var(--spacing-4);
}

.empty-state__text {
  color: var(--color-gray-500);
}
```

---

## 四、完整的聊天 UI 示例

### 4.1 完整 HTML 结构

创建 `experiments/chat-ui/index.html` 文件：

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI 聊天助手 - 精美 UI</title>
    <link rel="stylesheet" href="styles/variables.css" />
    <link rel="stylesheet" href="styles/reset.css" />
    <link rel="stylesheet" href="styles/layout.css" />
    <link rel="stylesheet" href="styles/message.css" />
    <link rel="stylesheet" href="styles/input.css" />
    <link rel="stylesheet" href="styles/indicators.css" />
  </head>
  <body>
    <div class="chat-page">
      <div class="chat-container">
        <!-- 头部 -->
        <header class="chat-header">
          <div class="chat-header__title">
            <span class="chat-header__logo">🤖</span>
            <h1>AI 聊天助手</h1>
          </div>
          <div class="chat-header__actions">
            <div id="status" class="status-badge status-badge--ready">
              <span class="status-dot"></span>
              <span id="statusText">就绪</span>
            </div>
            <button class="btn btn--icon btn--secondary" id="clearBtn" title="清空对话">
              🗑️
            </button>
          </div>
        </header>

        <!-- 消息列表 -->
        <main class="chat-messages" id="messageList">
          <div class="welcome-message">
            <div class="welcome-message__icon">👋</div>
            <h2 class="welcome-message__title">你好！</h2>
            <p class="welcome-message__subtitle">
              我是 AI 助手，可以帮你回答问题、写代码、翻译文本等。有什么可以帮助你的吗？
            </p>
          </div>
        </main>

        <!-- 输入区域 -->
        <footer class="chat-input-area">
          <div class="chat-input">
            <textarea
              class="chat-input__textarea"
              id="userInput"
              placeholder="输入消息..."
              rows="1"
            ></textarea>
            <div class="chat-input__hint">
              Enter 发送 · Shift+Enter 换行 · Esc 停止
            </div>
          </div>
          <div class="chat-input__actions">
            <button class="btn btn--danger" id="stopBtn" disabled>
              停止
            </button>
            <button class="btn btn--primary" id="sendBtn">
              发送
            </button>
          </div>
        </footer>
      </div>
    </div>

    <script src="app.js"></script>
  </body>
</html>
```

### 4.2 JavaScript 逻辑

创建 `experiments/chat-ui/app.js` 文件：

```javascript
/**
 * 聊天 UI 应用逻辑
 */

// === 状态 ===
const state = {
  messages: [],
  isStreaming: false,
  abortController: null,
}

// === DOM 元素 ===
const el = {
  messageList: document.getElementById('messageList'),
  userInput: document.getElementById('userInput'),
  sendBtn: document.getElementById('sendBtn'),
  stopBtn: document.getElementById('stopBtn'),
  clearBtn: document.getElementById('clearBtn'),
  status: document.getElementById('status'),
  statusText: document.getElementById('statusText'),
}

// === 工具函数 ===

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function scrollToBottom() {
  el.messageList.scrollTop = el.messageList.scrollHeight
}

function setStatus(type, text) {
  el.status.className = `status-badge status-badge--${type}`
  el.statusText.textContent = text
}

function updateButtons() {
  el.sendBtn.disabled = state.isStreaming
  el.stopBtn.disabled = !state.isStreaming
  el.userInput.disabled = state.isStreaming
}

// === 消息渲染 ===

function clearWelcome() {
  const welcome = el.messageList.querySelector('.welcome-message')
  if (welcome) welcome.remove()
}

function createMessageElement(role, content = '') {
  const messageEl = document.createElement('div')
  messageEl.className = `message message--${role}`

  const avatar = role === 'user' ? '你' : 'AI'
  messageEl.innerHTML = `
    <div class="message__avatar">${avatar}</div>
    <div class="message__bubble">
      <span class="message__text">${escapeHtml(content)}</span>
      ${role === 'assistant' ? '<span class="message__cursor"></span>' : ''}
    </div>
  `

  return messageEl
}

function addMessage(role, content) {
  clearWelcome()
  state.messages.push({ role, content })

  const messageEl = createMessageElement(role, content)
  el.messageList.appendChild(messageEl)
  scrollToBottom()

  return messageEl
}

function createTypingIndicator() {
  const indicator = document.createElement('div')
  indicator.className = 'message message--assistant'
  indicator.id = 'typingIndicator'
  indicator.innerHTML = `
    <div class="message__avatar">AI</div>
    <div class="message__bubble">
      <div class="typing-indicator">
        <span class="typing-indicator__dot"></span>
        <span class="typing-indicator__dot"></span>
        <span class="typing-indicator__dot"></span>
      </div>
    </div>
  `
  return indicator
}

// === 流式请求 ===

async function sendMessage() {
  const content = el.userInput.value.trim()
  if (!content || state.isStreaming) return

  el.userInput.value = ''
  addMessage('user', content)

  // 显示打字指示器
  const typingIndicator = createTypingIndicator()
  el.messageList.appendChild(typingIndicator)
  scrollToBottom()

  state.isStreaming = true
  state.abortController = new AbortController()
  updateButtons()
  setStatus('streaming', '正在输出...')

  let assistantEl = null
  let textEl = null
  let cursorEl = null
  let assistantContent = ''

  // 缓冲渲染
  let buffer = ''
  let scheduled = false

  function flush() {
    if (buffer && textEl) {
      assistantContent += buffer
      textEl.textContent = assistantContent
      buffer = ''
      scrollToBottom()
    }
    scheduled = false
  }

  function appendToken(token) {
    buffer += token
    if (!scheduled) {
      scheduled = true
      requestAnimationFrame(flush)
    }
  }

  try {
    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: state.messages,
      }),
      signal: state.abortController.signal,
    })

    // 移除打字指示器，创建真正的消息
    typingIndicator.remove()

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    // 创建助手消息元素
    assistantEl = createMessageElement('assistant')
    textEl = assistantEl.querySelector('.message__text')
    cursorEl = assistantEl.querySelector('.message__cursor')
    el.messageList.appendChild(assistantEl)

    // 处理流
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let sseBuffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      sseBuffer += decoder.decode(value, { stream: true })
      const parts = sseBuffer.split('\n\n')
      sseBuffer = parts.pop() || ''

      for (const part of parts) {
        for (const line of part.split('\n')) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const json = JSON.parse(line.slice(6))
              const token = json.choices?.[0]?.delta?.content
              if (token) appendToken(token)
            } catch {}
          }
        }
      }
    }

    flush()
    state.messages.push({ role: 'assistant', content: assistantContent })

    if (cursorEl) cursorEl.style.display = 'none'
    setStatus('ready', '就绪')
  } catch (error) {
    typingIndicator.remove()

    if (error.name === 'AbortError') {
      if (assistantContent) {
        state.messages.push({ role: 'assistant', content: assistantContent + '\n[已停止]' })
      }
      setStatus('ready', '已停止')
    } else {
      const errorEl = createMessageElement('assistant', `错误: ${error.message}`)
      errorEl.classList.add('message--error')
      el.messageList.appendChild(errorEl)
      setStatus('error', '出错了')
    }

    if (cursorEl) cursorEl.style.display = 'none'
  } finally {
    state.isStreaming = false
    state.abortController = null
    updateButtons()
    scrollToBottom()
  }
}

function stopOutput() {
  if (state.abortController) {
    state.abortController.abort()
  }
}

function clearChat() {
  stopOutput()
  state.messages = []
  el.messageList.innerHTML = `
    <div class="welcome-message">
      <div class="welcome-message__icon">👋</div>
      <h2 class="welcome-message__title">你好！</h2>
      <p class="welcome-message__subtitle">
        我是 AI 助手，可以帮你回答问题、写代码、翻译文本等。有什么可以帮助你的吗？
      </p>
    </div>
  `
  setStatus('ready', '就绪')
}

// === 事件绑定 ===

el.sendBtn.addEventListener('click', sendMessage)
el.stopBtn.addEventListener('click', stopOutput)
el.clearBtn.addEventListener('click', clearChat)

el.userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
})

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.isStreaming) {
    stopOutput()
  }
})

// 自动调整输入框高度
el.userInput.addEventListener('input', function () {
  this.style.height = 'auto'
  this.style.height = Math.min(this.scrollHeight, 150) + 'px'
})

console.log('聊天 UI 已初始化')
```

---

## 五、学习检查清单

- [ ] 理解 CSS 变量的作用和好处
- [ ] 掌握 Flexbox 布局技巧
- [ ] 能实现消息气泡样式
- [ ] 能实现打字光标动画
- [ ] 能实现状态指示器
- [ ] 理解响应式设计原则

---

## 六、实践作业

### 作业 1：添加暗色主题

实现暗色主题切换功能，通过按钮或系统偏好自动切换。

### 作业 2：消息时间戳

为每条消息添加时间戳显示。

### 作业 3：头像自定义

允许用户上传自定义头像，AI 可以选择不同的头像样式。

### 作业 4：消息操作菜单

为消息添加右键菜单，支持复制、删除、重新生成等操作。

---

## 七、项目文件总结

```
experiments/chat-ui/
├── index.html              # 主页面
├── app.js                  # 应用逻辑
└── styles/
    ├── variables.css       # CSS 变量
    ├── reset.css           # 基础重置
    ├── layout.css          # 布局样式
    ├── message.css         # 消息样式
    ├── input.css           # 输入框样式
    └── indicators.css      # 指示器样式
```

---

**一个精心设计的 UI 不仅让应用看起来更专业，更能提升用户的使用体验。记住：好的设计是看不见的设计！**
