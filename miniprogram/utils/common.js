export default function () {
  const promise = new Promise((resolve) => {
    wx.downloadFile({
      url: 'https://webar-static.tencent-cloud.com/assets/share.png',
      success: (res) => {
        resolve({
          imageUrl: res.tempFilePath,
          path: '/pages/index/index',
        });
      },
    });
  });
  return {
    // title: '自定义转发标题',
    imageUrl: '/pages/index/share.png',
    path: '/pages/index/index',
    promise,
  };
}
