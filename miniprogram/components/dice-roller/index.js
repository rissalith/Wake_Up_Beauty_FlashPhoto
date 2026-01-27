/**
 * 摇骰子容器组件（重构版）
 *
 * 职责：
 * - 协调子组件（dice-cube、result-card）
 * - 管理组件内部状态
 * - 与父页面通信（通过事件）
 *
 * 设计模式：受控组件
 * - 核心状态（result、isRolling、freeCount）由父页面传入
 * - 组件通过事件通知父页面进行状态更新
 */
Component({
  properties: {
    // === 必需属性 ===
    // 步骤标识，用于区分不同的摇骰子步骤
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

    // === 状态属性（由父页面控制）===
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
    // 是否已确认选择
    confirmed: {
      type: Boolean,
      value: false
    },

    // === 配置属性 ===
    // 每次消耗醒币
    costPerRoll: {
      type: Number,
      value: 10
    },
    // 标题
    title: {
      type: String,
      value: ''
    },
    // 副标题
    subtitle: {
      type: String,
      value: ''
    },
    // 是否显示稀有度
    showRarity: {
      type: Boolean,
      value: false
    },

    // === 用户状态 ===
    // 用户当前醒币余额
    userPoints: {
      type: Number,
      value: 0
    }
  },

  data: {
    showPayConfirm: false,  // 是否显示付费确认弹窗
    currentDiceFace: 1      // 当前骰子面
  },

  methods: {
    // 点击骰子
    onDiceTap() {
      if (this.properties.isRolling || this.properties.confirmed) {
        return;
      }

      // 检查是否需要付费
      if (this.properties.freeCount <= 0) {
        // 检查醒币余额
        if (this.properties.userPoints < this.properties.costPerRoll) {
          wx.showToast({
            title: '醒币不足',
            icon: 'none'
          });
          // 触发余额不足事件
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
        // 免费摇骰子，直接触发事件
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

    // 请求摇骰子（通知父页面）
    requestRoll() {
      this.triggerEvent('roll', {
        stepKey: this.properties.stepKey,
        drawType: this.properties.drawType,
        sceneId: this.properties.sceneId,
        needPay: this.properties.freeCount <= 0
      });
    },

    // 结果卡片 - 重摇
    onResultReroll() {
      this.onDiceTap();
    },

    // 结果卡片 - 确认选择
    onResultConfirm(e) {
      this.triggerEvent('confirm', {
        stepKey: this.properties.stepKey,
        result: e.detail.result
      });
    }
  }
});
