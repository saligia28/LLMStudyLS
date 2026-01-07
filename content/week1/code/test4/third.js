import 'dotenv/config'
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})

/**
 * 诊断 Prompt 问题的工具
 */
async function diagnosePrompt(messages, description) {
  console.log(`\n=== 测试：${description} ===`)
  console.log('Message 结构：')
  messages.forEach((m, i) => {
    console.log(` ${i + 1}. [${m.role} ${m.content.slice(0, 60)}${m.content.length > 60 ? '...' : ''}]`)
  })

  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages,
    max_tokens: 200,
  })

  console.log('\n输出：', response.choices[0].message.content)
  return response.choices[0].message.content
}

async function main() {
  // 测试 1：system 指令被忽略的情况
  await diagnosePrompt(
    [
      { role: 'system', content: '只用英文回答所有问题。' },
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '你好！有什么可以帮助你的？' }, // 中文示例
      { role: 'user', content: '什么是 JavaScript？' },
    ],
    '历史示例与 system 指令冲突'
  )

  // 测试 2：正确的结构
  await diagnosePrompt(
    [
      { role: 'system', content: '只用英文回答所有问题。' },
      { role: 'user', content: '你好' },
      { role: 'assistant', content: 'Hello! How can I help you?' }, // 英文示例
      { role: 'user', content: '什么是 JavaScript？' },
    ],
    '历史示例与 system 指令一致'
  )

  // 测试 3：指令放错位置
  await diagnosePrompt(
    [
      { role: 'user', content: '什么是 JavaScript？请用 JSON 格式回答。' },
      { role: 'system', content: '你是一个专业的编程助手。' }, // system 在后面
    ],
    'system 放在 user 后面'
  )

  // 测试 4：正确的位置
  await diagnosePrompt(
    [
      { role: 'system', content: '你是一个专业的编程助手。所有回答使用 JSON 格式。' },
      { role: 'user', content: '什么是 JavaScript？' },
    ],
    'system 在前，格式要求在 system 中'
  )
}

main().catch(console.error)

/*
=== 测试：历史示例与 system 指令冲突 ===
Message 结构：
 1. [system 只用英文回答所有问题。]
 2. [user 你好]
 3. [assistant 你好！有什么可以帮助你的？]
 4. [user 什么是 JavaScript？]

输出： JavaScript is a high-level, interpreted programming language primarily used for web development. It enables interactive features on websites, s
    uch as dynamic content updates, animations, and user input validation. Originally created for web browsers, it now also runs on servers (via Node.js) 
    and in various other environments.

=== 测试：历史示例与 system 指令一致 ===
Message 结构：
 1. [system 只用英文回答所有问题。]
 2. [user 你好]
 3. [assistant Hello! How can I help you?]
 4. [user 什么是 JavaScript？]

输出： JavaScript is a versatile, high-level programming language primarily used for creating dynamic and interactive content on websites. It enables 
    features like form validation, animations, and real-time updates without needing to reload the page. Originally developed for web browsers, it now 
    also runs on servers (via Node.js) and in various other environments.

=== 测试：system 放在 user 后面 ===
Message 结构：
 1. [user 什么是 JavaScript？请用 JSON 格式回答。]
 2. [system 你是一个专业的编程助手。]

输出： ```json
{
  "language_name": "JavaScript",
  "description": "JavaScript 是一种高级的、解释型的编程语言，主要用于网页开发，为网页添加交互功能。它支持事件驱动、函数式和基于原型的编程风格。",
  "main_use_cases": [
    "网页交互（如表单验证、动态内容更新）",
    "前端框架开发（如 React、Vue、Angular）",
    "服务器端开发（通过 Node.js）",
    "移动应用开发（如 React Native）",
    "游戏开发"
  ],
  "key_features": [
    "跨平台运行（浏览器、服务器、桌面等）",
    "弱类型动态语言",
    "基于事件和异步编程",
    "与 HTML/CSS 紧密集成"
  ],
  "first_released": "1995年",
  "creator": "Brendan Eich"
}
```

=== 测试：system 在前，格式要求在 system 中 ===
Message 结构：
 1. [system 你是一个专业的编程助手。所有回答使用 JSON 格式。]
 2. [user 什么是 JavaScript？]

输出： ```json
{
  "response": "JavaScript 是一种高级、解释型的编程语言，主要用于网页开发，使其具有交互性。它是 Web 三大核心技术之一，与 HTML 和 CSS 并列。JavaScript 
    允许开发者实现动态内容更新、控制多媒体、动画以及响应用户操作等功能。随着 Node.js 等技术的出现，JavaScript 也可用于服务器端编程。"
}
```
*/
