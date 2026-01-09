import { readFileSync } from 'fs';
import { resolve } from 'path';
import YAML from 'yaml';

/**
 * 配置加载器
 * 加载 agents.yaml 和 workflow.yaml
 */
export class ConfigLoader {
  constructor(configDir) {
    this.configDir = configDir;
  }

  async load() {
    const agentsPath = resolve(this.configDir, 'agents.yaml');
    const workflowPath = resolve(this.configDir, 'workflow.yaml');

    const agentsContent = readFileSync(agentsPath, 'utf-8');
    const workflowContent = readFileSync(workflowPath, 'utf-8');

    const agents = YAML.parse(agentsContent);
    const workflow = YAML.parse(workflowContent);

    return {
      agents: agents.agents,
      workflow: workflow,
    };
  }
}
