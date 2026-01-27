/**
 * 结果展示子组件
 * 纯UI组件，负责展示抽取结果（成语或马品级）
 */
Component({
  properties: {
    // 抽取类型: phrase(成语) / horse(马品级)
    drawType: {
      type: String,
      value: 'phrase'
    },
    // 抽取结果
    result: {
      type: Object,
      value: null
    },
    // 是否显示稀有度
    showRarity: {
      type: Boolean,
      value: false
    },
    // 是否显示重摇按钮
    showReroll: {
      type: Boolean,
      value: true
    },
    // 是否显示确认按钮
    showConfirm: {
      type: Boolean,
      value: true
    },
    // 剩余免费次数
    freeCount: {
      type: Number,
      value: 0
    },
    // 每次消耗醒币
    costPerRoll: {
      type: Number,
      value: 10
    }
  },

  data: {
    animationData: {}
  },

  lifetimes: {
    attached() {
      // 入场动画
      this.showEntryAnimation();
    }
  },

  observers: {
    'result': function(result) {
      if (result) {
        this.showEntryAnimation();
      }
    }
  },

  methods: {
    // 入场动画
    showEntryAnimation() {
      const animation = wx.createAnimation({
        duration: 500,
        timingFunction: 'ease-out'
      });

      animation.scale(1.1).step();
      animation.scale(1).step();

      this.setData({ animationData: animation.export() });
    },

    // 获取稀有度样式类
    getRarityClass(rarity) {
      const classMap = {
        'common': 'rarity-common',
        'rare': 'rarity-rare',
        'epic': 'rarity-epic',
        'legendary': 'rarity-legendary'
      };
      return classMap[rarity] || 'rarity-common';
    },

    // 获取稀有度文本
    getRarityText(rarity) {
      const textMap = {
        'common': '普通',
        'rare': '稀有',
        'epic': '史诗',
        'legendary': '传说'
      };
      return textMap[rarity] || '普通';
    },

    // 点击重摇
    onReroll() {
      this.triggerEvent('reroll');
    },

    // 点击确认
    onConfirm() {
      this.triggerEvent('confirm', { result: this.properties.result });
    }
  }
});
