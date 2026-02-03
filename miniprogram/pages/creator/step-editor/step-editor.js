/**
 * 步骤编辑器页面
 * 配置单个步骤的类型、选项等
 */
const { api } = require('../../../config/api');
const { uploadTempFileWithCredential } = require('../../../utils/cos');

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 64,
    mode: 'add', // add 或 edit
    stepIndex: -1,

    // 步骤数据
    step: {
      step_type: '',
      title: '',
      description: '',
      variable_name: '',
      is_required: true,
      config: {},
      options: []
    },

    // 步骤类型列表
    stepTypes: [
      { type: 'image_upload', name: '图片上传', description: '让用户上传照片', hasOptions: false },
      { type: 'gender_select', name: '性别选择', description: '选择性别（男/女）', hasOptions: true, defaultOptions: [
        { label: '男', value: 'male', prompt_text: 'male' },
        { label: '女', value: 'female', prompt_text: 'female' }
      ]},
      { type: 'single_select', name: '单选', description: '从多个选项中选择一个', hasOptions: true },
      { type: 'tag_select', name: '标签选择', description: '标签样式的单选', hasOptions: true },
      { type: 'image_tag_select', name: '图片标签', description: '带图片的标签选择', hasOptions: true },
      { type: 'dice_roll', name: '摇骰子', description: '随机抽取选项，支持品级和概率', hasOptions: true }
    ],

    // 品级列表
    grades: [
      { value: 'normal', label: '普通', color: '#999999' },
      { value: 'rare', label: '稀有', color: '#3498db' },
      { value: 'epic', label: '史诗', color: '#9b59b6' },
      { value: 'legendary', label: '传说', color: '#f39c12' }
    ],

    // 当前选中的步骤类型
    selectedType: null,

    // 是否显示选项编辑
    showOptionEditor: false,
    editingOptionIndex: -1,
    editingOption: {
      label: '',
      value: '',
      prompt_text: '',
      image_url: '',
      grade: 'normal',
      probability: 1.0
    }
  },

  onLoad(options) {
    const systemInfo = wx.getSystemInfoSync();
    const statusBarHeight = systemInfo.statusBarHeight || 20;
    const navBarHeight = statusBarHeight + 44;

    this.setData({
      statusBarHeight,
      navBarHeight,
      mode: options.mode || 'add',
      stepIndex: parseInt(options.index) || -1
    });

    // 如果是编辑模式，接收步骤数据
    if (options.mode === 'edit') {
      const eventChannel = this.getOpenerEventChannel();
      eventChannel.on('stepData', (step) => {
        const selectedType = this.data.stepTypes.find(t => t.type === step.step_type);
        this.setData({
          step: { ...step },
          selectedType
        });
      });
    }
  },

  // 返回上一页
  goBack() {
    wx.navigateBack();
  },

  // 选择步骤类型
  selectType(e) {
    const type = e.currentTarget.dataset.type;
    const selectedType = this.data.stepTypes.find(t => t.type === type);

    let step = { ...this.data.step, step_type: type };

    // 如果有默认选项，自动填充
    if (selectedType.defaultOptions) {
      step.options = [...selectedType.defaultOptions];
    }

    // 自动生成变量名
    if (!step.variable_name) {
      step.variable_name = type;
    }

    this.setData({
      step,
      selectedType
    });
  },

  // 输入标题
  onTitleInput(e) {
    this.setData({ 'step.title': e.detail.value });
  },

  // 输入描述
  onDescInput(e) {
    this.setData({ 'step.description': e.detail.value });
  },

  // 输入变量名
  onVariableInput(e) {
    this.setData({ 'step.variable_name': e.detail.value });
  },

  // 切换必填
  toggleRequired() {
    this.setData({ 'step.is_required': !this.data.step.is_required });
  },

  // ========== 选项管理 ==========
  // 添加选项
  addOption() {
    this.setData({
      showOptionEditor: true,
      editingOptionIndex: -1,
      editingOption: {
        label: '',
        value: '',
        prompt_text: '',
        image_url: '',
        grade: 'normal',
        probability: 1.0
      }
    });
  },

  // 编辑选项
  editOption(e) {
    const index = e.currentTarget.dataset.index;
    const option = this.data.step.options[index];

    this.setData({
      showOptionEditor: true,
      editingOptionIndex: index,
      editingOption: { ...option }
    });
  },

  // 删除选项
  deleteOption(e) {
    const index = e.currentTarget.dataset.index;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个选项吗？',
      success: (res) => {
        if (res.confirm) {
          const options = [...this.data.step.options];
          options.splice(index, 1);
          this.setData({ 'step.options': options });
        }
      }
    });
  },

  // 关闭选项编辑器
  closeOptionEditor() {
    this.setData({ showOptionEditor: false });
  },

  // 选项标签输入
  onOptionLabelInput(e) {
    this.setData({ 'editingOption.label': e.detail.value });
  },

  // 选项值输入
  onOptionValueInput(e) {
    this.setData({ 'editingOption.value': e.detail.value });
  },

  // 选项 Prompt 输入
  onOptionPromptInput(e) {
    this.setData({ 'editingOption.prompt_text': e.detail.value });
  },

  // 选择选项图片
  chooseOptionImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      success: async (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        wx.showLoading({ title: '上传中...' });
        try {
          // 使用 COS 上传
          const result = await uploadTempFileWithCredential(tempFilePath, 'option', 'step', {
            compress: true,
            quality: 80,
            maxWidth: 300
          });
          this.setData({ 'editingOption.image_url': result.url });
          wx.showToast({ title: '上传成功', icon: 'success' });
        } catch (error) {
          console.error('上传选项图片失败:', error);
          wx.showToast({ title: '上传失败', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      }
    });
  },

  // 选择品级
  selectGrade(e) {
    const grade = e.currentTarget.dataset.grade;
    this.setData({ 'editingOption.grade': grade });
  },

  // 概率输入
  onProbabilityInput(e) {
    this.setData({ 'editingOption.probability': parseFloat(e.detail.value) || 1.0 });
  },

  // 保存选项
  saveOption() {
    const { editingOption, editingOptionIndex, step } = this.data;

    if (!editingOption.label.trim()) {
      wx.showToast({ title: '请输入选项名称', icon: 'none' });
      return;
    }

    const options = [...step.options];

    if (editingOptionIndex >= 0) {
      // 编辑现有选项
      options[editingOptionIndex] = { ...editingOption };
    } else {
      // 添加新选项
      options.push({ ...editingOption });
    }

    this.setData({
      'step.options': options,
      showOptionEditor: false
    });
  },

  // ========== 摇骰子配置 ==========
  // 免费次数输入
  onFreeRollsInput(e) {
    this.setData({ 'step.config.free_rolls': parseInt(e.detail.value) || 1 });
  },

  // 每次消耗输入
  onRollCostInput(e) {
    this.setData({ 'step.config.roll_cost': parseInt(e.detail.value) || 1 });
  },

  // ========== 保存步骤 ==========
  saveStep() {
    const { step, selectedType } = this.data;

    // 验证
    if (!step.step_type) {
      wx.showToast({ title: '请选择步骤类型', icon: 'none' });
      return;
    }

    if (!step.title.trim()) {
      wx.showToast({ title: '请输入步骤标题', icon: 'none' });
      return;
    }

    if (selectedType && selectedType.hasOptions && step.options.length === 0) {
      wx.showToast({ title: '请至少添加一个选项', icon: 'none' });
      return;
    }

    // 通过事件通道返回数据
    const eventChannel = this.getOpenerEventChannel();
    eventChannel.emit('onStepSave', step);

    wx.navigateBack();
  }
});
