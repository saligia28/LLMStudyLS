#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { Orchestrator } from '../src/core/orchestrator.js';
import { ConfigLoader } from '../src/config/loader.js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 加载环境变量
dotenv.config({ path: resolve(__dirname, '../.env') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

const program = new Command();

program
  .name('ai-flow')
  .description('Multi-Agent AI Workflow Orchestrator')
  .version('0.1.0');

// 主命令：运行工作流
program
  .command('run')
  .description('运行 AI 工作流')
  .argument('<requirement>', '需求描述')
  .option('-d, --doc <path>', '需求文档路径')
  .option('-w, --workflow <name>', '工作流名称', 'software-development')
  .option('-o, --output <dir>', '输出目录', '.')
  .option('--dry-run', '仅显示计划，不执行')
  .option('-v, --verbose', '详细输出')
  .action(async (requirement, options) => {
    console.log(chalk.blue.bold('\n🚀 AI-Flow 多智能体工作流系统\n'));

    try {
      // 加载配置
      const configLoader = new ConfigLoader(resolve(__dirname, '../config'));
      const config = await configLoader.load();

      // 如果提供了文档，读取文档内容
      let documentContent = null;
      if (options.doc) {
        const spinner = ora('读取需求文档...').start();
        documentContent = readFileSync(resolve(process.cwd(), options.doc), 'utf-8');
        spinner.succeed(`已读取文档: ${options.doc}`);
      }

      // 创建编排器
      const orchestrator = new Orchestrator(config, {
        workDir: options.output,
        verbose: options.verbose,
        dryRun: options.dryRun,
      });

      // 执行工作流
      console.log(chalk.yellow('\n📋 任务: ') + requirement);
      if (documentContent) {
        console.log(chalk.yellow('📄 文档: ') + options.doc);
      }
      console.log(chalk.gray('─'.repeat(60)) + '\n');

      const result = await orchestrator.execute({
        requirement,
        document: documentContent,
        workflow: options.workflow,
      });

      // 输出结果
      console.log(chalk.gray('\n' + '─'.repeat(60)));
      console.log(chalk.green.bold('\n✅ 工作流执行完成\n'));

      if (result.summary) {
        console.log(chalk.white(result.summary));
      }

      if (result.filesChanged && result.filesChanged.length > 0) {
        console.log(chalk.yellow('\n📁 变更的文件:'));
        result.filesChanged.forEach((f) => {
          console.log(`   ${chalk.gray('•')} ${f}`);
        });
      }
    } catch (error) {
      console.error(chalk.red('\n❌ 错误: ') + error.message);
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// 查看配置的 agents
program
  .command('agents')
  .description('列出所有配置的 AI agents')
  .action(async () => {
    const configLoader = new ConfigLoader(resolve(__dirname, '../config'));
    const config = await configLoader.load();

    console.log(chalk.blue.bold('\n🤖 配置的 AI Agents:\n'));

    for (const [id, agent] of Object.entries(config.agents)) {
      const hasKey = process.env[agent.apiKeyEnv] ? chalk.green('✓') : chalk.red('✗');
      console.log(`${chalk.white.bold(agent.name)} (${id})`);
      console.log(`   模型: ${agent.model}`);
      console.log(`   API Key: ${hasKey} ${agent.apiKeyEnv}`);
      console.log(`   角色: ${Object.keys(agent.roles).join(', ')}`);
      console.log('');
    }
  });

// 验证配置
program
  .command('check')
  .description('检查配置和 API 连接')
  .action(async () => {
    const configLoader = new ConfigLoader(resolve(__dirname, '../config'));
    const config = await configLoader.load();

    console.log(chalk.blue.bold('\n🔍 配置检查:\n'));

    for (const [id, agent] of Object.entries(config.agents)) {
      const spinner = ora(`检查 ${agent.name}...`).start();
      const apiKey = process.env[agent.apiKeyEnv];

      if (!apiKey) {
        spinner.fail(`${agent.name}: 缺少 API Key (${agent.apiKeyEnv})`);
        continue;
      }

      // 这里可以添加实际的 API 连通性测试
      spinner.succeed(`${agent.name}: 已配置`);
    }
  });

// 初始化配置
program
  .command('init')
  .description('在当前目录初始化 AI-Flow 配置')
  .action(async () => {
    console.log(chalk.blue.bold('\n📝 初始化 AI-Flow 配置...\n'));

    const envTemplate = `# AI-Flow 环境变量配置

# Claude (规划与总结)
ANTHROPIC_API_KEY=your-anthropic-api-key

# DeepSeek (代码实现)
DEEPSEEK_API_KEY=your-deepseek-api-key

# Gemini (代码风格优化)
GEMINI_API_KEY=your-gemini-api-key

# GLM (备选代码实现)
GLM_API_KEY=your-glm-api-key
`;

    console.log(chalk.yellow('请创建 .env 文件并配置以下环境变量:\n'));
    console.log(chalk.gray(envTemplate));
  });

program.parse();
