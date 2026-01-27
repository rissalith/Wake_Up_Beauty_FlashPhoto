/**
 * 摇骰子组件
 * 用于随机抽取吉祥成语或马品级
 */
const api = require('../../utils/api');

Component({
  properties: {
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
    // 免费次数
    freeCount: {
      type: Number,
      value: 1
    },
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
    }
  },

  data: {
    isRolling: false,        // 是否正在摇骰子
    result: null,            // 抽取结果
    remainingFree: 1,        // 剩余免费次数
    showConfirm: false,      // 是否显示付费确认弹窗
    animationData: {},       // 动画数据
    diceNumbers: [1, 2, 3, 4, 5, 6],  // 骰子面
    currentDice: 1           // 当前骰子面
  },

  lifetimes: {
    attached() {
      this.loadFreeCount();
    }
  },

  methods: {
    // 加载剩余免费次数
    async loadFreeCount() {
      try {
        const userId = wx.getStorageSync('userId');
        if (!userId) {
          this.setData({ remainingFree: this.properties.freeCount });
          return;
        }

        const res = await api.request({
          url: `/api/draw/free-count/${userId}/${this.properties.sceneId}/${this.properties.drawType}`,
          method: 'GET'
        });

        if (res.code === 0) {
          this.setData({ remainingFree: res.data.freeCount });
        }
      } catch (error) {
        console.error('[DiceRoller] Load free count error:', error);
        this.setData({ remainingFree: this.properties.freeCount });
      }
    },

    // 点击摇骰子
    onRollTap() {
      if (this.data.isRolling) return;

      // 检查是否需要付费
      if (this.data.remainingFree <= 0) {
        // 检查醒币余额
        const userPoints = wx.getStorageSync('userPoints') || 0;
        if (userPoints < this.properties.costPerRoll) {
          wx.showToast({
            title: '醒币不足',
            icon: 'none'
          });
          return;
        }
        // 显示付费确认弹窗
        this.setData({ showConfirm: true });
      } else {
        // 免费摇骰子
        this.doRoll();
      }
    },

    // 确认付费
    onConfirmPay() {
      this.setData({ showConfirm: false });
      this.doRoll();
    },

    // 取消付费
    onCancelPay() {
      this.setData({ showConfirm: false });
    },

    // 执行摇骰子
    async doRoll() {
      const userId = wx.getStorageSync('userId');
      if (!userId) {
        wx.showToast({
          title: '请先登录',
          icon: 'none'
        });
        return;
      }

      this.setData({ isRolling: true, result: null });

      // 开始骰子动画
      this.startDiceAnimation();

      try {
        const res = await api.request({
          url: '/api/draw/roll',
          method: 'POST',
          data: {
            userId,
            sceneId: this.properties.sceneId,
            drawType: this.properties.drawType
          }
        });

        // 等待动画完成
        await this.delay(2000);

        if (res.code === 0) {
          const result = res.data.result;
          this.setData({
            isRolling: false,
            result,
            remainingFree: res.data.isFree ? this.data.remainingFree - 1 : this.data.remainingFree
          });

          // 更新本地醒币余额
          if (!res.data.isFree) {
            wx.setStorageSync('userPoints', res.data.newBalance);
          }

          // 触发结果事件
          this.triggerEvent('result', {
            result,
            isFree: res.data.isFree,
            pointsCost: res.data.pointsCost,
            newBalance: res.data.newBalance
          });

          // 显示结果动画
          this.showResultAnimation();
        } else {
          this.setData({ isRolling: false });
          wx.showToast({
            title: res.msg || '抽取失败',
            icon: 'none'
          });
        }
      } catch (error) {
        console.error('[DiceRoller] Roll error:', error);
        this.setData({ isRolling: false });
        wx.showToast({
          title: '网络错误',
          icon: 'none'
        });
      }
    },

    // 骰子动画
    startDiceAnimation() {
      let count = 0;
      const maxCount = 20;

      const animate = () => {
        if (count >= maxCount) return;

        count++;
        const randomDice = Math.floor(Math.random() * 6) + 1;
        this.setData({ currentDice: randomDice });

        // 逐渐减慢
        const delay = 50 + count * 10;
        setTimeout(animate, delay);
      };

      animate();
    },

    // 显示结果动画
    showResultAnimation() {
      const animation = wx.createAnimation({
        duration: 500,
        timingFunction: 'ease-out'
      });

      animation.scale(1.2).step();
      animation.scale(1).step();

      this.setData({ animationData: animation.export() });
    },

    // 延迟函数
    delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    },

    // 重新摇骰子
    onReroll() {
      this.setData({ result: null });
      this.onRollTap();
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
    }
  }
});
