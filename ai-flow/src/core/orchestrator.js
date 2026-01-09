import chalk from 'chalk';
import ora from 'ora';
import { AgentManager } from './agent-manager.js';
import { ContextManager } from './context.js';
import { EventEmitter } from 'events';

/**
 * 工作流编排器
 * 核心组件，负责协调多个 AI Agent 完成任务
 */
export class Orchestrator extends EventEmitter {
  constructor(config, options = {}) {
    super();
    this.config = config;
    this.options = options;
    this.agentManager = new AgentManager(config.agents);
    this.context = new ContextManager();
    this.currentStage = null;
    this.iterationCount = 0;
    this.maxIterations = config.workflow.maxIterations || 10;
  }

  /**
   * 执行工作流
   */
  async execute(input) {
    const { requirement, document, workflow } = input;

    // 初始化上下文
    this.context.set('requirement', requirement);
    this.context.set('document', document);
    this.context.set('workDir', this.options.workDir);

    // 扫描项目上下文
    await this.scanProjectContext();

    // 从第一个阶段开始执行
    const stages = this.config.workflow.stages;
    const firstStage = Object.keys(stages)[0];

    // 执行状态机
    let currentStageName = firstStage;
    const executionLog = [];

    while (currentStageName && this.iterationCount < this.maxIterations) {
      const stage = stages[currentStageName];
      this.iterationCount++;

      // 显示当前阶段
      console.log(
        chalk.cyan(`\n[${ this.iterationCount }] 阶段: ${stage.name}`) +
          chalk.gray(` (${currentStageName})`)
      );
      console.log(chalk.gray(`    Agent: ${stage.agent} / ${stage.role || 'default'}`));

      if (this.options.dryRun) {
        console.log(chalk.yellow('    [Dry Run] 跳过执行'));
        const nextTransition = stage.transitions?.[0];
        currentStageName = nextTransition?.next || null;
        continue;
      }

      // 执行阶段
      const spinner = ora({ text: '执行中...', indent: 4 }).start();

      try {
        const result = await this.executeStage(currentStageName, stage);

        // 保存阶段输出到上下文
        this.context.setStageOutput(currentStageName, result);
        executionLog.push({
          stage: currentStageName,
          success: true,
          output: result,
        });

        spinner.succeed('完成');

        // 显示关键输出
        if (result.summary) {
          console.log(chalk.gray(`    → ${result.summary.slice(0, 100)}...`));
        }

        // 确定下一个阶段
        currentStageName = this.resolveNextStage(stage, result);
      } catch (error) {
        spinner.fail(`失败: ${error.message}`);
        executionLog.push({
          stage: currentStageName,
          success: false,
          error: error.message,
        });

        // 错误处理
        if (this.config.workflow.errorHandling?.maxRetries > executionLog.filter((e) => !e.success).length) {
          console.log(chalk.yellow('    重试...'));
          continue;
        } else {
          throw error;
        }
      }
    }

    // 生成最终报告
    return {
      success: true,
      summary: this.context.get('stage:complete')?.summaryReport || '工作流执行完成',
      filesChanged: this.context.get('filesChanged') || [],
      executionLog,
    };
  }

  /**
   * 执行单个阶段
   */
  async executeStage(stageName, stage) {
    // 系统阶段（如文件写入）
    if (stage.agent === 'system') {
      return this.executeSystemStage(stageName, stage);
    }

    // 准备输入
    const input = this.prepareStageInput(stage);

    // 获取 Agent
    const agent = this.agentManager.getAgent(stage.agent, stage.role);

    // 执行 Agent
    const result = await agent.execute(input);

    return result;
  }

  /**
   * 执行系统阶段（非 AI）
   */
  async executeSystemStage(stageName, stage) {
    if (stageName === 'apply_changes') {
      const finalCode = this.context.get('stage:style_check')?.finalCode ||
                       this.context.get('stage:implement')?.codeChanges;

      if (!finalCode) {
        return { appliedFiles: [] };
      }

      // 这里应该实际写入文件
      // 为安全起见，MVP 版本先不自动写入
      console.log(chalk.yellow('\n    [安全模式] 代码变更未自动写入，请手动确认'));

      const files = Array.isArray(finalCode.files)
        ? finalCode.files.map((f) => f.path)
        : [];

      this.context.set('filesChanged', files);

      return { appliedFiles: files };
    }

    return {};
  }

  /**
   * 准备阶段输入
   */
  prepareStageInput(stage) {
    const input = {};

    for (const inputDef of stage.input || []) {
      const { name, source, optional } = inputDef;

      let value;
      if (source === 'user') {
        value = this.context.get(name);
      } else if (source === 'auto') {
        value = this.context.get(name);
      } else if (source === 'accumulator') {
        value = this.context.getAllStageOutputs();
      } else if (source.startsWith('stage:')) {
        const sourcePath = source.replace('stage:', '');
        value = this.context.get(`stage:${sourcePath}`);
      }

      if (!value && !optional) {
        throw new Error(`阶段输入缺失: ${name}`);
      }

      input[name] = value;
    }

    return input;
  }

  /**
   * 解析下一个阶段
   */
  resolveNextStage(stage, result) {
    if (!stage.transitions || stage.transitions.length === 0) {
      return null; // 终止
    }

    for (const transition of stage.transitions) {
      if (this.evaluateCondition(transition.condition, result)) {
        return transition.next;
      }
    }

    return null;
  }

  /**
   * 评估转换条件
   */
  evaluateCondition(condition, result) {
    if (condition === 'always') return true;
    if (condition === 'output.success') return result.success !== false;

    // 简单的条件解析
    const match = condition.match(/output\.(\w+)\s*==\s*'(\w+)'/);
    if (match) {
      const [, field, expected] = match;
      return result[field] === expected;
    }

    return false;
  }

  /**
   * 扫描项目上下文
   */
  async scanProjectContext() {
    const workDir = this.options.workDir || process.cwd();

    // 简化版本：只记录工作目录
    this.context.set('projectContext', {
      workDir,
      // 可扩展：添加文件列表、package.json 信息等
    });
  }
}
