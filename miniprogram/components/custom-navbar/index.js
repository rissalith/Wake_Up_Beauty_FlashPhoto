Component({
  properties: {
    title: {
      type: String,
      value: ''
    },
    back: {
      type: Boolean,
      value: false
    },
    bgColor: {
      type: String,
      value: '#E8B686'
    },
    textColor: {
      type: String,
      value: '#ffffff'
    }
  },

  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    menuRight: 10,
    menuWidth: 87
  },

  lifetimes: {
    attached() {
      const systemInfo = wx.getSystemInfoSync();
      const menuButtonInfo = wx.getMenuButtonBoundingClientRect();

      const statusBarHeight = systemInfo.statusBarHeight || 20;
      // 导航栏高度 = 胶囊按钮高度 + 上下间距
      const navBarHeight = (menuButtonInfo.height || 32) + (menuButtonInfo.top - statusBarHeight) * 2;
      // 胶囊按钮右边距
      const menuRight = systemInfo.windowWidth - menuButtonInfo.right;
      // 胶囊按钮宽度
      const menuWidth = menuButtonInfo.width;

      this.setData({
        statusBarHeight,
        navBarHeight,
        menuRight,
        menuWidth
      });
    }
  },

  methods: {
    goBack() {
      const pages = getCurrentPages();
      if (pages.length > 1) {
        wx.navigateBack();
      } else {
        wx.switchTab({ url: '/pages/index/index' });
      }
    }
  }
});
