const { api } = require('../../config/api.js');
const { validateFeedback } = require('../../utils/sensitive-filter.js');
const { checkTextSecurity, showTextSecurityAlert } = require('../../utils/security.js');
const { getLangData, t } = require('../../utils/lang.js');

Page({
  data: {
    i18n: {},
    feedbackId: '',
    content: '',
    images: [],       // 本地临时路径（用于预览）
    imageUrls: [],    // 上传后的COS URL（用于提交）
    contact: '',
    submitting: false,
    isEdit: false,
    uploadingCount: 0
  },

  onLoad(options) {
    this.setData({ i18n: getLangData() });
    if (options.id) {
      // 编辑模式
      const eventChannel = this.getOpenerEventChannel();
      eventChannel.on('acceptDataFromOpenerPage', (data) => {
        this.setData({
          isEdit: true,
          feedbackId: data.id,
          content: data.content,
          images: data.images || [],
          imageUrls: data.images || [],  // 编辑模式下，已有的图片是COS URL
          contact: data.contact || ''
        });
      });
      wx.setNavigationBarTitle({ title: t('feedbackSubmit_editTitle') || '编辑反馈' });
    }
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value });
  },

  onContactInput(e) {
    this.setData({ contact: e.detail.value });
  },

  chooseImage() {
    wx.chooseImage({
      count: 3 - this.data.images.length,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const newImages = this.data.images.concat(res.tempFilePaths);
        this.setData({ images: newImages });
        // 立即上传新选择的图片
        this.uploadNewImages(res.tempFilePaths);
      }
    });
  },

  // 上传图片到COS
  async uploadNewImages(tempFilePaths) {
    const userId = wx.getStorageSync('userId');
    if (!userId) return;

    this.setData({ uploadingCount: tempFilePaths.length });

    const { i18n } = this.data;
    const uploadFailedMsg = i18n.feedbackSubmit_imageUploadFailed || '图片上传失败';

    for (const tempPath of tempFilePaths) {
      try {
        // 读取图片为base64
        const fs = wx.getFileSystemManager();
        const base64 = fs.readFileSync(tempPath, 'base64');
        const imageData = 'data:image/jpeg;base64,' + base64;

        // 上传到服务器
        const res = await api.uploadImage({
          userId,
          imageData,
          type: 'feedback'
        });

        if (res.code === 200 && res.data && res.data.url) {
          // 更新imageUrls数组
          const imageUrls = this.data.imageUrls.concat([res.data.url]);
          this.setData({ imageUrls });
        } else {
          wx.showToast({ title: uploadFailedMsg, icon: 'none' });
        }
      } catch (error) {
        // 静默处理
        wx.showToast({ title: uploadFailedMsg, icon: 'none' });
      }
    }

    this.setData({ uploadingCount: 0 });
  },

  deleteImage(e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.images;
    const imageUrls = this.data.imageUrls;
    images.splice(index, 1);
    imageUrls.splice(index, 1);
    this.setData({ images, imageUrls });
  },

  previewImage(e) {
    const url = e.currentTarget.dataset.url;
    wx.previewImage({
      current: url,
      urls: this.data.images
    });
  },

  async submitFeedback() {
    const { i18n } = this.data;

    if (!this.data.content.trim()) {
      wx.showToast({ title: i18n.feedbackSubmit_contentRequired || '请输入反馈内容', icon: 'none' });
      return;
    }

    // 第一步：本地敏感词过滤
    const validation = validateFeedback(this.data.content);
    if (!validation.valid) {
      wx.showToast({ title: validation.message, icon: 'none' });
      return;
    }

    // 使用过滤后的内容
    const filteredContent = validation.filtered;
    if (validation.hadSensitive) {
      wx.showToast({ title: i18n.feedbackSubmit_sensitiveFiltered || '部分敏感内容已过滤', icon: 'none', duration: 1500 });
    }

    // 第二步：调用微信后端文本审核接口
    wx.showLoading({ title: i18n.feedbackSubmit_contentReviewing || '内容审核中...' });
    const openid = wx.getStorageSync('openid') || '';
    const textSecurityResult = await checkTextSecurity(filteredContent, openid, 2);
    wx.hideLoading();

    if (!textSecurityResult.safe) {
      showTextSecurityAlert(textSecurityResult.message);
      return;
    }

    if (this.data.uploadingCount > 0) {
      wx.showToast({ title: i18n.feedbackSubmit_imageUploading || '图片正在上传，请稍候', icon: 'none' });
      return;
    }

    const userId = wx.getStorageSync('userId');
    if (!userId) return;

    this.setData({ submitting: true });

    try {
      let res;
      const payload = {
        userId,
        content: filteredContent,  // 使用过滤后的内容
        images: this.data.imageUrls,  // 使用上传后的COS URL
        contact: this.data.contact
      };

      if (this.data.isEdit) {
        res = await api.updateFeedback(this.data.feedbackId, payload);
      } else {
        res = await api.submitFeedback(payload);
      }

      if (res.code === 200) {
        const successMsg = this.data.isEdit
          ? (i18n.feedbackSubmit_editSuccess || '修改成功')
          : (i18n.feedbackSubmit_submitSuccess || '提交成功');
        wx.showToast({ title: successMsg, icon: 'success' });
        setTimeout(() => {
          wx.navigateBack();
          // 通知列表页刷新
          const pages = getCurrentPages();
          const listPage = pages[pages.length - 2];
          if (listPage && listPage.loadFeedbackList) {
            listPage.loadFeedbackList();
          }
        }, 1500);
      } else {
        wx.showToast({ title: res.message || '操作失败', icon: 'none' });
        this.setData({ submitting: false });
      }
    } catch (error) {
      // 静默处理
      wx.showToast({ title: i18n.common_networkError || '网络错误', icon: 'none' });
      this.setData({ submitting: false });
    }
  }
});
