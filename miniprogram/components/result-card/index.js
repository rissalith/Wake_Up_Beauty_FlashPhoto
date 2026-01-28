/**
 * 结果展示子组件
 * 纯UI组件，负责展示抽取结果（成语或马品级）
 * 支持动态样式配置
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
    },
    // 品级样式配置 { gradeKey: styleConfig }
    gradeStyles: {
      type: Object,
      value: {}
    }
  },

  data: {
    animationData: {},
    dynamicCardStyle: '',
    dynamicTextStyle: '',
    dynamicBadgeStyle: '',
    animationClass: ''
  },

  lifetimes: {
    attached() {
      // 入场动画
      this.showEntryAnimation();
    }
  },

  observers: {
    'result, gradeStyles': function(result, gradeStyles) {
      if (result) {
        this.showEntryAnimation();
        this.updateDynamicStyles();
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

    // 更新动态样式
    updateDynamicStyles() {
      const { result, gradeStyles, drawType } = this.properties;
      if (!result) return;

      // 获取品级key
      const gradeKey = drawType === 'phrase' ? result.rarity : result.grade_key;
      if (!gradeKey || !gradeStyles || !gradeStyles[gradeKey]) {
        // 没有自定义样式，使用默认
        this.setData({
          dynamicCardStyle: '',
          dynamicTextStyle: '',
          dynamicBadgeStyle: '',
          animationClass: ''
        });
        return;
      }

      const config = gradeStyles[gradeKey];
      const styleConfig = config.styleConfig || config;

      // 构建卡片样式
      let cardStyle = '';
      if (styleConfig.card) {
        const card = styleConfig.card;

        // 背景
        if (card.background) {
          if (card.background.type === 'gradient' && card.background.colors) {
            cardStyle += `background: linear-gradient(${card.background.direction || '135deg'}, ${card.background.colors.join(', ')});`;
          } else if (card.background.color) {
            cardStyle += `background: ${card.background.color};`;
          }
        }

        // 边框
        if (card.border) {
          cardStyle += `border: ${card.border.width || '2rpx'} ${card.border.style || 'solid'} ${card.border.color || 'transparent'};`;
          cardStyle += `border-radius: ${card.border.radius || '20rpx'};`;
        }

        // 阴影
        if (card.shadow && card.shadow.blur !== '0rpx') {
          cardStyle += `box-shadow: ${card.shadow.x || '0'} ${card.shadow.y || '8rpx'} ${card.shadow.blur || '30rpx'} ${card.shadow.color || 'rgba(0,0,0,0.2)'};`;
        }
      }

      // 构建文字样式
      let textStyle = '';
      if (styleConfig.text && styleConfig.text.primary) {
        const text = styleConfig.text.primary;
        if (text.color) textStyle += `color: ${text.color};`;
        if (text.fontSize) textStyle += `font-size: ${text.fontSize};`;
        if (text.fontWeight) textStyle += `font-weight: ${text.fontWeight};`;
        if (text.letterSpacing) textStyle += `letter-spacing: ${text.letterSpacing};`;
        if (text.textShadow) textStyle += `text-shadow: ${text.textShadow};`;
      }

      // 构建徽章样式
      let badgeStyle = '';
      if (styleConfig.badge) {
        const badge = styleConfig.badge;
        if (badge.background) {
          if (badge.background.type === 'gradient' && badge.background.colors) {
            badgeStyle += `background: linear-gradient(${badge.background.direction || '135deg'}, ${badge.background.colors.join(', ')});`;
          } else if (badge.background.color) {
            badgeStyle += `background: ${badge.background.color};`;
          }
        }
        if (badge.textColor) badgeStyle += `color: ${badge.textColor};`;
      }

      // 动画类
      let animationClass = '';
      if (styleConfig.animation && styleConfig.animation.type !== 'none') {
        animationClass = `animation-${styleConfig.animation.type}`;
      }

      this.setData({
        dynamicCardStyle: cardStyle,
        dynamicTextStyle: textStyle,
        dynamicBadgeStyle: badgeStyle,
        animationClass
      });
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

    // 获取稀有度文本（优先使用品级配置的名称）
    getRarityText(rarity) {
      const { gradeStyles } = this.properties;

      // 如果有品级配置，使用配置的名称
      if (gradeStyles && gradeStyles[rarity]) {
        return gradeStyles[rarity].name || rarity;
      }

      // 默认映射
      const textMap = {
        'common': '普通',
        'rare': '稀有',
        'epic': '史诗',
        'legendary': '传说'
      };
      return textMap[rarity] || rarity || '普通';
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
