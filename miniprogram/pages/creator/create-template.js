/**
 * 创建/编辑模板页面
 */
const { api } = require('../../config/api');

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
      negative_prompt: ''
    },
    canNext: false,
    uploading: false
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
        this.setData({ categories: res.data });
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
  }
});
