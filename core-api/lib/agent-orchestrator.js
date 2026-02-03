/**
 * Agent 编排控制器 (Orchestrator)
 * 协调各个 Agent 完成场景配置生成任务
 */

const {
  PlannerAgent,
  ConfigAgent,
  ImageAgent,
  ReviewAgent,
  OptimizerAgent
} = require('./agents');

const {
  smartSearch,
  createAgentTask,
  updateAgentTask,
  getAgentTask,
  saveGenerationHistory,
  incrementUsageCountBatch
} = require('./knowledge-base');

class AgentOrchestrator {
  constructor(options = {}) {
    this.maxIterations = options.maxIterations || 3;
    this.generateImages = options.generateImages !== false;
    this.saveHistory = options.saveHistory !== false;

    // 初始化各个 Agent
    this.plannerAgent = new PlannerAgent();
    this.configAgent = new ConfigAgent();
    this.imageAgent = new ImageAgent();
    this.reviewAgent = new ReviewAgent();
    this.optimizerAgent = new OptimizerAgent();
  }

  /**
   * 生成场景配置（主入口）
   * @param {string} userDescription - 用户描述
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 生成结果
   */
  async generateSceneConfig(userDescription, options = {}) {
    const startTime = Date.now();
    console.log('[Orchestrator] 开始生成场景配置');
    console.log('[Orchestrator] 用户描述:', userDescription);
    console.log('[Orchestrator] 传入的 options:', JSON.stringify(options));

    // 使用传入的 taskId 或创建新任务
    let taskId = options.taskId;
    console.log('[Orchestrator] 传入的 taskId:', taskId);
    if (!taskId) {
      console.log('[Orchestrator] 没有传入 taskId，创建新任务');
      const task = createAgentTask(userDescription);
      taskId = task.task_id;
    }
    console.log('[Orchestrator] 使用的 taskId:', taskId);

    const context = {
      taskId,
      userDescription,
      iteration: 0,
      history: [],
      knowledgeUsed: [],
      stepOutputs: {}  // 存储每个步骤的输出摘要
    };

    try {
      // Step 1: 知识检索
      console.log('[Orchestrator] Step 1: 知识检索');
      updateAgentTask(taskId, {
        status: 'processing',
        current_step: 'knowledge_retrieval',
        progress: 10,
        step_outputs: context.stepOutputs
      });

      const knowledge = smartSearch(userDescription);
      context.knowledge = knowledge;
      context.knowledgeUsed = [
        ...knowledge.templates.map(t => t.id),
        ...knowledge.promptPatterns.map(p => p.id),
        ...knowledge.bestPractices.map(b => b.id)
      ];

      // 记录步骤输出
      const totalKnowledge = knowledge.templates.length + knowledge.promptPatterns.length + knowledge.bestPractices.length;
      context.stepOutputs.knowledge_retrieval = `找到 ${totalKnowledge} 条相关知识`;

      console.log('[Orchestrator] 检索到知识:', {
        templates: knowledge.templates.length,
        promptPatterns: knowledge.promptPatterns.length,
        bestPractices: knowledge.bestPractices.length,
        keywords: knowledge.keywords
      });

      // Step 2: 规划
      console.log('[Orchestrator] Step 2: 规划阶段');
      updateAgentTask(taskId, {
        current_step: 'planning',
        progress: 20,
        step_outputs: context.stepOutputs
      });

      const planResult = await this.plannerAgent.execute(context);
      if (!planResult.success) {
        throw new Error(`规划失败: ${planResult.error}`);
      }

      context.plan = planResult.data;
      context.history.push({
        step: 'plan',
        result: planResult.data,
        duration: planResult.duration
      });

      // 记录步骤输出
      context.stepOutputs.planning = `场景: ${context.plan.scene_name || context.plan.scene_type}`;

      console.log('[Orchestrator] 规划完成:', context.plan.scene_name);

      // Step 3: 生成配置
      console.log('[Orchestrator] Step 3: 配置生成');
      updateAgentTask(taskId, {
        current_step: 'config_generation',
        progress: 40,
        step_outputs: context.stepOutputs
      });

      const configResult = await this.configAgent.execute(context);
      if (!configResult.success) {
        throw new Error(`配置生成失败: ${configResult.error}`);
      }

      context.config = configResult.data;
      context.history.push({
        step: 'config',
        result: configResult.data,
        duration: configResult.duration
      });

      // 记录步骤输出
      context.stepOutputs.config_generation = `生成 ${context.config.steps?.length || 0} 个步骤`;

      console.log('[Orchestrator] 配置生成完成, 步骤数:', context.config.steps.length);

      // Step 4: 审核与优化循环
      let reviewPassed = false;
      while (context.iteration < this.maxIterations && !reviewPassed) {
        console.log(`[Orchestrator] Step 4: 审核 (迭代 ${context.iteration + 1}/${this.maxIterations})`);
        updateAgentTask(taskId, {
          current_step: `review_iteration_${context.iteration + 1}`,
          progress: 50 + context.iteration * 10,
          iterations: context.iteration + 1,
          step_outputs: context.stepOutputs
        });

        const reviewResult = await this.reviewAgent.execute(context);
        context.history.push({
          step: `review_${context.iteration + 1}`,
          result: reviewResult.data,
          duration: reviewResult.duration
        });

        if (reviewResult.success && reviewResult.data.passed) {
          console.log('[Orchestrator] 审核通过, 得分:', reviewResult.data.score);
          reviewPassed = true;
          context.reviewResult = reviewResult.data;
          // 记录审核通过的输出
          context.stepOutputs.review = `审核通过，得分 ${reviewResult.data.score || 0}`;
        } else {
          console.log('[Orchestrator] 审核未通过, 进行优化');
          context.reviewResult = reviewResult.data;
          context.previousReview = reviewResult.data;
          // 记录审核中的输出
          context.stepOutputs.review = `迭代优化中 (${context.iteration + 1}/${this.maxIterations})`;

          // 优化配置
          updateAgentTask(taskId, {
            current_step: `optimization_${context.iteration + 1}`,
            progress: 55 + context.iteration * 10,
            step_outputs: context.stepOutputs
          });

          const optimizeResult = await this.optimizerAgent.execute(context);
          if (optimizeResult.success) {
            context.config = optimizeResult.data;
            context.history.push({
              step: `optimize_${context.iteration + 1}`,
              result: optimizeResult.data,
              duration: optimizeResult.duration
            });
          }

          context.iteration++;
        }
      }

      // Step 5: 生成图片（可选）
      let images = null;
      if (this.generateImages && options.generateImages !== false) {
        console.log('[Orchestrator] Step 5: 图片生成');
        updateAgentTask(taskId, {
          current_step: 'image_generation',
          progress: 80,
          step_outputs: context.stepOutputs
        });

        const imageResult = await this.imageAgent.execute(context);
        if (imageResult.success) {
          images = imageResult.data;
          context.history.push({
            step: 'images',
            result: { generated: true },
            duration: imageResult.duration
          });
        } else {
          console.warn('[Orchestrator] 图片生成失败:', imageResult.error);
          context.history.push({
            step: 'images',
            result: { generated: false, error: imageResult.error },
            duration: imageResult.duration
          });
        }
      }

      // Step 6: 完成
      const duration = Date.now() - startTime;
      console.log(`[Orchestrator] 生成完成, 总耗时: ${duration}ms`);

      // 记录完成输出
      context.stepOutputs.done = `生成完成`;

      // 更新知识库使用次数
      if (context.knowledgeUsed.length > 0) {
        incrementUsageCountBatch(context.knowledgeUsed);
      }

      // 保存历史记录
      if (this.saveHistory) {
        saveGenerationHistory({
          task_id: taskId,
          input_description: userDescription,
          generated_config: context.config,
          knowledge_used: context.knowledgeUsed.join(',')
        });
      }

      // 更新任务状态
      updateAgentTask(taskId, {
        status: 'completed',
        current_step: 'done',
        progress: 100,
        config_result: context.config,
        images_result: images,
        review_score: context.reviewResult?.score || 0,
        iterations: context.iteration + 1,
        knowledge_used: context.knowledgeUsed.join(','),
        execution_log: context.history,
        step_outputs: context.stepOutputs,
        completed_at: new Date().toISOString()
      });

      return {
        success: true,
        task_id: taskId,
        config: context.config,
        images,
        review: context.reviewResult,
        iterations: context.iteration + 1,
        duration,
        knowledge_used: context.knowledgeUsed
      };

    } catch (error) {
      console.error('[Orchestrator] 生成失败:', error.message);

      updateAgentTask(taskId, {
        status: 'failed',
        error_message: error.message,
        execution_log: context.history
      });

      return {
        success: false,
        task_id: taskId,
        error: error.message,
        history: context.history
      };
    }
  }

