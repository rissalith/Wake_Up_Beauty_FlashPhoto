/**
 * 骰子动画子组件
 * 纯UI组件，负责骰子的渲染和动画效果
 */
Component({
  properties: {
    // 是否正在摇动
    isRolling: {
      type: Boolean,
      value: false
    },
    // 当前骰子面 (1-6)
    currentFace: {
      type: Number,
      value: 1
    },
    // 是否禁用点击
    disabled: {
      type: Boolean,
      value: false
    },
    // 骰子大小 (rpx)
    size: {
      type: Number,
      value: 160
    }
  },

  data: {
    internalFace: 1,
    animationTimer: null
  },

  observers: {
    'isRolling': function(isRolling) {
      if (isRolling) {
        this.startAnimation();
      } else {
        this.stopAnimation();
      }
    },
    'currentFace': function(face) {
      if (!this.data.isRolling) {
        this.setData({ internalFace: face });
      }
    }
  },

  lifetimes: {
    detached() {
      this.stopAnimation();
    }
  },

  methods: {
    // 开始骰子动画
    startAnimation() {
      let count = 0;
      const maxCount = 20;

      const animate = () => {
        if (count >= maxCount || !this.properties.isRolling) {
          return;
        }

        count++;
        const randomFace = Math.floor(Math.random() * 6) + 1;
        this.setData({ internalFace: randomFace });

        // 逐渐减慢
        const delay = 50 + count * 10;
        this.data.animationTimer = setTimeout(animate, delay);
      };

      animate();
    },

    // 停止动画
    stopAnimation() {
      if (this.data.animationTimer) {
        clearTimeout(this.data.animationTimer);
        this.data.animationTimer = null;
      }
      // 动画结束后显示传入的面
      this.setData({ internalFace: this.properties.currentFace });
    },

    // 点击骰子
    onTap() {
      if (this.properties.disabled || this.properties.isRolling) {
        return;
      }
      this.triggerEvent('tap');
    }
  }
});
