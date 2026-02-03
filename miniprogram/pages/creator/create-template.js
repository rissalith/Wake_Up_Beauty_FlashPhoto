/**
 * 创建/编辑模板页面
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

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 64,
    currentStep: 1,
    isEdit: false,
    templateId: null,
    categories: [],
    categoryIndex: -1,
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
    canNext: false,
    uploading: false,

    // AI 生成相关
    showAiModal: false,
    aiDescription: '',
    aiGenerating: false,
    aiGeneratingText: '正在分析需求...',
    aiProgress: 0,
    aiResult: null,
    aiTaskId: null,
    aiPollTimer: null,
    // 新增：AI 步骤状态
    aiSteps: AI_STEPS.map(s => ({
      ...s,
      status: 'pending',
      output: null
    }))
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

    this.checkCanNext();
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

        this.setData({
          categoryIndex,
          formData: {
            name: template.name || '',
            description: template.description || '',
            category_id: template.category_id,
            tags: Array.isArray(template.tags) ? template.tags.join(',') : (template.tags || ''),
            gender: template.gender || 'all',
            points_cost: template.points_cost || 50,
            cover_image: template.cover_image || '',
            reference_image: template.reference_image || '',
            prompt_template: template.prompt?.template || '',
            negative_prompt: template.prompt?.negative_prompt || ''
          }
        });

        this.checkCanNext();
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

    this.checkCanNext();
  },

  // 选择分类
  onCategoryChange(e) {
    const index = parseInt(e.detail.value);
    const category = this.data.categories[index];

    this.setData({
      categoryIndex: index,
      'formData.category_id': category ? category.id : null
    });

    this.checkCanNext();
  },

  // 选择性别
  selectGender(e) {
    const gender = e.currentTarget.dataset.gender;
    this.setData({ 'formData.gender': gender });
  },

  // 选择封面图
  chooseCoverImage() {
    this.chooseAndUploadImage('cover_image');
  },

  // 选择参考图
  chooseReferenceImage() {
    this.chooseAndUploadImage('reference_image');
  },

  // 选择并上传图片
  async chooseAndUploadImage(field) {
    if (this.data.uploading) return;

    try {
      const res = await wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed']
      });

      if (res.tempFiles && res.tempFiles.length > 0) {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        this.setData({ uploading: true });

        wx.showLoading({ title: '上传中...' });

        // 读取图片为 base64
        const fileManager = wx.getFileSystemManager();
        const base64 = fileManager.readFileSync(tempFilePath, 'base64');
        const imageData = `data:image/jpeg;base64,${base64}`;

        // 上传到服务器
        const userId = wx.getStorageSync('userId');
        const uploadRes = await api.uploadImage({
          userId,
          imageData,
          type: 'template'
        });

        if (uploadRes.code === 200 && uploadRes.data) {
          this.setData({
            [`formData.${field}`]: uploadRes.data.url
          });
          this.checkCanNext();
        } else {
          throw new Error(uploadRes.msg || '上传失败');
        }
      }
    } catch (error) {
      console.error('上传图片失败:', error);
      wx.showToast({ title: '上传失败', icon: 'none' });
    } finally {
      this.setData({ uploading: false });
      wx.hideLoading();
    }
  },

  // 检查是否可以进入下一步
  checkCanNext() {
    const { currentStep, formData } = this.data;
    let canNext = false;

    switch (currentStep) {
      case 1:
        canNext = formData.name.trim().length > 0 && formData.points_cost > 0;
        break;
      case 2:
        canNext = formData.cover_image && formData.reference_image;
        break;
      case 3:
        canNext = formData.prompt_template.trim().length > 0;
        break;
    }

    this.setData({ canNext });
  },

  // 上一步
  prevStep() {
    if (this.data.currentStep > 1) {
      this.setData({ currentStep: this.data.currentStep - 1 });
      this.checkCanNext();
    }
  },

  // 下一步
  async nextStep() {
    if (!this.data.canNext) return;

    const { currentStep } = this.data;

    if (currentStep < 3) {
      this.setData({ currentStep: currentStep + 1 });
      this.checkCanNext();
    } else {
      // 最后一步，提交审核
      await this.submitTemplate();
    }
  },

  // 保存草稿
  async saveDraft() {
    await this.saveTemplate(false);
  },

  // 提交审核
  async submitTemplate() {
    await this.saveTemplate(true);
  },

  // 保存模板
  async saveTemplate(submitReview = false) {
    const userId = wx.getStorageSync('userId');
    if (!userId) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    const { formData, isEdit, templateId } = this.data;

    // 验证必填项
    if (!formData.name.trim()) {
      wx.showToast({ title: '请输入模板名称', icon: 'none' });
      return;
    }
    if (!formData.cover_image) {
      wx.showToast({ title: '请上传封面图', icon: 'none' });
      return;
    }
    if (!formData.reference_image) {
      wx.showToast({ title: '请上传参考图', icon: 'none' });
      return;
    }
    if (submitReview && !formData.prompt_template.trim()) {
      wx.showToast({ title: '请填写 Prompt 模板', icon: 'none' });
      return;
    }

    wx.showLoading({ title: submitReview ? '提交中...' : '保存中...' });

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
        reference_image: formData.reference_image
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

      wx.hideLoading();
      wx.showToast({
        title: submitReview ? '已提交审核' : '保存成功',
        icon: 'success'
      });

      // 返回上一页
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);

    } catch (error) {
      console.error('保存模板失败:', error);
      wx.hideLoading();
      wx.showToast({
        title: error.message || '保存失败',
        icon: 'none'
      });
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
    const { aiDescription } = this.data;
    if (aiDescription.length < 5) {
      wx.showToast({ title: '请输入更详细的描述', icon: 'none' });
      return;
    }

    this.setData({
      aiGenerating: true,
      aiGeneratingText: '正在分析需求...',
      aiProgress: 5,
      aiResult: null
    });

    try {
      // 调用 AI Agent API
      const res = await api.aiAgentGenerate({
        description: aiDescription,
        options: {
          async: true,
          generateImages: false
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

          console.log('[AI Poll] current_step:', currentStep, 'step_outputs:', stepOutputs);

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
    if (!config) {
      wx.showToast({ title: '生成结果为空', icon: 'none' });
      this.setData({ aiGenerating: false });
      return;
    }

    // 提取结果，包括步骤配置
    const result = {
      name: config.scene?.name || '',
      description: config.scene?.description || '',
      points_cost: config.scene?.points_cost || 50,
      prompt: config.prompt_template?.template || '',
      negative_prompt: config.prompt_template?.negative_prompt || '',
      score: task.review_score || 0,
      steps: config.steps || []  // 保存步骤配置
    };

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

  // 重新生成
  retryAiGenerate() {
    this.setData({ aiResult: null });
    this.startAiGenerate();
  },

  // 应用 AI 生成结果
  applyAiResult() {
    const { aiResult } = this.data;
    if (!aiResult) return;

    // 应用到表单
    this.setData({
      'formData.name': aiResult.name,
      'formData.description': aiResult.description,
      'formData.points_cost': aiResult.points_cost,
      'formData.prompt_template': aiResult.prompt,
      'formData.negative_prompt': aiResult.negative_prompt,
      'formData.steps': aiResult.steps || [],  // 应用步骤配置
      showAiModal: false
    });

    this.checkCanNext();

    wx.showToast({ title: '已应用配置', icon: 'success' });
  },

  // 页面卸载时清理
  onUnload() {
    this.clearAiPollTimer();
  }
});
