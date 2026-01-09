import { OpenAICompatibleProvider } from '../providers/openai-compatible.js';
import { AnthropicProvider } from '../providers/anthropic.js';
import { CLIProvider } from '../providers/cli.js';

/**
 * Agent 管理器
 * 负责创建和管理各种 AI Agent 实例
 */
export class AgentManager {
  constructor(agentsConfig) {
    this.config = agentsConfig;
    this.providers = new Map();
  }

  /**
   * 获取指定的 Agent（带角色）
   */
  getAgent(agentId, roleName) {
    const agentConfig = this.config[agentId];
    if (!agentConfig) {
      throw new Error(`未知的 Agent: ${agentId}`);
    }

    const role = agentConfig.roles?.[roleName];
    if (!role && roleName) {
      throw new Error(`Agent ${agentId} 没有角色: ${roleName}`);
    }

    // 获取或创建 provider
    const provider = this.getOrCreateProvider(agentId, agentConfig);

    return new Agent(provider, agentConfig, role);
  }

  /**
   * 获取或创建 Provider
   */
  getOrCreateProvider(agentId, agentConfig) {
    if (this.providers.has(agentId)) {
      return this.providers.get(agentId);
    }

    const apiKey = process.env[agentConfig.apiKeyEnv];

    let provider;

    // 根据 provider 类型创建实例
    if (agentConfig.baseUrl === 'cli') {
      // CLI 模式（如 Codex）
      provider = new CLIProvider({
        command: agentConfig.cliCommand,
        model: agentConfig.model,
      });
    } else if (agentConfig.provider === 'anthropic') {
      provider = new AnthropicProvider({
        apiKey,
        baseUrl: agentConfig.baseUrl,
        model: agentConfig.model,
      });
    } else {
      // OpenAI 兼容模式（DeepSeek, GLM, Gemini 等）
      provider = new OpenAICompatibleProvider({
        apiKey,
        baseUrl: agentConfig.baseUrl,
        model: agentConfig.model,
      });
    }

    this.providers.set(agentId, provider);
    return provider;
  }
}

/**
 * Agent 类
 * 封装 Provider + 角色配置
 */
class Agent {
  constructor(provider, config, role) {
    this.provider = provider;
    this.config = config;
    this.role = role;
  }

  /**
   * 执行任务
   */
  async execute(input) {
    const systemPrompt = this.role?.systemPrompt || '';

    // 构建用户消息
    const userMessage = this.buildUserMessage(input);

    // 调用 Provider
    const response = await this.provider.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ]);

    // 解析响应（尝试解析 JSON）
    return this.parseResponse(response);
  }

  /**
   * 构建用户消息
   */
  buildUserMessage(input) {
    const parts = [];

    if (input.requirement) {
      parts.push(`## 需求\n${input.requirement}`);
    }

    if (input.document) {
      parts.push(`## 需求文档\n${input.document}`);
    }

    if (input.technicalSpec) {
      parts.push(`## 技术方案\n${JSON.stringify(input.technicalSpec, null, 2)}`);
    }

    if (input.implementationPlan) {
      parts.push(`## 实现计划\n${JSON.stringify(input.implementationPlan, null, 2)}`);
    }

    if (input.codeChanges) {
      parts.push(`## 代码变更\n${JSON.stringify(input.codeChanges, null, 2)}`);
    }

    if (input.suggestions) {
      parts.push(`## 评审意见\n${JSON.stringify(input.suggestions, null, 2)}`);
    }

    if (input.logicIssues) {
      parts.push(`## 需修复的逻辑问题\n${JSON.stringify(input.logicIssues, null, 2)}`);
    }

    if (input.styleIssues) {
      parts.push(`## 需修复的样式问题\n${JSON.stringify(input.styleIssues, null, 2)}`);
    }

    if (input.projectContext) {
      parts.push(`## 项目上下文\n工作目录: ${input.projectContext.workDir}`);
    }

    if (input.allStageOutputs) {
      parts.push(`## 所有阶段输出\n${JSON.stringify(input.allStageOutputs, null, 2)}`);
    }

    return parts.join('\n\n');
  }

  /**
   * 解析响应
   */
  parseResponse(response) {
    const content = response.choices?.[0]?.message?.content || response.content || response;

    // 尝试提取 JSON
    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch {
        // JSON 解析失败，返回原始内容
      }
    }

    // 尝试直接解析
    try {
      return JSON.parse(content);
    } catch {
      // 返回原始内容
      return {
        success: true,
        content,
        summary: content.slice(0, 200),
      };
    }
  }
}
