import i18n from "../../utils/i18n.js";

const typeName = {
  filter: i18n.t("filter"),
  beauti: i18n.t("beautify"),
  makeUp: i18n.t("makeUp"),
  sticker: i18n.t("sticker"),
  background: i18n.t("background"),
};
const app = getApp();
const isEn = app.globalData.language === "en";

Component({
  options: {
    pureDataPattern: /^_/, // 指定所有 _ 开头的数据字段为纯数据字段
  },
  properties: {
    list: {
      type: Array,
      value: [],
    },
    // 选中的滤镜
    current: {
      type: Object,
      value: {
        id: "",
        type: "",
      },
      observer(value) {
        this.setData({ name: typeName[value.type] });
      },
    },
  },
  data: {
    sliderValue: 90,
    tagList: [],
    currentTag: "",
    name: "",
    none: i18n.t("none"),
    intensity: i18n.t("intensity"),
    activeTag: "",
    scrollKey: null,
    enable: true,
    isEn,
  },
  observers: {
    "list, current": function (list, current) {
      if (!list?.length || !current?.id) {
        return;
      }
      const item = list.find((item) => item.id == current.id);
      this.setData({
        sliderValue: item?.intensity || 0,
      });
    },
  },
  methods: {
    update() {
      this.triggerEvent("update", {
        type: this.data.current.type,
        id: this.data.current.id,
        intensity: this.data.sliderValue,
      });
    },
    onClickItem(e) {
      const key = e.currentTarget.dataset.key;
      const item = this.data.list.find((item) => item.id == key);
      this.setData({
        current: {
          ...this.data.current,
          id: key,
        },
        sliderValue: item?.intensity,
        currentTag: item?.tag,
      });
      this.update();
    },
    onChangeSlide(e) {
      const value = e.detail;
      this._onSliderChanged(value);
    },
    setActive(e) {
      const key = e.currentTarget.dataset.key;
      const item = this.data.list.find((item) => item.tag == key);
      this.setData({
        activeTag: key,
        scrollKey: "x" + item.id,
      });
    },
    _onSliderChanged(value) {
      if (value !== this.data.sliderValue) {
        this.setData({
          sliderValue: Math.trunc(value),
        });
        // 节流
        if (this.data._timer) {
          clearTimeout(this.data._timer);
        }
        this.data._timer = setTimeout((_) => {
          this.update();
          this.data._timer = null;
        }, 25);
      }
    },
    changeEnable() {
      this.setData({
        enable: !this.data.enable,
      });
      this.triggerEvent("changeEnable", this.data.enable);
    },
    dealName(name = "") {
      return name.slice(0, isEn ? 10 : 5);
    },
  },
});
