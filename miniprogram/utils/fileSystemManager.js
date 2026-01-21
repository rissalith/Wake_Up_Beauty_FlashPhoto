/* eslint-disable prefer-const */
/* eslint-disable prefer-destructuring */
/* eslint-disable max-len */
/* eslint-disable no-underscore-dangle */
/* eslint-disable no-param-reassign */
/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */
class FileSystemManager {
  constructor() {
    this.fs = wx.getFileSystemManager();
    this.basePath = `${wx.env.USER_DATA_PATH}/`;
  }
  //   创建文件夹
  mkdir(dirPath) {
    try {
      this.fs.accessSync(this.basePath + dirPath);
      return true;
    } catch (e) {
      try {
        this.fs.mkdirSync(this.basePath + dirPath, true);
        return true;
      } catch (e) {
        return false;
      }
    }
  }
  //   保存文件
  saveFile(tempFilePath, filePath) {
    try {
      const savedFilePath = this.fs.saveFileSync(
        tempFilePath,
        this.basePath + filePath,
      );
      return savedFilePath;
    } catch (e) {
      return false;
    }
  }
  //   检查本地文件是否存在
  findFile(filePath) {
    try {
      this.fs.statSync(this.basePath + filePath, false);
      return true;
    } catch (e) {
      return false;
    }
  }
  //   获取指定目录的文件列表
  getFileList(dirPath) {
    try {
      const fileList = this.fs.readdirSync(this.basePath + dirPath) || [];
      return fileList.map(f => `${this.basePath}${dirPath}/${f}`);
    } catch (e) {
      return [];
    }
  }
}

export default new FileSystemManager();
