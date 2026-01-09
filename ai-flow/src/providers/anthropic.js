/**
 * Anthropic Claude API Provider
 */
export class AnthropicProvider {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.anthropic.com';
    this.model = config.model;
  }

  /**
   * 聊天完成
   */
  async chat(messages, options = {}) {
    const url = `${this.baseUrl}/v1/messages`;

    // 转换消息格式
    const systemMessage = messages.find((m) => m.role === 'system');
    const otherMessages = messages.filter((m) => m.role !== 'system');

    const body = {
      model: this.model,
      max_tokens: options.maxTokens ?? 4096,
      messages: otherMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };

    if (systemMessage) {
      body.system = systemMessage.content;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API 请求失败: ${response.status} - ${error}`);
    }

    const result = await response.json();

    // 转换为 OpenAI 兼容格式
    return {
      choices: [
        {
          message: {
            role: 'assistant',
            content: result.content?.[0]?.text || '',
          },
        },
      ],
    };
  }

  /**
   * 流式聊天完成
   */
  async *stream(messages, options = {}) {
    const url = `${this.baseUrl}/v1/messages`;

    const systemMessage = messages.find((m) => m.role === 'system');
    const otherMessages = messages.filter((m) => m.role !== 'system');

    const body = {
      model: this.model,
      max_tokens: options.maxTokens ?? 4096,
      stream: true,
      messages: otherMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };

    if (systemMessage) {
      body.system = systemMessage.content;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API 请求失败: ${response.status} - ${error}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter((line) => line.startsWith('data: '));

      for (const line of lines) {
        const data = line.replace('data: ', '');

        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta') {
            const content = parsed.delta?.text;
            if (content) yield content;
          }
        } catch {
          // 忽略解析错误
        }
      }
    }
  }
}
