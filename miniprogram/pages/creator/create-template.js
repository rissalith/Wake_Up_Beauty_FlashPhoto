/**
 * 创建/编辑模板页面 - 单页布局
 */
const { api } = require('../../config/api');

// AI 生成步骤定义
const AI_STEPS = [
  { key: 'knowledge_retrieval', title: '知识检索', desc: '检索相关模板和最佳实践' },
  { key: 'planning', title: '场景规划', desc: '分析需求并规划场景结构' },
  { key: 'config_generation', title: '配置生成', desc: '生成详细的场景配置' },
  { key: 'review', title: '质量审核', desc: '审核并优化配置质量' },
  { key: 'done', title: '完成', desc: '生成完成' }
];

// 图片比例选项
const RATIO_OPTIONS = [
  { label: '1:1 正方形', value: '1:1', width: 1, height: 1, desc: '适合头像、封面' },
  { label: '3:4 竖版', value: '3:4', width: 3, height: 4, desc: '适合人像、证件照' },
  { label: '4:3 横版', value: '4:3', width: 4, height: 3, desc: '适合风景、场景' },
  { label: '9:16 长竖版', value: '9:16', width: 9, height: 16, desc: '适合手机壁纸' },
  { label: '16:9 宽屏', value: '16:9', width: 16, height: 9, desc: '适合横幅、背景' }
];

