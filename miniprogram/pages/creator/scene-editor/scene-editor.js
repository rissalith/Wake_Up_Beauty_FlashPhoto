/**
 * 场景编辑器页面
 * 向导式编辑流程：基本信息 -> 步骤配置 -> Prompt配置 -> 预览
 */
const { api } = require('../../../config/api');
const { uploadTempFileWithCredential } = require('../../../utils/cos');

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 64,
    sceneId: null,
    isEdit: false,
    loading: true,
    saving: false,

    // 当前步骤
    currentStep: 0,
    wizardSteps: [
      { key: 'basic', name: '基本信息' },
      { key: 'steps', name: '流程设计' },
      { key: 'prompt', name: 'Prompt配置' },
      { key: 'preview', name: '预览' }
    ],

    // 场景数据
    scene: {
      name: '',
      description: '',
      icon: '',
      points_cost: 10
    },

    // 步骤配置
    steps: [],
    stepTypes: [],
    grades: [],

    // Prompt 配置
    prompt: {
      prompt_template: '',
      negative_prompt: '',
      model_config: {}
    },

    // 可用变量
    availableVariables: [],

    // Prompt 预览
    promptPreview: '',

    // AI 生成相关
    showAiDialog: false,
    aiDescription: '',
    aiGenerating: false
  },

  onLoad(options) {
    const systemInfo = wx.getSystemInfoSync();
    const statusBarHeight = systemInfo.statusBarHeight || 20;
    const navBarHeight = statusBarHeight + 44;

    this.setData({
      statusBarHeight,
      navBarHeight
    });

    // 加载步骤类型和品级
    this.loadStepTypes();
    this.loadGrades();

    if (options.id) {
      // 编辑模式
      this.setData({
        sceneId: options.id,
        isEdit: true
      });
      this.loadSceneDetail(options.id);
    } else {
      // 创建模式
      this.setData({ loading: false });
    }
  },

  // 加载步骤类型
  async loadStepTypes() {
    try {
      const res = await api.getStepTypes();
      if (res.code === 0 && res.data) {
        this.setData({ stepTypes: res.data });
      }
    } catch (error) {
      console.error('加载步骤类型失败:', error);
      // 使用默认步骤类型
      this.setData({
        stepTypes: [
          { type: 'image_upload', name: '图片上传', description: '让用户上传照片', hasOptions: false },
          { type: 'gender_select', name: '性别选择', description: '选择性别', hasOptions: true },
          { type: 'single_select', name: '单选', description: '从多个选项中选择一个', hasOptions: true },
          { type: 'tag_select', name: '标签选择', description: '标签样式的单选', hasOptions: true },
          { type: 'image_tag_select', name: '图片标签', description: '带图片的标签选择', hasOptions: true },
          { type: 'dice_roll', name: '摇骰子', description: '随机抽取选项', hasOptions: true }
        ]
      });
    }
  },

  // 加载品级列表
  async loadGrades() {
    try {
      const res = await api.getGradesList();
      if (res.code === 0 && res.data) {
        this.setData({ grades: res.data });
      }
    } catch (error) {
      console.error('加载品级列表失败:', error);
      // 使用默认品级
      this.setData({
        grades: [
          { value: 'normal', label: '普通', color: '#999999', probability: 0.5 },
          { value: 'rare', label: '稀有', color: '#3498db', probability: 0.3 },
          { value: 'epic', label: '史诗', color: '#9b59b6', probability: 0.15 },
          { value: 'legendary', label: '传说', color: '#f39c12', probability: 0.05 }
        ]
      });
    }
  },

  // 加载场景详情
  async loadSceneDetail(sceneId) {
    try {
      const res = await api.getCreatorSceneDetail(sceneId);
      if (res.code === 0 && res.data) {
        const data = res.data;
        this.setData({
          scene: {
            name: data.name || '',
            description: data.description || '',
            icon: data.icon || '',
            points_cost: data.points_cost || 10
          },
          steps: data.steps || [],
          prompt: data.prompts && data.prompts.length > 0 ? {
            prompt_template: data.prompts[0].prompt_template || '',
            negative_prompt: data.prompts[0].negative_prompt || '',
            model_config: data.prompts[0].model_config ? JSON.parse(data.prompts[0].model_config) : {}
          } : {
            prompt_template: '',
            negative_prompt: '',
            model_config: {}
          }
        });
        this.updateAvailableVariables();
      }
    } catch (error) {
      console.error('加载场景详情失败:', error);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  // 更新可用变量列表
  updateAvailableVariables() {
    const variables = [];
    this.data.steps.forEach(step => {
      if (step.variable_name) {
        variables.push({
          name: step.variable_name,
          title: step.title,
          type: step.step_type
        });
      }
    });
    this.setData({ availableVariables: variables });
  },

  // 返回上一页
  goBack() {
    if (this.data.currentStep > 0) {
      this.setData({ currentStep: this.data.currentStep - 1 });
    } else {
      wx.navigateBack();
    }
  },

  // 下一步
  async nextStep() {
    const { currentStep, wizardSteps } = this.data;

    // 验证当前步骤
    if (!this.validateCurrentStep()) return;

    // 保存当前步骤数据
    await this.saveCurrentStep();

    if (currentStep < wizardSteps.length - 1) {
      const newStep = currentStep + 1;
      this.setData({ currentStep: newStep });

      // 如果进入 Prompt 配置步骤，更新预览
      if (newStep === 2) {
        this.updatePromptPreview();
      }
    }
  },

  // 上一步
  prevStep() {
    if (this.data.currentStep > 0) {
      this.setData({ currentStep: this.data.currentStep - 1 });
    }
  },

  // 验证当前步骤
  validateCurrentStep() {
    const { currentStep, scene, steps, prompt } = this.data;

    switch (currentStep) {
      case 0: // 基本信息
        if (!scene.name.trim()) {
          wx.showToast({ title: '请输入场景名称', icon: 'none' });
          return false;
        }
        break;
      case 1: // 步骤配置
        if (steps.length === 0) {
          wx.showToast({ title: '请至少添加一个步骤', icon: 'none' });
          return false;
        }
        break;
      case 2: // Prompt配置
        if (!prompt.prompt_template.trim()) {
          wx.showToast({ title: '请输入Prompt模板', icon: 'none' });
          return false;
        }
        break;
    }
    return true;
  },

  // 保存当前步骤数据
  async saveCurrentStep() {
    const { currentStep, sceneId, scene, steps, prompt } = this.data;

    this.setData({ saving: true });

    try {
      // 如果是新建场景，先创建
      if (!sceneId && currentStep === 0) {
        const res = await api.createCreatorScene(scene);
        if (res.code === 0 && res.data) {
          this.setData({
            sceneId: res.data.id,
            isEdit: true
          });
        } else {
          throw new Error(res.message || '创建失败');
        }
      } else if (sceneId) {
        // 更新场景
        switch (currentStep) {
          case 0:
            await api.updateCreatorScene(sceneId, scene);
            break;
          case 1:
            await api.saveCreatorSceneSteps(sceneId, steps);
            this.updateAvailableVariables();
            break;
          case 2:
            await api.saveCreatorScenePrompt(sceneId, prompt);
            break;
        }
      }
    } catch (error) {
      console.error('保存失败:', error);
      wx.showToast({ title: error.message || '保存失败', icon: 'none' });
      throw error;
    } finally {
      this.setData({ saving: false });
    }
  },

  // ========== 基本信息相关 ==========
  onNameInput(e) {
    this.setData({ 'scene.name': e.detail.value });
  },

  onDescInput(e) {
    this.setData({ 'scene.description': e.detail.value });
  },

  onPointsInput(e) {
    this.setData({ 'scene.points_cost': parseInt(e.detail.value) || 10 });
  },

  // 选择图标
  chooseIcon() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        this.uploadIcon(tempFilePath);
      }
    });
  },

  // 上传图标
  async uploadIcon(filePath) {
    wx.showLoading({ title: '上传中...' });
    try {
      // 使用 COS 上传
      const result = await uploadTempFileWithCredential(filePath, 'icon', 'scene', {
        compress: true,
        quality: 80,
        maxWidth: 200
      });
      this.setData({ 'scene.icon': result.url });
      wx.showToast({ title: '上传成功', icon: 'success' });
    } catch (error) {
      console.error('上传图标失败:', error);
      wx.showToast({ title: '上传失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  // ========== 步骤配置相关 ==========
  // 添加步骤
  addStep() {
    wx.navigateTo({
      url: `/pages/creator/step-editor/step-editor?mode=add`,
      events: {
        onStepSave: (step) => {
          const steps = [...this.data.steps, step];
          this.setData({ steps });
        }
      }
    });
  },

  // 编辑步骤
  editStep(e) {
    const index = e.currentTarget.dataset.index;
    const step = this.data.steps[index];

    wx.navigateTo({
      url: `/pages/creator/step-editor/step-editor?mode=edit&index=${index}`,
      events: {
        onStepSave: (updatedStep) => {
          const steps = [...this.data.steps];
          steps[index] = updatedStep;
          this.setData({ steps });
        }
      },
      success: (res) => {
        res.eventChannel.emit('stepData', step);
      }
    });
  },

  // 删除步骤
  deleteStep(e) {
    const index = e.currentTarget.dataset.index;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个步骤吗？',
      success: (res) => {
        if (res.confirm) {
          const steps = [...this.data.steps];
          steps.splice(index, 1);
          this.setData({ steps });
        }
      }
    });
  },

  // 移动步骤
  moveStep(e) {
    const { index, direction } = e.currentTarget.dataset;
    const steps = [...this.data.steps];
    const newIndex = direction === 'up' ? index - 1 : index + 1;

    if (newIndex < 0 || newIndex >= steps.length) return;

    [steps[index], steps[newIndex]] = [steps[newIndex], steps[index]];
    this.setData({ steps });
  },

  // ========== Prompt配置相关 ==========
  onPromptInput(e) {
    this.setData({ 'prompt.prompt_template': e.detail.value });
    this.updatePromptPreview();
  },

  onNegativePromptInput(e) {
    this.setData({ 'prompt.negative_prompt': e.detail.value });
  },

  // 更新 Prompt 预览
  updatePromptPreview() {
    const { prompt, steps } = this.data;
    let preview = prompt.prompt_template;

    // 用示例值替换变量
    steps.forEach(step => {
      if (step.variable_name && step.options && step.options.length > 0) {
        const exampleOption = step.options[0];
        const exampleValue = exampleOption.prompt_text || exampleOption.label || exampleOption.value;
        const regex = new RegExp(`\\{\\{${step.variable_name}\\}\\}`, 'g');
        preview = preview.replace(regex, `[${exampleValue}]`);
      }
    });

    this.setData({ promptPreview: preview });
  },

  // 插入变量
  insertVariable(e) {
    const variable = e.currentTarget.dataset.variable;
    const currentPrompt = this.data.prompt.prompt_template;
    this.setData({
      'prompt.prompt_template': currentPrompt + `{{${variable}}}`
    });
  },

  // ========== 预览和提交 ==========
  // 预览场景
  previewScene() {
    const { sceneId } = this.data;
    if (sceneId) {
      wx.navigateTo({
        url: `/pages/scene/scene?sceneId=${sceneId}&preview=true`
      });
    }
  },

  // 提交审核
  async submitReview() {
    const { sceneId } = this.data;
    if (!sceneId) {
      wx.showToast({ title: '请先保存场景', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '提交审核',
      content: '确定要提交场景审核吗？审核期间无法编辑。',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '提交中...' });
            const result = await api.submitCreatorSceneReview(sceneId);

            if (result.code === 0) {
              wx.showToast({ title: '提交成功', icon: 'success' });
              setTimeout(() => {
                wx.navigateBack();
              }, 1500);
            } else {
              wx.showToast({ title: result.message || '提交失败', icon: 'none' });
            }
          } catch (error) {
            console.error('提交审核失败:', error);
            wx.showToast({ title: '提交失败', icon: 'none' });
          } finally {
            wx.hideLoading();
          }
        }
      }
    });
  },

  // 保存草稿
  async saveDraft() {
    if (!this.validateCurrentStep()) return;

    try {
      await this.saveCurrentStep();
      wx.showToast({ title: '保存成功', icon: 'success' });
    } catch (error) {
      // 错误已在 saveCurrentStep 中处理
    }
  },

  // ========== AI 智能生成相关 ==========
  // 显示 AI 对话框
  showAiDialog() {
    this.setData({ showAiDialog: true });
  },

  // 隐藏 AI 对话框
  hideAiDialog() {
    this.setData({ showAiDialog: false, aiDescription: '' });
  },

  // AI 描述输入
  onAiDescInput(e) {
    this.setData({ aiDescription: e.detail.value });
  },

  // 填充示例
  fillExample(e) {
    const text = e.currentTarget.dataset.text;
    this.setData({ aiDescription: text });
  },

  // 调用 AI 生成配置
  async generateWithAi() {
    const { aiDescription } = this.data;

    if (!aiDescription.trim()) {
      wx.showToast({ title: '请输入场景描述', icon: 'none' });
      return;
    }

    this.setData({ aiGenerating: true });

    try {
      const res = await api.aiGenerateScene({ description: aiDescription });

      if (res.code === 0 && res.data) {
        const config = res.data;

        // 应用 AI 生成的配置
        this.applyAiConfig(config);

        wx.showToast({ title: '生成成功', icon: 'success' });
        this.setData({ showAiDialog: false, aiDescription: '' });
      } else {
        wx.showToast({ title: res.message || '生成失败', icon: 'none' });
      }
    } catch (error) {
      console.error('AI 生成失败:', error);
      wx.showToast({ title: '生成失败，请重试', icon: 'none' });
    } finally {
      this.setData({ aiGenerating: false });
    }
  },

  // 应用 AI 生成的配置
  applyAiConfig(config) {
    const { scene, steps, prompt_template } = config;

    // 更新场景基本信息
    if (scene) {
      this.setData({
        'scene.name': scene.name || '',
        'scene.description': scene.description || '',
        'scene.points_cost': scene.points_cost || 10
      });
    }

    // 更新步骤配置
    if (steps && Array.isArray(steps)) {
      // 转换步骤格式
      const formattedSteps = steps.map((step, index) => ({
        title: step.title || '',
        step_type: step.component_type || 'single_select',
        variable_name: step.step_key || `step_${index}`,
        is_required: step.is_required !== false,
        options: (step.options || []).map((opt, optIndex) => ({
          label: opt.label || '',
          value: opt.value || `option_${optIndex}`,
          prompt_text: opt.prompt_text || '',
          grade: opt.grade || 'normal'
        }))
      }));
      this.setData({ steps: formattedSteps });
    }

    // 更新 Prompt 配置
    if (prompt_template) {
      this.setData({
        'prompt.prompt_template': prompt_template.template || '',
        'prompt.negative_prompt': prompt_template.negative_prompt || ''
      });
    }

    // 更新可用变量
    this.updateAvailableVariables();
  }
});
