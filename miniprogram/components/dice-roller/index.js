/**
 * 摇骰子容器组件 - 横向布局版
 *
 * 布局：左侧结果卡片 + 右侧骰子
 * 交互：点击骰子抽取，结果直接显示，无需确认
 */
Component({
  properties: {
    // 步骤标识
    stepKey: {
      type: String,
      value: ''
    },
    // 场景ID
    sceneId: {
      type: String,
      value: ''
    },
    // 抽取类型: phrase(成语) / horse(马品级)
    drawType: {
      type: String,
      value: 'phrase'
    },
    // 当前抽取结果
    result: {
      type: Object,
      value: null
    },
    // 是否正在摇骰子
    isRolling: {
      type: Boolean,
      value: false
    },
    // 剩余免费次数
    freeCount: {
      type: Number,
      value: 1
    },
    // 每次消耗醒币
    costPerRoll: {
      type: Number,
      value: 10
    },
    // 是否显示稀有度
    showRarity: {
      type: Boolean,
      value: false
    },
    // 用户当前醒币余额
    userPoints: {
      type: Number,
      value: 0
    },
    // 选项池数据（用于显示规则）
    poolItems: {
      type: Array,
      value: []
    }
  },

  data: {
    showPayConfirm: false,
    showRulesModal: false,
    currentDiceFace: 1
  },

  lifetimes: {
    attached() {
      // 获取国际化文本
      const { t, getLangData } = require('../../utils/lang');
      const langData = getLangData();
      this.setData({
        i18n: {
          clickToRoll: langData.dice_clickToRoll || '点击骰子抽取',
          rolling: langData.dice_rolling || '抽取中...',
          rollAgain: langData.dice_rollAgain || '再摇一次',
          clickRoll: langData.dice_clickRoll || '点击抽取',
          free: langData.dice_free || '免费',
          points: langData.points || '醒币',
          confirmTitle: langData.dice_confirmTitle || '确认消耗醒币',
          confirmDesc: langData.dice_confirmDesc || '本次摇骰子将消耗',
          currentBalance: langData.dice_currentBalance || '当前余额',
          cancel: langData.cancel || '取消',
          confirm: langData.confirm || '确认',
          insufficientPoints: langData.dice_insufficientPoints || '醒币不足',
          // 规则弹窗相关
          rulesTitle: langData.dice_rulesTitle || '抽取规则',
          freeRule: langData.dice_freeRule || '免费次数',
          freeRuleDesc: langData.dice_freeRuleDesc || '每天每个场景可免费抽取1次',
          costRule: langData.dice_costRule || '付费抽取',
          perTime: langData.dice_perTime || '次',
          disclaimer: langData.dice_disclaimer || '抽取结果完全随机，概率仅供参考',
          poolTitle: langData.dice_poolTitle || '可抽取内容',
          loadingPool: langData.dice_loadingPool || '加载中...'
        }
      });
    }
  },

  methods: {
    // 点击骰子
    onDiceTap() {
      if (this.properties.isRolling) {
        return;
      }

      // 检查是否需要付费
      if (this.properties.freeCount <= 0) {
        // 检查醒币余额
        if (this.properties.userPoints < this.properties.costPerRoll) {
          wx.showToast({
            title: this.data.i18n?.insufficientPoints || '醒币不足',
            icon: 'none'
          });
          this.triggerEvent('insufficientPoints', {
            stepKey: this.properties.stepKey,
            required: this.properties.costPerRoll,
            current: this.properties.userPoints
          });
          return;
        }
        // 显示付费确认弹窗
        this.setData({ showPayConfirm: true });
      } else {
        // 免费摇骰子
        this.requestRoll();
      }
    },

    // 确认付费
    onConfirmPay() {
      this.setData({ showPayConfirm: false });
      this.requestRoll();
    },

    // 取消付费
    onCancelPay() {
      this.setData({ showPayConfirm: false });
    },

    // 请求摇骰子
    requestRoll() {
      this.triggerEvent('roll', {
        stepKey: this.properties.stepKey,
        drawType: this.properties.drawType,
        sceneId: this.properties.sceneId,
        needPay: this.properties.freeCount <= 0
      });
    },

    // 显示规则弹窗
    onShowRules() {
      this.setData({ showRulesModal: true });
      // 触发事件让父组件加载选项池数据（如果还没有）
      if (!this.properties.poolItems || this.properties.poolItems.length === 0) {
        this.triggerEvent('loadPool', {
          stepKey: this.properties.stepKey,
          drawType: this.properties.drawType,
          sceneId: this.properties.sceneId
        });
      }
    },

    // 关闭规则弹窗
    onCloseRules() {
      this.setData({ showRulesModal: false });
    },

    // 预览图片
    onPreviewImage(e) {
      const url = e.currentTarget.dataset.url;
      if (url) {
        wx.previewImage({
          urls: [url],
          current: url
        });
      }
    }
  }
});
