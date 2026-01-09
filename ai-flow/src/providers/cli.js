import { spawn } from 'child_process';
import { resolve } from 'path';
import { homedir } from 'os';

/**
 * CLI Provider
 * 通过命令行调用外部 AI 工具（如 Codex）
 */
export class CLIProvider {
  constructor(config) {
    this.command = config.command;
    this.model = config.model;
    this.timeout = config.timeout || 120000; // 2分钟超时
  }

  /**
   * 聊天完成（通过 CLI）
   */
  async chat(messages, options = {}) {
    // 合并所有消息为一个 prompt
    const prompt = messages.map((m) => {
      if (m.role === 'system') {
        return `[System Instructions]\n${m.content}\n`;
      }
      return m.content;
    }).join('\n\n');

    const workDir = options.workDir || process.cwd();

    return this.executeCommand(prompt, workDir);
  }

  /**
   * 执行 CLI 命令
   */
  async executeCommand(prompt, workDir) {
    return new Promise((resolve_promise, reject) => {
      // 展开 ~ 为用户目录
      const command = this.command.replace(/^~/, homedir());

      // 使用 heredoc 方式传递 prompt
      const fullCommand = `${command} - ${workDir} <<'AIFLOW_EOF'\n${prompt}\nAIFLOW_EOF`;

      const proc = spawn('bash', ['-c', fullCommand], {
        cwd: workDir,
        env: { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // 超时处理
      const timer = setTimeout(() => {
        proc.kill();
        reject(new Error(`CLI 命令超时: ${this.command}`));
      }, this.timeout);

      proc.on('close', (code) => {
        clearTimeout(timer);

        if (code !== 0 && !stdout) {
          reject(new Error(`CLI 命令失败 (${code}): ${stderr}`));
          return;
        }

        // 转换为 OpenAI 兼容格式
        resolve_promise({
          choices: [
            {
              message: {
                role: 'assistant',
                content: stdout || stderr,
              },
            },
          ],
        });
      });

      proc.on('error', (error) => {
        clearTimeout(timer);
        reject(new Error(`CLI 命令执行错误: ${error.message}`));
      });
    });
  }

  /**
   * 流式聊天完成（CLI 通常不支持流式，模拟实现）
   */
  async *stream(messages, options = {}) {
    const result = await this.chat(messages, options);
    const content = result.choices?.[0]?.message?.content || '';

    // 模拟流式输出
    const words = content.split(' ');
    for (const word of words) {
      yield word + ' ';
      await new Promise((r) => setTimeout(r, 10));
    }
  }
}
