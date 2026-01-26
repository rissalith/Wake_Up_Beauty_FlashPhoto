const { uploadWxTempFile, getUserId } = require('../../utils/cos.js');
const lang = require('../../utils/lang.js');

Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    }
  },

  data: {
    avatarUrl: '',
    nickname: '',
    defaultAvatar: 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0',
    submitting: false,
    i18n: {}
  },

  lifetimes: {
    attached() {
      this.loadLanguage();
      this.generateRandomNickname();

      // 监听语言切换事件
      const eventChannel = getApp().globalData?.eventChannel;
      if (eventChannel) {
        eventChannel.on('languageChanged', () => {
          this.loadLanguage();
        });
      }
    }
  },

  methods: {
    // 加载语言数据
    loadLanguage() {
      this.setData({ i18n: lang.getLangData() });
    },

    // 生成随机昵称
    generateRandomNickname() {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let randomId = '';
      for (let i = 0; i < 11; i++) {
        randomId += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      this.setData({ nickname: `醒宝_${randomId}` });
    },

    onChooseAvatar(e) {
      this.setData({ avatarUrl: e.detail.avatarUrl });
    },

    onNicknameInput(e) {
      this.setData({ nickname: e.detail.value });
    },

    onSkip() {
      this.triggerEvent('complete', { skipped: true });
    },

    async onSubmit() {
      if (this.data.submitting) return;

      const { avatarUrl, nickname, i18n } = this.data;

      if (!nickname.trim()) {
        wx.showToast({ title: i18n.userInfoModal_nicknameRequired || '请输入昵称', icon: 'none' });
        return;
      }

      this.setData({ submitting: true });

      try {
        let uploadedAvatarUrl = avatarUrl;

        if (avatarUrl && (avatarUrl.startsWith('http://tmp') || avatarUrl.startsWith('wxfile://'))) {
          console.log('开始上传头像到COS:', avatarUrl);
          const cosUserId = getUserId();
          const timestamp = Date.now();
          const randomStr = Math.random().toString(36).substr(2, 9);
          const key = `users/${cosUserId}/avatar/avatar_${timestamp}_${randomStr}.jpg`;
          uploadedAvatarUrl = await uploadWxTempFile(avatarUrl, key);
          console.log('头像上传成功:', uploadedAvatarUrl);
        }

        console.log('开始更新用户信息:', { nickname: nickname.trim(), avatarUrl: uploadedAvatarUrl || this.data.defaultAvatar });
        await getApp().updateUserInfo({
          nickname: nickname.trim(),
          avatarUrl: uploadedAvatarUrl || this.data.defaultAvatar
        });

        wx.showToast({ title: i18n.userInfoModal_setSuccess || '设置成功', icon: 'success' });
        this.setData({ submitting: false });
        this.triggerEvent('complete', { skipped: false });
      } catch (err) {
        console.error('用户信息设置失败:', err);
        this.setData({ submitting: false });
        const failedMsg = i18n.userInfoModal_setFailed || '设置失败';
        wx.showToast({ title: `${failedMsg}: ${err.message || ''}`, icon: 'none', duration: 3000 });
      }
    },

    preventTouchMove() {
      return false;
    }
  }
});