  /**
   * 获取任务状态
   * @param {string} taskId - 任务 ID
   * @returns {Object|null} 任务信息
   */
  getTaskStatus(taskId) {
    return getAgentTask(taskId);
  }

  /**
   * 仅生成规划（用于预览）
   * @param {string} userDescription - 用户描述
   * @returns {Promise<Object>} 规划结果
   */
  async generatePlanOnly(userDescription) {
    const context = {
      userDescription,
      knowledge: smartSearch(userDescription)
    };

    const result = await this.plannerAgent.execute(context);
    return result;
  }

  /**
   * 仅审核配置
   * @param {Object} config - 配置
   * @param {string} userDescription - 原始描述
   * @returns {Promise<Object>} 审核结果
   */
  async reviewConfigOnly(config, userDescription) {
    const context = {
      userDescription,
      config,
      plan: {
        scene_type: 'custom',
        scene_name: config.scene?.name || '自定义场景',
        required_steps: config.steps?.map(s => s.step_key) || [],
        estimated_complexity: 'medium'
      },
      iteration: 0
    };

    const result = await this.reviewAgent.execute(context);
    return result;
  }

  /**
   * 仅生成图片
   * @param {Object} config - 配置
   * @param {Object} plan - 规划
   * @returns {Promise<Object>} 图片生成结果
   */
  async generateImagesOnly(config, plan) {
    const context = { config, plan };
    const result = await this.imageAgent.execute(context);
    return result;
  }
}

module.exports = AgentOrchestrator;