// 价格选项 (5-100，步长5)
const PRICE_OPTIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 64,
    isEdit: false,
    templateId: null,
    categories: [],
    categoryIndex: -1,
    priceOptions: PRICE_OPTIONS,
    priceIndex: 9,  // 默认 50（索引9）
    formData: {
      name: '',
      description: '',
      category_id: null,
      tags: '',
      gender: 'all',
      points_cost: 50,
      cover_image: '',
      reference_image: '',
      prompt_template: '',
      negative_prompt: '',
      steps: []  // 步骤配置
    },
    canSubmit: false,
    uploading: false,
    generatingCover: false,      // 封面图生成中
    generatingReference: false,  // 参考图生成中

    // 比例选择相关
    ratioOptions: RATIO_OPTIONS,
    showRatioModal: false,
    referenceRatioIndex: 1,  // 默认 3:4

    // AI 生成相关
    showAiModal: false,
    aiDescription: '',
    aiGenerating: false,
    aiGeneratingText: '正在分析需求...',
    aiProgress: 0,
    aiResult: null,
    aiTaskId: null,
    aiPollTimer: null,
    // AI 图片生成选项
    aiGenerateCover: false,
    aiGenerateReference: false,
    aiReferenceRatioIndex: 1,  // 默认 3:4
    // AI 步骤状态
    aiSteps: AI_STEPS.map(s => ({
      ...s,
      status: 'pending',
      output: null
    })),

    // Prompt 配置相关
    showAdvancedPrompt: false,  // 是否显示高级模式
    promptOptimizeText: '',     // AI 优化输入
    optimizingPrompt: false     // 是否正在优化
  },

  onLoad(options) {
    // 获取系统信息
    const systemInfo = wx.getSystemInfoSync();
    const statusBarHeight = systemInfo.statusBarHeight || 20;
    const navBarHeight = statusBarHeight + 44;

    this.setData({
      statusBarHeight,
      navBarHeight
    });

    // 加载分类
    this.loadCategories();

    // 如果是编辑模式
    if (options.id) {
      this.setData({
        isEdit: true,
        templateId: options.id
      });
      this.loadTemplateDetail(options.id);
    }

    this.checkCanSubmit();
  },

  // 加载分类列表
  async loadCategories() {
    try {
      const res = await api.getTemplateCategories();
      if (res.code === 200 && res.data) {
        // 过滤掉"推荐"分类（系统推荐，不允许用户选择）
        const filteredCategories = res.data.filter(c =>
          c.name !== '推荐' && c.name_en !== 'Featured'
        );
        this.setData({ categories: filteredCategories });
      }
    } catch (error) {
      console.error('加载分类失败:', error);
    }
  },

  // 加载模板详情（编辑模式）
  async loadTemplateDetail(templateId) {
    const userId = wx.getStorageSync('userId');
    if (!userId) return;

    wx.showLoading({ title: '加载中...' });

    try {
      const res = await api.getMyTemplateDetail(templateId, userId);
      if (res.code === 200 && res.data) {
        const template = res.data;
        const categoryIndex = this.data.categories.findIndex(c => c.id === template.category_id);
        // 计算价格索引
        const pointsCost = template.points_cost || 50;
        const priceIndex = PRICE_OPTIONS.indexOf(pointsCost);

        this.setData({
          categoryIndex,
          priceIndex: priceIndex >= 0 ? priceIndex : 9,  // 默认索引9（50醒币）
          formData: {
            name: template.name || '',
            description: template.description || '',
            category_id: template.category_id,
            tags: Array.isArray(template.tags) ? template.tags.join(',') : (template.tags || ''),
            gender: template.gender || 'all',
            points_cost: pointsCost,
            cover_image: template.cover_image || '',
            reference_image: template.reference_image || '',
            prompt_template: template.prompt?.template || '',
            negative_prompt: template.prompt?.negative_prompt || '',
            steps: template.steps || []
          }
        });

        this.checkCanSubmit();
      }
    } catch (error) {
      console.error('加载模板详情失败:', error);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  // 返回上一页
  goBack() {
    wx.navigateBack();
  },

  // 输入变化
  onInputChange(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;

    this.setData({
      [`formData.${field}`]: value
    });

    this.checkCanSubmit();
    this.scheduleAutoSave();  // 触发自动保存
  },

  // 选择分类
  onCategoryChange(e) {
    const index = parseInt(e.detail.value);
    const category = this.data.categories[index];

    this.setData({
      categoryIndex: index,
      'formData.category_id': category ? category.id : null
    });

    this.checkCanSubmit();
    this.scheduleAutoSave();
  },

  // 选择价格
  onPriceChange(e) {
    const index = parseInt(e.detail.value);
    const price = PRICE_OPTIONS[index];

    this.setData({
      priceIndex: index,
      'formData.points_cost': price
    });
    this.scheduleAutoSave();
  },

  // 选择性别
  selectGender(e) {
    const gender = e.currentTarget.dataset.gender;
    this.setData({ 'formData.gender': gender });
    this.scheduleAutoSave();
  },

  // 切换高级 Prompt 模式
  toggleAdvancedPrompt() {
    this.setData({
      showAdvancedPrompt: !this.data.showAdvancedPrompt
    });
  },

  // Prompt 优化输入
  onPromptOptimizeInput(e) {
    this.setData({
      promptOptimizeText: e.detail.value
    });
  },

  // AI 优化 Prompt
  async optimizePromptWithAI() {
    const { promptOptimizeText, formData } = this.data;

    if (!promptOptimizeText.trim()) {
      wx.showToast({ title: '请输入优化建议', icon: 'none' });
      return;
    }

    if (!formData.prompt_template) {
      wx.showToast({ title: '暂无 Prompt 可优化', icon: 'none' });
      return;
    }

    this.setData({ optimizingPrompt: true });

    try {
      const res = await api.post('/admin/ai-agent/optimize-prompt', {
        currentPrompt: formData.prompt_template,
        negativePrompt: formData.negative_prompt,
        userFeedback: promptOptimizeText,
        templateName: formData.name,
        templateDescription: formData.description
      });

      if (res.code === 200 && res.data) {
        this.setData({
          'formData.prompt_template': res.data.prompt_template || formData.prompt_template,
          'formData.negative_prompt': res.data.negative_prompt || formData.negative_prompt,
          promptOptimizeText: ''
        });

        wx.showToast({ title: '优化成功', icon: 'success' });
        this.checkCanSubmit();
      } else {
        throw new Error(res.message || '优化失败');
      }
    } catch (error) {
      console.error('AI 优化 Prompt 失败:', error);
      wx.showToast({ title: error.message || '优化失败', icon: 'none' });
    } finally {
      this.setData({ optimizingPrompt: false });
    }
  },

  // 检查是否可以提交
  checkCanSubmit() {
    const { formData } = this.data;
    const canSubmit = formData.name.trim().length > 0 &&
                      formData.points_cost > 0 &&
                      formData.cover_image &&
                      formData.reference_image &&
                      formData.prompt_template.trim().length > 0;

    this.setData({ canSubmit });
  },

  // 保存草稿
  async saveDraft() {
    await this.saveTemplate(false);
  },

  // 自动保存草稿（防抖）
  scheduleAutoSave() {
    // 清除之前的定时器
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }

    // 设置新的定时器，2秒后自动保存
    this.autoSaveTimer = setTimeout(() => {
      this.autoSaveDraft();
    }, 2000);
  },

  // 执行自动保存
  async autoSaveDraft() {
    const { formData } = this.data;

    // 至少有名称或描述才保存
    if (!formData.name.trim() && !formData.description.trim()) {
      return;
    }

    const userId = wx.getStorageSync('userId');
    if (!userId) return;

    try {
      // 静默保存，不显示 loading
      await this.saveTemplate(false, true);
      console.log('[AutoSave] 草稿已自动保存');
    } catch (error) {
      console.error('[AutoSave] 自动保存失败:', error);
    }
  },

  // 提交审核
  async submitTemplate() {
    if (!this.data.canSubmit) {
      // 提示缺少哪些必填项
      const { formData } = this.data;
      if (!formData.name.trim()) {
        wx.showToast({ title: '请输入模板名称', icon: 'none' });
      } else if (!formData.cover_image) {
        wx.showToast({ title: '请上传封面图', icon: 'none' });
      } else if (!formData.reference_image) {
        wx.showToast({ title: '请上传参考图', icon: 'none' });
      } else if (!formData.prompt_template.trim()) {
        wx.showToast({ title: '请填写 Prompt 模板', icon: 'none' });
      }
      return;
    }
    await this.saveTemplate(true);
  },

  // 保存模板
  async saveTemplate(submitReview = false, silent = false) {
    const userId = wx.getStorageSync('userId');
    if (!userId) {
      if (!silent) {
        wx.showToast({ title: '请先登录', icon: 'none' });
      }
      return;
    }

    const { formData, isEdit, templateId } = this.data;

    if (!silent) {
      wx.showLoading({ title: submitReview ? '提交中...' : '保存中...' });
    }

    try {
      let savedTemplateId = templateId;

      // 创建或更新模板
      const templateData = {
        user_id: userId,
        name: formData.name.trim(),
        description: formData.description.trim(),
        category_id: formData.category_id,
        tags: formData.tags,
        gender: formData.gender,
        points_cost: parseInt(formData.points_cost) || 50,
        cover_image: formData.cover_image,
        reference_image: formData.reference_image,
        steps: formData.steps  // 包含步骤配置
      };

      if (isEdit && templateId) {
        // 更新模板
        const updateRes = await api.updateTemplate(templateId, templateData);
        if (updateRes.code !== 200) {
          throw new Error(updateRes.msg || '更新失败');
        }
      } else {
        // 创建模板
        const createRes = await api.createTemplate(templateData);
        if (createRes.code === 200 && createRes.data) {
          savedTemplateId = createRes.data.id;
        } else {
          throw new Error(createRes.msg || '创建失败');
        }
      }

      // 保存 Prompt 配置
      if (formData.prompt_template.trim()) {
        const promptRes = await api.configTemplatePrompt(savedTemplateId, {
          user_id: userId,
          template: formData.prompt_template.trim(),
          negative_prompt: formData.negative_prompt.trim()
        });
        if (promptRes.code !== 200) {
          console.warn('保存 Prompt 失败:', promptRes.msg);
        }
      }

      // 提交审核
      if (submitReview) {
        const submitRes = await api.submitTemplateReview(savedTemplateId, userId);
        if (submitRes.code !== 200) {
          throw new Error(submitRes.msg || '提交审核失败');
        }
      }

      // 更新本地状态（如果是新建，保存 templateId）
      if (!isEdit && savedTemplateId) {
        this.setData({
          isEdit: true,
          templateId: savedTemplateId
        });
      }

      if (!silent) {
        wx.hideLoading();
        wx.showToast({
          title: submitReview ? '已提交审核' : '保存成功',
          icon: 'success'
        });

        // 提交审核后返回上一页
        if (submitReview) {
          setTimeout(() => {
            wx.navigateBack();
          }, 1500);
        }
      }

    } catch (error) {
      console.error('保存模板失败:', error);
      if (!silent) {
        wx.hideLoading();
        wx.showToast({
          title: error.message || '保存失败',
          icon: 'none'
        });
      }
    }
  },

  // 分享
  onShareAppMessage() {
    return {
      title: '我正在创建模板',
      path: '/pages/creator/creator'
    };
  },

  // ==================== AI 智能生成相关 ====================

  // 显示 AI 生成弹窗
  showAiGenerateModal() {
    this.setData({
      showAiModal: true,
      aiDescription: '',
      aiGenerating: false,
      aiResult: null,
      aiProgress: 0,
      // 默认勾选图片生成选项
      aiGenerateCover: true,
      aiGenerateReference: true,
      aiReferenceRatioIndex: 1,
      // 重置步骤状态
      aiSteps: AI_STEPS.map(s => ({
        ...s,
        status: 'pending',
        output: null
      }))
    });
  },

  // 隐藏 AI 生成弹窗
  hideAiGenerateModal() {
    // 如果正在生成，先取消
    if (this.data.aiPollTimer) {
      clearInterval(this.data.aiPollTimer);
      this.setData({ aiPollTimer: null });
    }
    this.setData({ showAiModal: false });
  },

  // 阻止冒泡
  preventBubble() {},

  // AI 描述输入
  onAiDescriptionInput(e) {
    this.setData({ aiDescription: e.detail.value });
  },

  // 使用示例
  useAiExample(e) {
    const text = e.currentTarget.dataset.text;
    this.setData({ aiDescription: text });
  },

  // 开始 AI 生成
  async startAiGenerate() {
    const { aiDescription, aiGenerateCover, aiGenerateReference, aiReferenceRatioIndex, ratioOptions } = this.data;
    if (!aiDescription.trim()) {
      wx.showToast({ title: '请输入场景描述', icon: 'none' });
      return;
    }

    this.setData({
      aiGenerating: true,
      aiGeneratingText: '正在分析需求...',
      aiProgress: 5,
      aiResult: null
    });

    try {
      // 构建图片生成选项
      const imageOptions = {};
      if (aiGenerateCover) {
        imageOptions.generateCover = true;
        imageOptions.coverRatio = '1:1';
      }
      if (aiGenerateReference) {
        imageOptions.generateReference = true;
        imageOptions.referenceRatio = ratioOptions[aiReferenceRatioIndex].value;
      }

      // 调用 AI Agent API
      const res = await api.aiAgentGenerate({
        description: aiDescription,
        options: {
          async: true,
          generateImages: aiGenerateCover || aiGenerateReference,
          ...imageOptions
        }
      });

      if (res.code === 200 && res.data && res.data.task_id) {
        this.setData({
          aiTaskId: res.data.task_id,
          aiProgress: 10
        });

        // 开始轮询任务状态
        this.pollAiTaskStatus(res.data.task_id);
      } else {
        throw new Error(res.msg || '创建任务失败');
      }
    } catch (error) {
      console.error('AI 生成失败:', error);
      wx.showToast({ title: error.message || '生成失败', icon: 'none' });
      this.setData({ aiGenerating: false });
    }
  },

  // 轮询 AI 任务状态
  pollAiTaskStatus(taskId) {
    // 重置上次轮询的步骤（用于减少日志输出）
    this._lastPollStep = null;

    // 步骤顺序映射（用于判断步骤是否已完成）
    const stepOrderMap = {
      'init': -1,  // 初始化状态
      'knowledge_retrieval': 0,
      'planning': 1,
      'config_generation': 2,
      'review': 3,
      'review_iteration_1': 3,
      'review_iteration_2': 3,
      'review_iteration_3': 3,
      'optimization_1': 3,
      'optimization_2': 3,
      'optimization_3': 3,
      'image_generation': 3.5,
      'done': 4
    };

    const poll = async () => {
      try {
        const res = await api.aiAgentStatus(taskId);

        if (res.code === 200 && res.data) {
          const task = res.data;
          const currentStep = task.current_step;
          const stepOutputs = task.step_outputs || {};

          // 只在步骤变化时输出日志
          if (this._lastPollStep !== currentStep) {
            console.log('[AI Poll] step changed:', currentStep);
            this._lastPollStep = currentStep;
          }

          // 更新步骤状态
          const currentOrder = stepOrderMap[currentStep] ?? -1;
          const updatedSteps = this.data.aiSteps.map(step => {
            const stepOrder = stepOrderMap[step.key] ?? -1;

            // 获取步骤输出
            let output = stepOutputs[step.key] || null;

            // 审核步骤特殊处理（合并 review_iteration_* 的输出）
            if (step.key === 'review' && !output) {
              output = stepOutputs.review || null;
            }

            // 如果是 init 状态，第一个步骤显示为进行中
            if (currentStep === 'init' && step.key === 'knowledge_retrieval') {
              return { ...step, status: 'in_progress', output: '准备中...' };
            }

            if (currentOrder > stepOrder) {
              // 已完成的步骤
              return { ...step, status: 'completed', output };
            } else if (currentOrder === stepOrder || (step.key === 'review' && currentStep.startsWith('review_iteration'))) {
              // 当前步骤
              return { ...step, status: 'in_progress', output };
            } else {
              // 待处理的步骤
              return { ...step, status: 'pending', output: null };
            }
          });

          // 更新进度
          const progressMap = {
            'init': { progress: 5, text: '正在准备...' },
            'knowledge_retrieval': { progress: 15, text: '正在检索知识库...' },
            'planning': { progress: 30, text: '正在规划场景...' },
            'config_generation': { progress: 50, text: '正在生成配置...' },
            'review_iteration_1': { progress: 65, text: '正在审核配置...' },
            'review_iteration_2': { progress: 75, text: '正在优化配置...' },
            'review_iteration_3': { progress: 85, text: '正在优化配置...' },
            'optimization_1': { progress: 70, text: '正在优化配置...' },
            'optimization_2': { progress: 80, text: '正在优化配置...' },
            'optimization_3': { progress: 90, text: '正在优化配置...' },
            'image_generation': { progress: 90, text: '正在生成图片...' },
            'done': { progress: 100, text: '生成完成!' }
          };

          const stepInfo = progressMap[currentStep] || { progress: task.progress || 50, text: '处理中...' };

          this.setData({
            aiSteps: updatedSteps,
            aiProgress: stepInfo.progress,
            aiGeneratingText: stepInfo.text
          });

          // 检查是否完成
          if (task.status === 'completed') {
            this.clearAiPollTimer();
            this.handleAiGenerateSuccess(task);
          } else if (task.status === 'failed') {
            this.clearAiPollTimer();
            wx.showToast({ title: task.error_message || '生成失败', icon: 'none' });
            this.setData({ aiGenerating: false });
          }
        }
      } catch (error) {
        console.error('轮询状态失败:', error);
      }
    };

    // 立即执行一次
    poll();

    // 每 2 秒轮询一次
    const timer = setInterval(poll, 2000);
    this.setData({ aiPollTimer: timer });
  },

  // 清除轮询定时器
  clearAiPollTimer() {
    if (this.data.aiPollTimer) {
      clearInterval(this.data.aiPollTimer);
      this.setData({ aiPollTimer: null });
    }
  },

  // AI 生成成功
  handleAiGenerateSuccess(task) {
    const config = task.config_result;
    const images = task.images_result;
    console.log('[AI Generate] task:', JSON.stringify(task));
    console.log('[AI Generate] config_result:', JSON.stringify(config));
    console.log('[AI Generate] images_result:', JSON.stringify(images));

    if (!config) {
      wx.showToast({ title: '生成结果为空', icon: 'none' });
      this.setData({ aiGenerating: false });
      return;
    }

    console.log('[AI Generate] config.steps:', JSON.stringify(config.steps));

    // 提取结果，包括步骤配置和图片
    const result = {
      name: config.scene?.name || '',
      description: config.scene?.description || '',
      points_cost: config.scene?.points_cost || 50,
      prompt: config.prompt_template?.template || '',
      negative_prompt: config.prompt_template?.negative_prompt || '',
      score: task.review_score || 0,
      steps: config.steps || [],
      // 图片
      cover_image: images?.cover || null,
      reference_image: images?.reference || null,
      // 推荐分类
      recommended_category_id: config.scene?.recommended_category_id || null
    };

    console.log('[AI Generate] result:', JSON.stringify(result));

    this.setData({
      aiGenerating: false,
      aiResult: result
    });
  },

  // 取消 AI 生成
  cancelAiGenerate() {
    this.clearAiPollTimer();
    this.setData({
      aiGenerating: false,
      aiProgress: 0
    });
  },

  // 后台运行 AI 生成
  runInBackground() {
    // 保存当前任务 ID
    const { aiTaskId } = this.data;
    if (aiTaskId) {
      // 存储到本地，以便后续查询
      const backgroundTasks = wx.getStorageSync('backgroundAiTasks') || [];
      backgroundTasks.push({
        taskId: aiTaskId,
        description: this.data.aiDescription,
        templateId: this.data.templateId,
        createdAt: Date.now()
      });
      wx.setStorageSync('backgroundAiTasks', backgroundTasks);
    }

    // 关闭弹窗但保持任务运行
    this.clearAiPollTimer();
    this.setData({
      showAiModal: false,
      aiGenerating: false
    });

    wx.showToast({
      title: '任务已转入后台',
      icon: 'success'
    });

    // 先保存草稿
    this.autoSaveDraft();
  },

  // 重新生成
  retryAiGenerate() {
    this.setData({ aiResult: null });
    this.startAiGenerate();
  },

  // 应用 AI 生成结果
  applyAiResult() {
    const { aiResult, categories } = this.data;
    if (!aiResult) return;

    // 计算价格索引
    const priceIndex = PRICE_OPTIONS.indexOf(aiResult.points_cost);

    // 计算分类索引（如果有推荐分类）
    let categoryIndex = -1;
    if (aiResult.recommended_category_id && categories.length > 0) {
      categoryIndex = categories.findIndex(c => c.id === aiResult.recommended_category_id);
    }

    // 应用到表单
    const updates = {
      'formData.name': aiResult.name,
      'formData.description': aiResult.description,
      'formData.points_cost': aiResult.points_cost,
      'formData.prompt_template': aiResult.prompt,
      'formData.negative_prompt': aiResult.negative_prompt,
      'formData.steps': aiResult.steps || [],
      priceIndex: priceIndex >= 0 ? priceIndex : 9,
      showAiModal: false
    };

    // 如果有推荐分类，也应用
    if (categoryIndex >= 0) {
      updates.categoryIndex = categoryIndex;
      updates['formData.category_id'] = aiResult.recommended_category_id;
    }

    // 如果有生成的图片，也应用
    if (aiResult.cover_image) {
      updates['formData.cover_image'] = aiResult.cover_image;
    }
    if (aiResult.reference_image) {
      updates['formData.reference_image'] = aiResult.reference_image;
    }

    this.setData(updates);
    this.checkCanSubmit();

    wx.showToast({ title: '已应用配置', icon: 'success' });

    // 应用后自动保存草稿
    this.autoSaveDraft();
  },

  // 页面卸载时清理
  onUnload() {
    this.clearAiPollTimer();
    // 清理自动保存定时器
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }
  },

  // ==================== AI 图片生成相关 ====================

  // 切换生成封面图选项
  toggleAiGenerateCover() {
    this.setData({ aiGenerateCover: !this.data.aiGenerateCover });
  },

  // 切换生成参考图选项
  toggleAiGenerateReference() {
    this.setData({ aiGenerateReference: !this.data.aiGenerateReference });
  },

  // AI 弹窗中选择参考图比例
  onAiRatioChange(e) {
    this.setData({ aiReferenceRatioIndex: parseInt(e.detail.value) });
  },

  // 显示参考图比例选择弹窗
  showReferenceRatioModal() {
    // 检查是否有模板名称或描述
    if (!this.data.formData.name.trim() && !this.data.formData.description.trim()) {
      wx.showToast({ title: '请先填写模板名称或描述', icon: 'none' });
      return;
    }
    this.setData({ showRatioModal: true });
  },

  // 隐藏比例选择弹窗
  hideRatioModal() {
    this.setData({ showRatioModal: false });
  },

  // 选择参考图比例
  selectReferenceRatio(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ referenceRatioIndex: index });
  },

  // 确认生成参考图
  confirmGenerateReference() {
    this.hideRatioModal();
    const ratio = this.data.ratioOptions[this.data.referenceRatioIndex];
    this.generateImage('reference', ratio.value);
  },

  // 生成封面图（固定 1:1）
  generateCoverImage() {
    // 检查是否有模板名称或描述
    if (!this.data.formData.name.trim() && !this.data.formData.description.trim()) {
      wx.showToast({ title: '请先填写模板名称或描述', icon: 'none' });
      return;
    }
    this.generateImage('cover', '1:1');
  },

  // 生成图片
  async generateImage(type, ratio) {
    const { formData } = this.data;
    const loadingKey = type === 'cover' ? 'generatingCover' : 'generatingReference';
    const userId = wx.getStorageSync('userId');

    // 检查是否登录
    if (!userId) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    // 设置加载状态
    this.setData({ [loadingKey]: true });

    try {
      // 构建描述
      const description = `${formData.name || '模板'}${formData.description ? '：' + formData.description : ''}`;

      // 调用 AI 生成图片 API
      const res = await api.generateTemplateImage({
        description,
        type,  // cover 或 reference
        ratio,
        templateName: formData.name,
        templateDescription: formData.description,
        userId  // 传递用户ID用于扣费
      });

      if (res.code === 200 && res.data && res.data.url) {
        // 更新图片
        const field = type === 'cover' ? 'cover_image' : 'reference_image';
        this.setData({
          [`formData.${field}`]: res.data.url
        });
        this.checkCanSubmit();
        wx.showToast({ title: '生成成功', icon: 'success' });
      } else {
        throw new Error(res.msg || res.message || '生成失败');
      }
    } catch (error) {
      console.error('生成图片失败:', error);
      wx.showToast({ title: error.message || '生成失败', icon: 'none' });
    } finally {
      this.setData({ [loadingKey]: false });
    }
  },

  // 预览图片
  previewImage(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) {
      wx.showToast({ title: '图片地址无效', icon: 'none' });
      return;
    }

    // 收集所有可预览的图片
    const urls = [];
    if (this.data.formData.cover_image) {
      urls.push(this.data.formData.cover_image);
    }
    if (this.data.formData.reference_image) {
      urls.push(this.data.formData.reference_image);
    }

    wx.previewImage({
      current: url,
      urls: urls.length > 0 ? urls : [url]
    });
  },

  // 图片加载错误处理
  onImageError(e) {
    const type = e.currentTarget.dataset.type;
    console.error(`[Image Error] ${type} 图片加载失败:`, e.detail);

    // 显示错误提示
    wx.showToast({
      title: `${type === 'cover' ? '封面图' : '参考图'}加载失败`,
      icon: 'none'
    });
  }
});
