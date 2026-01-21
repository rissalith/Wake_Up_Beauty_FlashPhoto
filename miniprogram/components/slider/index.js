let ww = wx.getSystemInfoSync().windowWidth;

Component({
  /**
   * min，当前最小值
   * max，当前最大值
   */
  properties: {
    min: Number,
    max: Number,
    value: {
      type: Number,
      value: 0,
      observer(value) {
        this.setData({
          offset: this.data.steplong * value,
        });
      },
    },
  },

  data: {
    left: 0,
    offset: 0, //左滑块中心距离滑动器左端的偏移量
    steplong: 2, //滑块每单位的长度，px
  },

  ready: function () {
    this.getStep();
  },

  methods: {
    getNodeSize(id) {
      return new Promise((resolve) => {
        this.createSelectorQuery()
          .select(`#${id}`)
          .boundingClientRect((res) => resolve(res))
          .exec();
      });
    },
    async getStep() {
      const { width, left } = await this.getNodeSize("slider"); // 总分割的块数
      let totalSteps = this.data.max - this.data.min;
      // 每单位步长，px
      let steplong = width / totalSteps;
      this.setData({
        offset: this.data.value * steplong,
        steplong,
        left,
      });
    },
    // 滑块touchmove事件
    move(e, type) {
      let width = e.changedTouches[0].pageX - this.data.left;
      let value = width / this.data.steplong;
      if (value < this.data.min) {
        value = this.data.min;
      }
      if (value > this.data.max) {
        value = this.data.max;
      }
      value = Math.round(value);
      width = this.data.steplong * value;
      this.setData({
        offset: width,
        value,
      });
      if (!type) this.triggerEvent("changing", value);
      return value;
    },
    end(e) {
      const value = this.move(e, "end");
      this.triggerEvent("change", value);
    },
  },
});
