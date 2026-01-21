// eslint-disable-next-line no-undef
Page({
  data: {
    src: null,
  },
  onLoad(query) {
    this.setData({
      src: query.src,
    });
  },
});
