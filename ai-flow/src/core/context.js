/**
 * 上下文管理器
 * 管理工作流执行过程中的所有数据
 */
export class ContextManager {
  constructor() {
    this.data = new Map();
    this.stageOutputs = new Map();
  }

  /**
   * 设置值
   */
  set(key, value) {
    this.data.set(key, value);
  }

  /**
   * 获取值
   */
  get(key) {
    // 支持 stage:xxx 格式获取阶段输出
    if (key.startsWith('stage:')) {
      const stagePath = key.replace('stage:', '');
      const parts = stagePath.split('.');
      const stageName = parts[0];

      let value = this.stageOutputs.get(stageName);

      // 支持嵌套访问 stage:review.issues.logicIssues
      for (let i = 1; i < parts.length && value; i++) {
        value = value[parts[i]];
      }

      return value;
    }

    return this.data.get(key);
  }

  /**
   * 设置阶段输出
   */
  setStageOutput(stageName, output) {
    this.stageOutputs.set(stageName, output);
  }

  /**
   * 获取所有阶段输出
   */
  getAllStageOutputs() {
    return Object.fromEntries(this.stageOutputs);
  }

  /**
   * 清空上下文
   */
  clear() {
    this.data.clear();
    this.stageOutputs.clear();
  }

  /**
   * 导出上下文（用于调试或持久化）
   */
  export() {
    return {
      data: Object.fromEntries(this.data),
      stageOutputs: Object.fromEntries(this.stageOutputs),
    };
  }
}
