// 历史记录页面
const app = getApp();
const lang = require('../../utils/lang.js');
const imageConfig = require('../../config/images.js');
const cosUtil = require('../../utils/cos.js');
const { api } = require('../../config/api.js');
const aiService = require('../../utils/ai-service.js');
const configManager = require('../../utils/configManager.js');
const tracker = require('../../utils/tracker.js');
const { getBeijingISOString } = require('../../utils/timeUtil.js');

Page({
  data: {
    isLoggedIn: false,     // 登录状态
    historyList: [],       // 当前显示的列表（经过筛选）
    allHistoryList: [],    // 完整历史列表（未筛选）
    // 类型筛选（动态从历史记录中提取）
    currentFilter: 'all',  // 当前类型筛选: all / 场景ID
    typeFilters: [],       // 动态类型筛选列表 [{id, name, count}]
    allHistoryCount: 0,    // 全部数量
    // 状态筛选
    currentStatus: 'all',  // 当前状态筛选: all / pending / done / failed
    currentSource: 'all',  // 当前来源筛选: all / original / remake
    statusCounts: {        // 各状态数量
      all: 0,
      pending: 0,
      done: 0,      // 原创已完成数量
      failed: 0,
      remake: 0     // 重制数量
    },
    // 视图模式: list / grid
    viewMode: 'list',
    // 多选模式
    selectMode: false,
    selectedCount: 0,
    isAllSelected: false,
    // 分享海报弹窗
    showShareModal: false,
    shareItem: null,
    posterImage: '',
    // 照片详情弹窗
    showPhotoDetailModal: false,
    currentDetailPhoto: null,
    // 多语言文本
    i18n: {}
  },

  // 事件监听回调函数
  _historyUpdateHandler: null,

  onLoad() {
    this.loadHistory();
    this.loadLanguage();
    // 读取保存的视图模式
    const savedViewMode = wx.getStorageSync('historyViewMode') || 'list';
    this.setData({ viewMode: savedViewMode });

    // 监听历史更新事件
    this._historyUpdateHandler = () => {
      this.loadHistory();
    };
    if (app && app.on) {
      app.on('historyUpdated', this._historyUpdateHandler);
    }
  },

  onUnload() {
    // 页面卸载时取消监听
    if (app && app.off && this._historyUpdateHandler) {
      app.off('historyUpdated', this._historyUpdateHandler);
    }
    
    // 内存清理
    this._cleanupMemory();
  },

  // 内存清理
  _cleanupMemory() {
    // 清理大数据
    this.setData({
      historyList: [],
      allHistoryList: [],
      posterImage: '',
      shareItem: null,
      currentDetailPhoto: null,
      statusCounts: { all: 0, pending: 0, done: 0, failed: 0, remake: 0 }
    });

    // 清理事件处理器引用
    this._historyUpdateHandler = null;
  },

  onShow() {
    // 设置tabBar选中状态并刷新语言和生成计数
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
      this.getTabBar().loadLanguage();
      this.getTabBar().updateGeneratingCount();
    }

    // 检查登录状态
    const userId = wx.getStorageSync('userId');
    const isLoggedIn = !!userId;
    this.setData({ isLoggedIn });

    // 未登录时不加载数据
    if (!isLoggedIn) {
      return;
    }

    // 先刷新语言（确保 i18n 数据是最新的）
    this.loadLanguage();
    // 确保 configManager 配置已加载后再刷新数据
    configManager.init().then(() => {
      // 先尝试从服务器恢复数据，再加载本地历史
      this.restoreFromServer().then(() => {
        this.loadHistory();
      });
    });
  },

  // 跳转到首页登录
  goToLogin() {
    wx.switchTab({
      url: '/pages/index/index'
    });
    // 通知首页显示登录弹窗
    if (app && app.emit) {
      app.emit('showLoginModal');
    }
  },

  // 从服务器恢复历史记录（本地缓存为空时）
  async restoreFromServer() {
    const localHistory = wx.getStorageSync('photoHistory') || [];
    // 如果本地已有数据，不需要恢复
    if (localHistory.length > 0) return;

    const userId = wx.getStorageSync('userId');
    if (!userId) return;

    try {
      const res = await api.getPhotoHistory(userId, { pageSize: 100 });
      if ((res.code === 0 || res.code === 200) && res.data && res.data.list && res.data.list.length > 0) {
        // 转换服务器数据格式为本地格式
        // 注意：后端返回的是 result_url 和 original_url，需要映射到前端的 resultImage 和 originalImage
        const serverHistory = res.data.list.map(item => ({
          id: item.photo_id || item.id,
          createTime: item.created_at ? new Date(item.created_at.replace(/-/g, '/')).getTime() : Date.now(),
          status: item.status || 'done',
          resultImage: item.result_url || item.result_image || '',
          originalImage: item.original_url || item.original_image || '',
          spec: item.spec || '证件照',
          bgName: item.bg_color || '',
          synced: true  // 标记为已同步
        }));
        wx.setStorageSync('photoHistory', serverHistory);
      }
    } catch (err) {
      // 静默处理
    }
  },

  // 加载语言设置
  loadLanguage() {
    const i18n = lang.getLangData();
    this.setData({ i18n });
    // 动态设置导航栏标题
    wx.setNavigationBarTitle({
      title: i18n.hist_pageTitle || '生成历史'
    });
  },

  // 照片规格翻译（从后台配置获取，支持双向翻译）
  translateSpec(spec) {
    const currentLang = lang.getCurrentLang();

    // 从后台配置获取所有场景
    const scenes = configManager.getScenes() || [];

    // 遍历场景，找到匹配的spec
    for (const scene of scenes) {
      // 检查是否匹配任何语言的名称
      const names = [scene.name, scene.name_cn, scene.name_en, scene.nameEn];
      if (names.some(name => name && name === spec)) {
        // 找到匹配，返回当前语言对应的翻译
        if (currentLang === 'en') {
          return scene.name_en || scene.nameEn || scene.name || spec;
        } else {
          return scene.name_cn || scene.name || spec;
        }
      }
    }

    // 后台配置中未找到匹配，使用本地语言包作为后备
    const specKeyMap = {
      '证件照': 'hist_sceneIdPhoto',
      'ID Photo': 'hist_sceneIdPhoto',
      '职业照': 'hist_sceneProfessional',
      'Professional': 'hist_sceneProfessional',
      '写真': 'hist_scenePortrait',
      'Portrait': 'hist_scenePortrait',
      '全家福': 'hist_sceneFamily',
      'Family': 'hist_sceneFamily',
      '宠物照': 'hist_scenePet',
      'Pet': 'hist_scenePet',
      '婚纱照': 'hist_sceneWedding',
      'Wedding': 'hist_sceneWedding'
    };

    const langKey = specKeyMap[spec];
    if (langKey) {
      return lang.t(langKey);
    }

    // 未找到匹配，返回原值
    return spec;
  },

  // 获取当前语言的场景名称（优先使用保存的多语言字段）
  getLocalizedSpec(item) {
    const currentLang = lang.getCurrentLang();
    // 优先使用保存的多语言字段
    if (currentLang === 'en' && item.spec_en) {
      return item.spec_en;
    } else if (item.spec_cn) {
      return item.spec_cn;
    }
    // 回退到旧的翻译逻辑（兼容旧数据）
    return this.translateSpec(item.spec);
  },

  // 切换视图模式
  toggleViewMode() {
    const viewMode = this.data.viewMode === 'list' ? 'grid' : 'list';
    this.setData({ viewMode });
    wx.setStorageSync('historyViewMode', viewMode);
  },

  // 设置视图模式（Tab切换使用）
  setViewMode(e) {
    const viewMode = e.currentTarget.dataset.mode;
    if (viewMode !== this.data.viewMode) {
      this.setData({ viewMode });
      wx.setStorageSync('historyViewMode', viewMode);
    }
  },

  // 设置类型筛选条件
  setFilter(e) {
    const filter = e.currentTarget.dataset.filter;
    if (filter === this.data.currentFilter) return;

    this.setData({ currentFilter: filter });
    this.applyCurrentFilters();
  },

  // 设置状态筛选条件
  setStatusFilter(e) {
    const status = e.currentTarget.dataset.status;
    if (status === this.data.currentStatus) return;

    // 切换状态时重置来源和类型筛选
    this.setData({
      currentStatus: status,
      currentSource: 'all',
      currentFilter: 'all'
    });
    this.applyCurrentFilters();
  },

  // 设置来源筛选条件（原创/重制）
  setSourceFilter(e) {
    const source = e.currentTarget.dataset.source;
    if (source === this.data.currentSource) return;

    this.setData({ currentSource: source });
    this.applyCurrentFilters();
  },

  // 重置筛选（回到全部）
  resetFilter() {
    this.setData({
      currentFilter: 'all',
      currentStatus: 'all',
      currentSource: 'all'
    });
    this.applyCurrentFilters();
  },

  // 应用当前筛选条件（统一入口）
  applyCurrentFilters() {
    const { allHistoryList, currentFilter, currentStatus, currentSource } = this.data;
    const historyList = this.applyFilters(allHistoryList, currentFilter, currentStatus, currentSource);

    this.setData({
      historyList,
      selectedCount: 0,
      isAllSelected: false,
      selectMode: false
    });
  },

  // 应用筛选逻辑
  applyFilters(list, typeFilter, statusFilter, sourceFilter = 'all') {
    let filteredList = list;

    // 先按状态筛选
    if (statusFilter === 'pending') {
      filteredList = filteredList.filter(item => item.displayStatus === 'pending');
    } else if (statusFilter === 'done') {
      filteredList = filteredList.filter(item => item.displayStatus === 'done');
    } else if (statusFilter === 'failed') {
      filteredList = filteredList.filter(item => item.displayStatus === 'failed');
    }
    // statusFilter === 'all' 时不过滤状态

    // 按来源筛选（对全部和已完成状态生效）
    if (sourceFilter !== 'all' && (statusFilter === 'all' || statusFilter === 'done')) {
      if (sourceFilter === 'original') {
        filteredList = filteredList.filter(item => item.displayStatus !== 'done' || !item.isRemake);
      } else if (sourceFilter === 'remake') {
        filteredList = filteredList.filter(item => item.displayStatus === 'done' && item.isRemake);
      }
    }

    // 按类型筛选（对全部和已完成状态生效，只筛选已完成的照片）
    if (typeFilter !== 'all' && (statusFilter === 'all' || statusFilter === 'done')) {
      filteredList = filteredList.filter(item =>
        item.displayStatus !== 'done' || this.getItemTypeId(item) === typeFilter
      );
    }

    return filteredList.map(item => ({
      ...item,
      selected: false
    }));
  },

  // 获取记录的类型ID（用于筛选匹配）
  getItemTypeId(item) {
    // 优先使用type字段
    if (item.type) return item.type;
    // 根据spec判断类型
    if (item.spec) {
      if (item.spec.includes('证件') || item.spec.includes('寸') || 
          item.spec.includes('ID') || item.spec.includes('inch')) {
        return 'idphoto';
      }
      if (item.spec.includes('职业') || item.spec.includes('Professional')) {
        return 'professional';
      }
      if (item.spec.includes('写真') || item.spec.includes('Portrait')) {
        return 'portrait';
      }
      if (item.spec.includes('全家') || item.spec.includes('Family')) {
        return 'family';
      }
      if (item.spec.includes('宠物') || item.spec.includes('Pet')) {
        return 'pet';
      }
      if (item.spec.includes('婚纱') || item.spec.includes('Wedding')) {
        return 'wedding';
      }
    }
    // 默认返回idphoto（兼容旧数据）
    return 'idphoto';
  },

  // 计算各类型数量（动态提取所有存在的类型）
  calculateFilterCounts(completedItems) {
    const all = completedItems.length;
    
    // 统计每种类型的数量
    const typeCounts = {};
    completedItems.forEach(item => {
      const typeId = this.getItemTypeId(item);
      if (!typeCounts[typeId]) {
        typeCounts[typeId] = 0;
      }
      typeCounts[typeId]++;
    });

    // 转换为筛选列表，只保留有数据的类型
    const typeFilters = [];
    const currentLang = lang.getCurrentLang();
    const scenes = configManager.getScenes() || [];

    for (const [typeId, count] of Object.entries(typeCounts)) {
      if (count > 0) {
        // 从后台配置获取翻译名称
        const scene = scenes.find(s => s.id === typeId);
        let typeName = typeId;
        
        if (scene) {
          if (currentLang === 'en') {
            typeName = scene.name_en || scene.nameEn || scene.name || typeId;
          } else {
            typeName = scene.name_cn || scene.name || typeId;
          }
        } else {
          // 如果后台配置中找不到，使用默认名称
          typeName = this.getDefaultTypeName(typeId, currentLang);
        }
        
        typeFilters.push({ id: typeId, name: typeName, count: count });
      }
    }

    // 按数量排序（数量多的在前）
    typeFilters.sort((a, b) => b.count - a.count);

    return { allHistoryCount: all, typeFilters: typeFilters };
  },

  // 获取默认类型名称（后台配置中找不到时使用语言包）
  getDefaultTypeName(typeId, currentLang) {
    // 使用语言包获取翻译
    const keyMap = {
      'idphoto': 'hist_sceneIdPhoto',
      'professional': 'hist_sceneProfessional',
      'portrait': 'hist_scenePortrait',
      'family': 'hist_sceneFamily',
      'pet': 'hist_scenePet',
      'wedding': 'hist_sceneWedding'
    };

    const langKey = keyMap[typeId];
    if (langKey) {
      return lang.t(langKey);
    }
    return typeId;
  },

  // 加载历史记录
  loadHistory() {
    let history = wx.getStorageSync('photoHistory') || [];

    // 超时时间：5分钟（可调整）
    const TIMEOUT_MS = 5 * 60 * 1000;
    const now = Date.now();
    let hasTimeout = false;

    // 检测超时任务并标记为失败
    history = history.map(item => {
      if (item.status === 'generating' && item.createTime) {
        const elapsed = now - item.createTime;
        if (elapsed > TIMEOUT_MS) {
          hasTimeout = true;
          return {
            ...item,
            status: 'failed',
            failReason: lang.t('hist_timeoutError') || '生成超时，请重试',
            isSystemError: true  // 标记为系统原因失败，可免费重试
          };
        }
      }
      return item;
    });

    // 如果有超时任务，更新存储
    if (hasTimeout) {
      wx.setStorageSync('photoHistory', history);
    }

    // 统一处理所有记录到一个列表
    const allHistoryList = [];
    let pendingCount = 0;
    let doneCount = 0;
    let failedCount = 0;
    let remakeCount = 0;

    history.forEach(item => {
      // 统一状态标识
      let displayStatus = item.status;
      if (item.status === 'generating') {
        displayStatus = 'pending';
        pendingCount++;
      } else if (item.status === 'done' && item.resultImage) {
        displayStatus = 'done';
        // 重制照片单独计数，不计入已完成
        if (item.isRemade === true) {
          remakeCount++;
        } else {
          doneCount++;
        }
      } else if (item.status === 'failed') {
        displayStatus = 'failed';
        failedCount++;
      } else {
        // 跳过未知状态或无效记录
        return;
      }

      allHistoryList.push({
        ...item,
        displayStatus,  // pending / done / failed
        timeStr: this.formatTime(item.createTime),
        specDisplay: this.getLocalizedSpec(item),
        selected: false,
        hasShared: item.hasShared || false,
        isRemake: item.isRemade === true
      });
    });

    // 计算状态数量
    const statusCounts = {
      all: allHistoryList.length,
      pending: pendingCount,
      done: doneCount,
      failed: failedCount,
      remake: remakeCount
    };

    // 计算类型筛选数量（仅已完成的记录）
    const completedItems = allHistoryList.filter(item => item.displayStatus === 'done');
    const filterCounts = this.calculateFilterCounts(completedItems);

    // 检查当前筛选条件是否还有效（如果选择的类型已不存在，重置为all）
    let currentFilter = this.data.currentFilter;
    if (currentFilter !== 'all' && !filterCounts.typeFilters.find(t => t.id === currentFilter)) {
      currentFilter = 'all';
    }

    // 应用当前筛选条件
    const historyList = this.applyFilters(allHistoryList, currentFilter, this.data.currentStatus, this.data.currentSource);

    this.setData({
      allHistoryList,
      historyList,
      statusCounts,
      currentFilter,
      selectedCount: 0,
      isAllSelected: false,
      selectMode: false,
      ...filterCounts
    });

    // 更新tabBar标记
    this.updateTabBarBadge(pendingCount);

    // 自动同步未同步的照片到服务器
    this.syncUnsyncedPhotos(completedItems);
  },

  // 同步未同步的照片到服务器
  syncUnsyncedPhotos(completedItems) {
    const userId = wx.getStorageSync('userId');
    if (!userId) {
      return;
    }

    // 筛选出未同步的照片
    const unsyncedPhotos = completedItems.filter(item => !item.synced);
    if (unsyncedPhotos.length === 0) {
      return;
    }

    // 逐个同步照片
    unsyncedPhotos.forEach(item => {
      this.syncPhotoToServer(item, userId);
    });
  },

  // 同步单张照片到服务器
  syncPhotoToServer(item, userId) {
    api.syncPhoto({
      photo_id: item.id,
      user_id: userId,
      original_image: item.originalImage || '',
      result_image: item.resultImage || '',
      spec: item.spec || '证件照',
      bg_color: item.bgName || '',
      status: 'done',
      created_at: item.createTime ? new Date(item.createTime).toISOString() : getBeijingISOString()
    }).then(() => {
      // 标记为已同步
      let history = wx.getStorageSync('photoHistory') || [];
      history = history.map(h => {
        if (h.id === item.id) {
          return { ...h, synced: true };
        }
        return h;
      });
      wx.setStorageSync('photoHistory', history);
    }).catch(err => {
      // 静默处理
    });
  },

  // 更新tabBar标记
  updateTabBarBadge(count) {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        generatingCount: count
      });
    }
  },

  // 格式化时间
  formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const i18n = this.data.i18n || lang.getLangData();

    if (diff < 60000) return i18n.hist_justNow || '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + (i18n.hist_minutesAgo || '分钟前');
    if (diff < 86400000) return Math.floor(diff / 3600000) + (i18n.hist_hoursAgo || '小时前');
    if (diff < 604800000) return Math.floor(diff / 86400000) + (i18n.hist_daysAgo || '天前');

    const month = date.getMonth() + 1;
    const day = date.getDate();
    // 英文格式用 / ，中文格式用 月日
    const monthSep = i18n.hist_month || '月';
    const daySep = i18n.hist_day || '日';
    return `${month}${monthSep}${day}${daySep}`;
  },

  // ========== 多选功能 ==========
  // 切换选择模式
  toggleSelectMode() {
    const selectMode = !this.data.selectMode;
    if (!selectMode) {
      // 退出选择模式时清除所有选中
      const historyList = this.data.historyList.map(item => ({
        ...item,
        selected: false
      }));
      this.setData({ selectMode, historyList, selectedCount: 0, isAllSelected: false });
    } else {
      this.setData({ selectMode });
    }
  },

  // 切换单个选中
  toggleSelect(e) {
    const index = e.currentTarget.dataset.index;
    const historyList = this.data.historyList;
    historyList[index].selected = !historyList[index].selected;

    const selectedCount = historyList.filter(item => item.selected).length;
    const isAllSelected = selectedCount === historyList.length;

    this.setData({ historyList, selectedCount, isAllSelected });
  },

  // 切换全选
  toggleSelectAll() {
    const isAllSelected = !this.data.isAllSelected;
    const historyList = this.data.historyList.map(item => ({
      ...item,
      selected: isAllSelected
    }));
    const selectedCount = isAllSelected ? historyList.length : 0;

    this.setData({ historyList, selectedCount, isAllSelected });
  },

  // 批量删除
  batchDelete() {
    if (this.data.selectedCount === 0) {
      wx.showToast({ title: lang.t('hist_selectPhoto'), icon: 'none' });
      return;
    }

    const selectedImages = this.data.historyList
      .filter(item => item.selected)
      .map(item => item.resultImage);

    wx.showLoading({ title: lang.t('hist_saving') });

    let savedCount = 0;
    let failCount = 0;
    const total = selectedImages.length;

    // 下载并保存单张图片
    const downloadAndSave = (url) => {
      return new Promise((resolve) => {
        // 判断是网络图片还是本地文件
        if (url.startsWith('http://') || url.startsWith('https://')) {
          // 网络图片，需要先下载
          wx.downloadFile({
            url: url,
            success: (res) => {
              if (res.statusCode === 200) {
                wx.saveImageToPhotosAlbum({
                  filePath: res.tempFilePath,
                  success: () => resolve({ success: true }),
                  fail: (err) => resolve({ success: false, err })
                });
              } else {
                resolve({ success: false, err: { errMsg: '下载失败' } });
              }
            },
            fail: (err) => resolve({ success: false, err })
          });
        } else {
          // 本地文件，直接保存
          wx.saveImageToPhotosAlbum({
            filePath: url,
            success: () => resolve({ success: true }),
            fail: (err) => resolve({ success: false, err })
          });
        }
      });
    };

    // 逐个保存图片
    const saveNext = async (index) => {
      if (index >= total) {
        wx.hideLoading();
        if (failCount === 0) {
          wx.showToast({ title: lang.t('hist_savedPhotos') + savedCount, icon: 'success' });
        } else {
          wx.showToast({ title: lang.t('hist_successCount') + savedCount + ', ' + lang.t('hist_failCount') + failCount, icon: 'none' });
        }
        // 退出选择模式
        this.toggleSelectMode();
        return;
      }

      const result = await downloadAndSave(selectedImages[index]);

      if (result.success) {
        savedCount++;
        saveNext(index + 1);
      } else {
        if (result.err && result.err.errMsg && result.err.errMsg.includes('auth deny')) {
          wx.hideLoading();
          wx.showModal({
            title: lang.t('confirm'),
            content: lang.t('hist_needAlbum'),
            confirmText: lang.t('confirm'),
            success: (res) => {
              if (res.confirm) {
                wx.openSetting();
              }
            }
          });
          return;
        }
        failCount++;
        saveNext(index + 1);
      }
    };

    saveNext(0);
  },

  // 批量删除
  batchDelete() {
    if (this.data.selectedCount === 0) {
      wx.showToast({ title: lang.t('hist_selectPhoto'), icon: 'none' });
      return;
    }

    const count = this.data.selectedCount;

    wx.showModal({
      title: lang.t('hist_confirmDeleteTitle'),
      content: lang.t('hist_confirmDeletePhotos') + count + lang.t('hist_confirmDeleteSuffix'),
      confirmColor: '#e74c3c',
      success: (res) => {
        if (res.confirm) {
          // 获取选中的ID列表
          const selectedIds = this.data.historyList
            .filter(item => item.selected)
            .map(item => item.id);

          // 从存储中删除
          let history = wx.getStorageSync('photoHistory') || [];
          history = history.filter(item => !selectedIds.includes(item.id));
          wx.setStorageSync('photoHistory', history);

          wx.showToast({ title: lang.t('hist_deleted'), icon: 'success' });

          // 退出选择模式并刷新列表
          this.setData({ selectMode: false });
          this.loadHistory();
        }
      }
    });
  },

  // ========== 照片详情弹窗 ==========
  // 显示照片详情弹窗
  showPhotoDetail(e) {
    if (this.data.selectMode) return;
    const id = e.currentTarget.dataset.id;
    const photo = this.data.historyList.find(item => item.id === id);
    if (photo) {
      // 处理 config 显示
      let configDisplay = this.formatConfigDisplay(photo.config);

      // 如果 config 为空，尝试从 photo 的其他字段构建基本配置
      if ((!configDisplay || configDisplay.length === 0) && photo.spec) {
        configDisplay = this.buildBasicConfigDisplay(photo);
      }

      // 确保 specDisplay 使用当前语言（因为用户可能在页面内切换了语言）
      const specDisplay = this.getLocalizedSpec(photo);
      this.setData({
        showPhotoDetailModal: true,
        currentDetailPhoto: { ...photo, configDisplay, specDisplay }
      });
    }
  },

  // 从 photo 的基本字段构建配置显示（用于旧数据兼容）
  buildBasicConfigDisplay(photo) {
    const currentLang = lang.getCurrentLang();
    const result = [];

    // 场景/类型
    if (photo.spec) {
      result.push({
        key: 'scene',
        label: currentLang === 'en' ? 'Scene' : '场景',
        value: this.getLocalizedSpec(photo)
      });
    }

    // 背景颜色
    if (photo.bgName) {
      const bgColorMap = {
        '白底': { cn: '白底', en: 'White' },
        '蓝底': { cn: '蓝底', en: 'Blue' },
        '红底': { cn: '红底', en: 'Red' },
        '灰底': { cn: '灰底', en: 'Gray' },
        'white': { cn: '白底', en: 'White' },
        'blue': { cn: '蓝底', en: 'Blue' },
        'red': { cn: '红底', en: 'Red' },
        'gray': { cn: '灰底', en: 'Gray' }
      };
      const bgTranslation = bgColorMap[photo.bgName];
      result.push({
        key: 'background',
        label: currentLang === 'en' ? 'Background' : '背景颜色',
        value: bgTranslation ? (currentLang === 'en' ? bgTranslation.en : bgTranslation.cn) : photo.bgName
      });
    }

    return result;
  },

  // 格式化配置显示
  formatConfigDisplay(config) {
    if (!config) return [];

    const currentLang = lang.getCurrentLang();

    // 步骤标题的本地翻译映射（后备方案）
    const stepTitleMap = {
      'spec': { cn: '照片规格', en: 'Photo Size' },
      'beauty': { cn: '美颜修饰', en: 'Beauty' },
      'clothing': { cn: '智能换装', en: 'Smart Outfit' },
      'gender': { cn: '性别', en: 'Gender' },
      'background': { cn: '背景颜色', en: 'Background' },
      'bg_color': { cn: '背景颜色', en: 'Background' },
      'bgColor': { cn: '背景颜色', en: 'Background' },
      'industry': { cn: '行业', en: 'Industry' },
      'profession': { cn: '职业', en: 'Profession' },
      'framing': { cn: '构图', en: 'Framing' },
      'posture': { cn: '姿势', en: 'Posture' }
    };

    // 选项值的本地翻译映射（后备方案）
    const optionLabelMap = {
      // 性别
      'male': { cn: '男士', en: 'Male' },
      'female': { cn: '女士', en: 'Female' },
      // 照片规格
      '1inch': { cn: '一寸', en: '1 inch' },
      '2inch': { cn: '二寸', en: '2 inch' },
      'small1inch': { cn: '小一寸', en: 'Small 1"' },
      'big1inch': { cn: '大一寸', en: 'Large 1"' },
      // 美颜
      'none': { cn: '原图直出', en: 'Original' },
      'natural': { cn: '自然美化', en: 'Natural' },
      'enhanced': { cn: '精致修图', en: 'Enhanced' },
      // 换装
      'no_change': { cn: '不换装', en: 'No change' },
      'suit_tie': { cn: '西装领带', en: 'Suit & Tie' },
      'suit': { cn: '西装', en: 'Suit' },
      'white_shirt': { cn: '白衬衫', en: 'White Shirt' },
      'v_neck': { cn: 'V领', en: 'V-Neck' },
      'round_neck': { cn: '圆领', en: 'Round Neck' },
      'shirt': { cn: '衬衫', en: 'Shirt' },
      // 背景颜色
      'white': { cn: '白底', en: 'White' },
      'blue': { cn: '蓝底', en: 'Blue' },
      'dark_blue': { cn: '深蓝', en: 'Dark Blue' },
      'red': { cn: '红底', en: 'Red' },
      'gray': { cn: '灰底', en: 'Gray' },
      'dark_gray': { cn: '深灰', en: 'Dark Gray' },
      'gradient': { cn: '渐变', en: 'Gradient' },
      'beige': { cn: '米色', en: 'Beige' },
      'light_green': { cn: '浅绿', en: 'Light Green' },
      'brown': { cn: '棕褐', en: 'Brown' },
      // 构图
      'closeup': { cn: '头肩特写', en: 'Close-up' },
      'halfbody': { cn: '标准半身', en: 'Half Body' },
      'threequarter': { cn: '四分三身', en: '3/4 Body' },
      'fullbody': { cn: '全身照', en: 'Full Body' }
    };

    // 根据当前语言获取步骤标题
    const getStepTitle = (key, value) => {
      // 优先使用保存的多语言字段（来自后台配置）
      if (typeof value === 'object') {
        if (currentLang === 'en' && value.stepTitle_en) {
          return value.stepTitle_en;
        } else if (value.stepTitle_cn) {
          return value.stepTitle_cn;
        } else if (value.stepTitle) {
          // 如果只有中文标题，尝试本地翻译
          const localTitle = stepTitleMap[key];
          if (localTitle) {
            return currentLang === 'en' ? localTitle.en : localTitle.cn;
          }
          return value.stepTitle;
        }
      }
      // 使用本地翻译映射
      const localTitle = stepTitleMap[key];
      if (localTitle) {
        return currentLang === 'en' ? localTitle.en : localTitle.cn;
      }
      return key;
    };

    // 根据当前语言获取选项显示值
    const getOptionLabel = (value) => {
      if (typeof value !== 'object') {
        // 旧数据格式，尝试本地翻译
        const localLabel = optionLabelMap[value];
        if (localLabel) {
          return currentLang === 'en' ? localLabel.en : localLabel.cn;
        }
        return value;
      }
      // 优先使用保存的多语言字段（来自后台配置）
      if (currentLang === 'en' && value.label_en) {
        return value.label_en;
      } else if (value.label_cn) {
        // 如果当前是英文但没有英文翻译，尝试本地翻译
        if (currentLang === 'en' && value.id) {
          const localLabel = optionLabelMap[value.id];
          if (localLabel) {
            return localLabel.en;
          }
        }
        return value.label_cn;
      } else if (value.label) {
        // 尝试本地翻译
        if (value.id) {
          const localLabel = optionLabelMap[value.id];
          if (localLabel) {
            return currentLang === 'en' ? localLabel.en : localLabel.cn;
          }
        }
        return value.label;
      }
      // 默认返回 id
      const localLabel = optionLabelMap[value.id];
      if (localLabel) {
        return currentLang === 'en' ? localLabel.en : localLabel.cn;
      }
      return value.id || '';
    };

    const result = [];
    for (const [key, value] of Object.entries(config)) {
      if (!value || key === 'upload') continue;

      const label = getStepTitle(key, value);
      const displayValue = getOptionLabel(value);

      result.push({ key, label, value: displayValue });
    }

    return result;
  },

  // 隐藏照片详情弹窗
  hidePhotoDetail() {
    this.setData({
      showPhotoDetailModal: false,
      currentDetailPhoto: null
    });
  },

  // 预览详情图片（放大查看）
  previewDetailImage() {
    const photo = this.data.currentDetailPhoto;
    if (!photo) return;
    const urls = this.data.historyList.map(item => item.resultImage);
    wx.previewImage({
      current: photo.resultImage,
      urls: urls
    });
  },

  // 详情弹窗 - 分享
  detailSharePhoto() {
    const photo = this.data.currentDetailPhoto;
    console.log('[分享] detailSharePhoto 被调用, photo:', photo ? { id: photo.id, resultImage: photo.resultImage } : null);
    if (!photo) return;
    this.hidePhotoDetail();
    // 保存到实例变量，避免 setData 异步问题
    this._shareItem = photo;
    // 复用原有的分享逻辑
    this.setData({
      showShareModal: true,
      shareItem: photo,
      posterImage: ''
    });
    console.log('[分享] setData 完成, _shareItem:', this._shareItem ? { id: this._shareItem.id } : null);
    this.generatePoster(photo);
  },

  // 详情弹窗 - 重制
  detailRegeneratePhoto() {
    const photo = this.data.currentDetailPhoto;
    if (!photo) return;
    this.hidePhotoDetail();
    // 复用原有的重制逻辑，模拟点击事件
    this.regeneratePhoto({ currentTarget: { dataset: { id: photo.id } } });
  },

  // 详情弹窗 - 保存
  detailSaveImage() {
    const photo = this.data.currentDetailPhoto;
    if (!photo) return;
    this.hidePhotoDetail();
    // 复用原有的保存逻辑
    this.doSaveImageByUrl(photo.resultImage);
  },

  // 详情弹窗 - 删除
  detailDeletePhoto() {
    const photo = this.data.currentDetailPhoto;
    if (!photo) return;

    wx.showModal({
      title: lang.t('hist_confirmDeleteTitle'),
      content: lang.t('hist_confirmDeleteOne'),
      success: (res) => {
        if (res.confirm) {
          this.hidePhotoDetail();
          let history = wx.getStorageSync('photoHistory') || [];
          history = history.filter(item => item.id !== photo.id);
          wx.setStorageSync('photoHistory', history);
          this.loadHistory();
          wx.showToast({ title: lang.t('hist_deleted'), icon: 'success' });
        }
      }
    });
  },

  // 通过URL保存图片（供详情弹窗使用）
  doSaveImageByUrl(url) {
    wx.showLoading({ title: lang.t('hist_saving') });

    if (url.startsWith('http://') || url.startsWith('https://')) {
      wx.downloadFile({
        url: url,
        success: (res) => {
          if (res.statusCode === 200) {
            this.doSaveImage(res.tempFilePath);
          } else {
            wx.hideLoading();
            wx.showToast({ title: lang.t('hist_saveFailed'), icon: 'none' });
          }
        },
        fail: () => {
          wx.hideLoading();
          wx.showToast({ title: lang.t('hist_saveFailed'), icon: 'none' });
        }
      });
    } else {
      this.doSaveImage(url);
    }
  },

  // ========== 其他功能 ==========
  // 预览图片
  previewImage(e) {
    if (this.data.selectMode) return;
    const url = e.currentTarget.dataset.url;
    const urls = this.data.historyList.map(item => item.resultImage);
    wx.previewImage({
      current: url,
      urls: urls
    });
  },

  // 保存图片
  saveImage(e) {
    const url = e.currentTarget.dataset.url;
    wx.showLoading({ title: lang.t('hist_saving') });

    // 判断是本地文件路径还是网络路径
    if (url.startsWith('http://') || url.startsWith('https://')) {
      // 网络图片，需要先下载
      wx.downloadFile({
        url: url,
        success: (res) => {
          this.doSaveImage(res.tempFilePath);
        },
        fail: () => {
          wx.hideLoading();
          wx.showToast({ title: lang.t('hist_saveFailed'), icon: 'none' });
        }
      });
    } else if (url.startsWith('data:')) {
      // base64图片，需要先保存为文件
      const base64Data = url.split(',')[1];
      const tempPath = `${wx.env.USER_DATA_PATH}/temp_save_${Date.now()}.png`;
      wx.getFileSystemManager().writeFile({
        filePath: tempPath,
        data: base64Data,
        encoding: 'base64',
        success: () => {
          this.doSaveImage(tempPath);
        },
        fail: () => {
          wx.hideLoading();
          wx.showToast({ title: lang.t('hist_saveFailed'), icon: 'none' });
        }
      });
    } else {
      // 本地文件路径，直接保存
      this.doSaveImage(url);
    }
  },

  // 执行保存到相册
  doSaveImage(filePath) {
    wx.saveImageToPhotosAlbum({
      filePath: filePath,
      success: () => {
        wx.hideLoading();
        wx.showToast({ title: lang.t('hist_savedToAlbum'), icon: 'success' });
      },
      fail: (err) => {
        wx.hideLoading();
        if (err.errMsg && err.errMsg.includes('auth deny')) {
          wx.showModal({
            title: lang.t('confirm'),
            content: lang.t('hist_needAlbum'),
            success: (res) => { if (res.confirm) wx.openSetting(); }
          });
        } else {
          wx.showToast({ title: lang.t('hist_saveFailed'), icon: 'none' });
        }
      }
    });
  },

  // 删除历史
  deleteHistory(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: lang.t('hist_confirmDeleteTitle'),
      content: lang.t('hist_confirmDeleteOne'),
      success: (res) => {
        if (res.confirm) {
          let history = wx.getStorageSync('photoHistory') || [];
          history = history.filter(item => item.id !== id);
          wx.setStorageSync('photoHistory', history);
          this.loadHistory();
          wx.showToast({ title: lang.t('hist_deleted'), icon: 'success' });
        }
      }
    });
  },

  // 清除所有失败任务
  clearFailedTasks() {
    const failedCount = this.data.statusCounts.failed;
    if (failedCount === 0) return;

    wx.showModal({
      title: lang.t('hist_clearFailedTitle'),
      content: lang.t('hist_clearFailedContent') + failedCount + lang.t('hist_clearFailedSuffix'),
      success: (res) => {
        if (res.confirm) {
          let history = wx.getStorageSync('photoHistory') || [];
          history = history.filter(item => item.status !== 'failed');
          wx.setStorageSync('photoHistory', history);
          this.loadHistory();
          wx.showToast({ title: lang.t('hist_cleared'), icon: 'success' });
        }
      }
    });
  },

  // 取消进行中的任务
  cancelPendingTask(e) {
    const id = e.currentTarget.dataset.id;

    wx.showModal({
      title: lang.t('hist_cancelTaskTitle') || '取消任务',
      content: lang.t('hist_cancelTaskContentWithWarning') || '确定要取消这个生成任务吗？\n\n注意：用户主动取消的任务，已消耗的醒币将不予退还。',
      confirmColor: '#e74c3c',
      success: (res) => {
        if (res.confirm) {
          let history = wx.getStorageSync('photoHistory') || [];
          history = history.filter(item => item.id !== id);
          wx.setStorageSync('photoHistory', history);
          this.loadHistory();
          wx.showToast({ title: lang.t('hist_taskCanceled') || '已取消', icon: 'success' });
        }
      }
    });
  },

  // 删除单个失败任务
  deleteFailedTask(e) {
    const id = e.currentTarget.dataset.id;
    let history = wx.getStorageSync('photoHistory') || [];
    history = history.filter(item => item.id !== id);
    wx.setStorageSync('photoHistory', history);
    this.loadHistory();
    wx.showToast({ title: lang.t('hist_deleted'), icon: 'success' });
  },

  // 重试失败任务
  retryFailedTask(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.allHistoryList.find(i => i.id === id && i.displayStatus === 'failed');

    if (!item) {
      wx.showToast({ title: lang.t('failed'), icon: 'none' });
      return;
    }

    // 检查原图是否存在
    const imageToUse = item.originalImage;
    const config = item.config || {};

    if (!imageToUse) {
      wx.showToast({ title: lang.t('hist_imageNotFound'), icon: 'none' });
      return;
    }

    // 根据是否系统错误显示不同的确认信息
    const isSystemError = item.isSystemError === true;
    const title = isSystemError
      ? (lang.t('hist_systemErrorRetryTitle') || '免费重新生成')
      : (lang.t('hist_retryTitle') || '重新生成');
    const content = isSystemError
      ? (lang.t('hist_systemErrorRetryConfirm') || '因系统原因生成失败，本次不消耗醒币，是否使用原图片和参数重新生成？')
      : (lang.t('hist_retryConfirm') || '是否使用原配置重新生成照片？');

    // 弹窗确认
    wx.showModal({
      title: title,
      content: content,
      confirmText: lang.t('confirm'),
      cancelText: lang.t('cancel'),
      success: (res) => {
        if (res.confirm) {
          this.doRetryFailedTask(id, item, imageToUse, config);
        }
      }
    });
  },

  // 执行失败任务重试
  doRetryFailedTask(id, item, imageToUse, config) {
    wx.showLoading({ title: lang.t('hist_retrying') || '重新生成中...' });

    // 尝试读取图片
    this.tryReadImage(imageToUse, null, (base64Data, usedImagePath) => {
      // 更新原记录状态为generating
      let history = wx.getStorageSync('photoHistory') || [];
      history = history.map(h => {
        if (h.id === id) {
          return {
            ...h,
            status: 'generating',
            progress: 0,
            failReason: '',
            isSystemError: false,  // 清除系统错误标记
            createTime: Date.now()  // 重置创建时间，避免立即超时
          };
        }
        return h;
      });
      wx.setStorageSync('photoHistory', history);
      this.loadHistory();

      wx.hideLoading();
      wx.showToast({ title: lang.t('hist_retryStarted') || '已开始重新生成', icon: 'success' });

      // 后台调用API生成，传入原始prompt
      this.callGenerateAPI(id, base64Data, config, item.prompt || '');
    }, () => {
      wx.hideLoading();
      wx.showToast({ title: lang.t('hist_imageNotFound'), icon: 'none' });
    });
  },

  // 跳转首页
  goToHome() {
    wx.switchTab({
      url: '/pages/index/index'
    });
  },

  // 重新生成照片（免费重拍）- 直接后台重新生成，使用原配置和原图
  regeneratePhoto(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.historyList.find(i => i.id === id);

    if (!item) {
      wx.showToast({ title: lang.t('failed'), icon: 'none' });
      return;
    }

    // 检查是否还有免费重拍次数（undefined视为有1次）
    const freeRetry = item.freeRetry === undefined ? 1 : item.freeRetry;
    if (freeRetry <= 0) {
      wx.showToast({ title: lang.t('hist_noRetryLeft'), icon: 'none' });
      return;
    }

    // 优先使用原图，如果原图不存在则使用结果图
    const imageToUse = item.originalImage || item.resultImage;
    const config = item.config || {};

    if (!imageToUse) {
      wx.showToast({ title: lang.t('failed'), icon: 'none' });
      return;
    }

    // 弹窗确认
    wx.showModal({
      title: lang.t('hist_freeRetryTitle'),
      content: lang.t('hist_freeRetryConfirm'),
      confirmText: lang.t('confirm'),
      cancelText: lang.t('cancel'),
      success: (res) => {
        if (res.confirm) {
          this.doRegenerate(id, item, imageToUse, config);
        }
      }
    });
  },

  // 执行重新生成
  doRegenerate(id, item, imageToUse, config) {
    wx.showLoading({ title: lang.t('hist_retrying') });

    // 尝试读取图片
    this.tryReadImage(imageToUse, item.resultImage, (base64Data, usedImagePath) => {
      // 扣减免费重拍次数（读取成功后才扣减）
      let history = wx.getStorageSync('photoHistory') || [];
      history = history.map(h => {
        if (h.id === id) {
          return { ...h, freeRetry: (h.freeRetry === undefined ? 1 : h.freeRetry) - 1 };
        }
        return h;
      });

      // 创建新的生成任务记录
      const now = Date.now();
      const newId = now.toString() + Math.random().toString(36).substr(2, 5);
      const newItem = {
        id: newId,
        createTime: now,
        status: 'generating',
        resultImage: '',
        originalImage: usedImagePath,
        spec: item.spec,
        bgName: item.bgName,
        progress: 0,
        config: { ...config },
        type: item.type || 'idphoto', // 保留照片类型（职业照/证件照）
        prompt: item.prompt || '',  // 继承原始prompt
        promptTemplate: item.promptTemplate || '',  // 继承prompt模板
        freeRetry: 0, // 重新生成的不再有免费次数
        isRemade: true // 标记这是重制生成的照片
      };

      // 添加到历史记录
      history = [newItem, ...history];
      wx.setStorageSync('photoHistory', history);
      this.loadHistory();

      wx.hideLoading();
      wx.showToast({ title: lang.t('hist_retrySuccess'), icon: 'success' });

      // 后台调用API生成，传入原始prompt
      this.callGenerateAPI(newId, base64Data, config, item.prompt || '');
    }, () => {
      wx.hideLoading();
      wx.showToast({ title: lang.t('hist_imageNotFound'), icon: 'none' });
    });
  },

  // 尝试读取图片，优先原图，失败则尝试结果图，支持本地和网络路径
  tryReadImage(primaryPath, fallbackPath, successCallback, failCallback) {
    // 使用cosUtil读取，支持本地和网络路径
    cosUtil.readImageAsBase64(primaryPath).then(base64Data => {
      successCallback(base64Data, primaryPath);
    }).catch(() => {
      // 原图读取失败，尝试读取结果图
      if (fallbackPath && fallbackPath !== primaryPath) {
        cosUtil.readImageAsBase64(fallbackPath).then(base64Data => {
          successCallback(base64Data, fallbackPath);
        }).catch(() => {
          failCallback();
        });
      } else {
        failCallback();
      }
    });
  },

  // 从config中提取实际值（兼容新旧格式）
  // 新格式: { id: 'male', label: '男', stepTitle: '性别' }
  // 旧格式: 'male'
  getConfigValue(configField) {
    if (!configField) return '';
    if (typeof configField === 'object' && configField.id !== undefined) {
      return configField.id;
    }
    return configField;
  },

  // 调用生成API
  async callGenerateAPI(historyId, base64Data, config, savedPrompt = '') {
    // 从历史记录获取类型信息和保存的prompt
    const history = wx.getStorageSync('photoHistory') || [];
    const historyItem = history.find(h => h.id === historyId);

    let prompt;

    // 使用保存的prompt（来自后台场景配置）
    if (savedPrompt) {
      prompt = savedPrompt;
    } else if (historyItem?.prompt) {
      prompt = historyItem.prompt;
    } else {
      // 无保存的prompt，无法重制
      this.updateHistoryStatus(historyId, 'failed', '', lang.t('hist_noPrompt') || '无法重制：缺少原始配置');
      return;
    }

    // 调试日志：输出重制时发送给AI的完整信息
    console.log('========== 重制图片请求调试 ==========');
    console.log('[重制请求] 历史记录ID:', historyId);
    console.log('[重制请求] 完整Prompt:');
    console.log(prompt);
    console.log('[重制请求] 图片大小:', base64Data ? Math.round(base64Data.length / 1024) + 'KB' : '无图片');
    console.log('[重制请求] 配置信息:', JSON.stringify(config));
    console.log('======================================');

    try {
      // 使用后端代理调用 AI API（避免前端暴露密钥）
      const result = await aiService.generateImage(prompt, base64Data, 'image/jpeg');

      if (result.imageData) {
        // 获取规格配置，进行裁剪后处理
        const spec = this.getConfigValue(config.spec) || '1inch';
        this.cropAndSaveImage(result.imageData, result.mimeType, spec, historyId);
      } else {
        this.updateHistoryStatus(historyId, 'failed', '', lang.t('fp_noImage'));
      }
    } catch (error) {
      // 静默处理
      // 网络超时等系统错误，标记为可免费重试
      const isSystemError = error.message.includes('网络') || error.message.includes('超时');
      this.updateHistoryStatus(historyId, 'failed', '', error.message || '生成失败', isSystemError);
    }
  },

  // 更新历史记录状态
  updateHistoryStatus(id, status, resultImage, failReason, isSystemError = false) {
    let history = wx.getStorageSync('photoHistory') || [];
    history = history.map(h => {
      if (h.id === id) {
        const updates = { status, progress: status === 'done' ? 100 : 0 };
        if (resultImage) updates.resultImage = resultImage;
        if (failReason) updates.failReason = failReason;
        if (status === 'failed') updates.isSystemError = isSystemError;
        return { ...h, ...updates };
      }
      return h;
    });
    wx.setStorageSync('photoHistory', history);
    this.loadHistory();

    if (status === 'done') {
      wx.showToast({ title: lang.t('allCompleted'), icon: 'success' });
    }
  },

  // 证件照规格配置
  getSpecConfig(spec) {
    const configs = {
      '1inch': { width: 295, height: 413, ratio: 1.4, name: '一寸' },
      '2inch': { width: 413, height: 579, ratio: 1.4, name: '二寸' },
      'small1inch': { width: 260, height: 378, ratio: 1.45, name: '小一寸' },
      'big1inch': { width: 390, height: 567, ratio: 1.45, name: '大一寸' }
    };
    return configs[spec] || configs['1inch'];
  },

  // 裁剪并保存图片
  cropAndSaveImage(base64Data, mimeType, spec, historyId) {
    const specConfig = this.getSpecConfig(spec);
    const targetRatio = specConfig.ratio;
    const tempPath = `${wx.env.USER_DATA_PATH}/temp_crop_${Date.now()}.png`;

    wx.getFileSystemManager().writeFile({
      filePath: tempPath,
      data: base64Data,
      encoding: 'base64',
      success: () => {
        wx.getImageInfo({
          src: tempPath,
          success: (imgInfo) => {
            const srcWidth = imgInfo.width;
            const srcHeight = imgInfo.height;
            const srcRatio = srcHeight / srcWidth;

            // 计算裁剪区域
            let cropX = 0, cropY = 0, cropWidth = srcWidth, cropHeight = srcHeight;
            if (srcRatio > targetRatio) {
              cropHeight = srcWidth * targetRatio;
              cropY = (srcHeight - cropHeight) / 2;
            } else if (srcRatio < targetRatio) {
              cropWidth = srcHeight / targetRatio;
              cropX = (srcWidth - cropWidth) / 2;
            }

            // 计算输出尺寸（保持高分辨率）
            const minOutputWidth = specConfig.width * 2;
            const minOutputHeight = specConfig.height * 2;
            const outputWidth = Math.min(Math.max(minOutputWidth, specConfig.width), Math.floor(cropWidth));
            const outputHeight = Math.min(Math.max(minOutputHeight, specConfig.height), Math.floor(cropHeight));

            // 使用canvas裁剪
            const canvas = wx.createOffscreenCanvas({
              type: '2d',
              width: outputWidth,
              height: outputHeight
            });
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            const image = canvas.createImage();
            image.onload = () => {
              ctx.drawImage(image, cropX, cropY, cropWidth, cropHeight, 0, 0, outputWidth, outputHeight);

              // 应用锐化
              this.applySharpen(ctx, outputWidth, outputHeight, 0.3);

              // 导出并保存
              wx.canvasToTempFilePath({
                canvas: canvas,
                fileType: 'png',
                quality: 1,
                success: (res) => {
                  wx.getFileSystemManager().readFile({
                    filePath: res.tempFilePath,
                    encoding: 'base64',
                    success: (readRes) => {
                      wx.getFileSystemManager().unlink({ filePath: tempPath });
                      // 保存裁剪后的图片
                      this.saveProcessedImage(readRes.data, mimeType, historyId);
                    },
                    fail: () => {
                      wx.getFileSystemManager().unlink({ filePath: tempPath });
                      this.saveProcessedImage(base64Data, mimeType, historyId);
                    }
                  });
                },
                fail: () => {
                  wx.getFileSystemManager().unlink({ filePath: tempPath });
                  this.saveProcessedImage(base64Data, mimeType, historyId);
                }
              });
            };
            image.onerror = () => {
              wx.getFileSystemManager().unlink({ filePath: tempPath });
              this.saveProcessedImage(base64Data, mimeType, historyId);
            };
            image.src = tempPath;
          },
          fail: () => {
            wx.getFileSystemManager().unlink({ filePath: tempPath });
            this.saveProcessedImage(base64Data, mimeType, historyId);
          }
        });
      },
      fail: () => {
        this.saveProcessedImage(base64Data, mimeType, historyId);
      }
    });
  },

  // 保存处理后的图片
  saveProcessedImage(base64Data, mimeType, historyId) {
    cosUtil.saveImageToCOS(base64Data, 'output').then(result => {
      this.updateHistoryStatus(historyId, 'done', result.url);
    }).catch(() => {
      cosUtil.saveImage(base64Data, 'output').then(result => {
        this.updateHistoryStatus(historyId, 'done', result.localPath);
      }).catch(() => {
        const ext = mimeType.includes('png') ? 'png' : 'jpg';
        const filePath = `${wx.env.USER_DATA_PATH}/result_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`;
        wx.getFileSystemManager().writeFile({
          filePath,
          data: base64Data,
          encoding: 'base64',
          success: () => {
            this.updateHistoryStatus(historyId, 'done', filePath);
          },
          fail: () => {
            this.updateHistoryStatus(historyId, 'failed', '', lang.t('hist_saveFailed'));
          }
        });
      });
    });
  },

  // 应用锐化滤镜
  applySharpen(ctx, width, height, strength = 0.3) {
    try {
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      const copy = new Uint8ClampedArray(data);

      const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
      const adjustedKernel = kernel.map((v, i) => i === 4 ? 1 + (v - 1) * strength : v * strength);

      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          for (let c = 0; c < 3; c++) {
            let sum = 0;
            for (let ky = -1; ky <= 1; ky++) {
              for (let kx = -1; kx <= 1; kx++) {
                const idx = ((y + ky) * width + (x + kx)) * 4 + c;
                sum += copy[idx] * adjustedKernel[(ky + 1) * 3 + (kx + 1)];
              }
            }
            const idx = (y * width + x) * 4 + c;
            data[idx] = Math.min(255, Math.max(0, sum));
          }
        }
      }
      ctx.putImageData(imageData, 0, 0);
    } catch (err) {
      // 静默处理
    }
  },

  // 跳转邀请页面
  goToInvite() {
    wx.navigateTo({
      url: '/pages/invite/invite'
    });
  },

  // ========== 分享功能 ==========
  // 点击分享按钮
  sharePhoto(e) {
    const id = e.currentTarget.dataset.id;
    const url = e.currentTarget.dataset.url;
    const item = this.data.historyList.find(i => i.id === id);

    // 埋点：分享照片
    tracker.trackClick('share_photo', 'button', '分享', { photoId: id });

    if (!item) {
      wx.showToast({ title: lang.t('failed'), icon: 'none' });
      return;
    }

    // 保存到实例变量，避免 setData 异步问题
    this._shareItem = item;
    this.setData({
      showShareModal: true,
      shareItem: item,
      posterImage: ''
    });

    // 生成海报
    this.generatePoster(item);
  },

  // 隐藏分享弹窗
  hideShareModal() {
    console.log('[分享] hideShareModal 被调用, 当前 _shareItem:', this._shareItem ? { id: this._shareItem.id } : null);
    // 保存 posterImage 到实例变量，供 onShareAppMessage 使用
    this._posterImage = this.data.posterImage;
    // 延迟清除，确保 onShareAppMessage 能获取到数据
    const that = this;
    setTimeout(() => {
      that._shareItem = null;
      that._posterImage = null;
      console.log('[分享] _shareItem 和 _posterImage 已清除');
    }, 500);
    this.setData({ showShareModal: false, shareItem: null, posterImage: '' });
  },

  // 生成分享海报（带二维码）- 使用 Canvas 2D API
  generatePoster(item) {
    const that = this;
    const query = wx.createSelectorQuery().in(this);

    query.select('#posterCanvas').fields({ node: true, size: true }).exec((res) => {
      if (!res[0] || !res[0].node) {
        wx.showToast({ title: lang.t('failed'), icon: 'none' });
        return;
      }

      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      const dpr = wx.getWindowInfo().pixelRatio || 2;
      const canvasWidth = 270;
      const canvasHeight = 330;

      canvas.width = canvasWidth * dpr;
      canvas.height = canvasHeight * dpr;
      ctx.scale(dpr, dpr);

      // 加载图片的辅助函数
      const loadImage = (src) => {
        return new Promise((resolve, reject) => {
          const img = canvas.createImage();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = src;
        });
      };

      // 并行加载二维码和照片
      Promise.all([
        loadImage(imageConfig.images.scanCode).catch(() => null),
        loadImage(item.resultImage)
      ]).then(([qrImg, photoImg]) => {
        // 绘制白色背景
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // 顶部渐变条
        const headerGradient = ctx.createLinearGradient(0, 0, canvasWidth, 0);
        headerGradient.addColorStop(0, '#F5D0A9');
        headerGradient.addColorStop(1, '#E8B686');
        ctx.fillStyle = headerGradient;
        ctx.fillRect(0, 0, canvasWidth, 36);

        // 绘制App名称
        ctx.fillStyle = '#ffffff';
        ctx.font = '15px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(lang.t('appName'), canvasWidth / 2, 24);

        // 计算照片绘制区域
        const photoWidth = 110;
        const photoHeight = 138;
        const photoX = (canvasWidth - photoWidth) / 2;
        const photoY = 50;

        // 绘制照片阴影效果
        ctx.fillStyle = '#f5f0eb';
        ctx.fillRect(photoX - 4, photoY - 4, photoWidth + 8, photoHeight + 8);
        ctx.fillStyle = '#faf7f4';
        ctx.fillRect(photoX - 2, photoY - 2, photoWidth + 4, photoHeight + 4);

        // 绘制照片
        if (photoImg) {
          ctx.drawImage(photoImg, photoX, photoY, photoWidth, photoHeight);
        }

        // 绘制规格说明
        ctx.fillStyle = '#333333';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(item.specDisplay || lang.t('hist_idPhoto'), canvasWidth / 2, photoY + photoHeight + 18);

        // 绘制分享文案
        ctx.fillStyle = '#888888';
        ctx.font = '10px sans-serif';
        ctx.fillText(lang.t('hist_posterDesc') || '专业AI证件照，一键生成', canvasWidth / 2, photoY + photoHeight + 34);

        // 底部分割线
        ctx.strokeStyle = '#f0ebe6';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(20, photoY + photoHeight + 48);
        ctx.lineTo(canvasWidth - 20, photoY + photoHeight + 48);
        ctx.stroke();

        // 底部区域
        const qrSize = 52;
        const bottomY = photoY + photoHeight + 58;
        const qrX = 25;

        // 绘制二维码
        if (qrImg) {
          ctx.drawImage(qrImg, qrX, bottomY, qrSize, qrSize);
        } else {
          that.drawQRCodePlaceholder2D(ctx, qrX, bottomY, qrSize);
        }

        // 右侧提示文字
        ctx.fillStyle = '#333333';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(lang.t('hist_posterTip') || '长按识别小程序码', qrX + qrSize + 12, bottomY + 20);

        ctx.fillStyle = '#E8B686';
        ctx.font = '10px sans-serif';
        ctx.fillText(lang.t('hist_tryNow') || '立即体验', qrX + qrSize + 12, bottomY + 38);

        // 导出图片
        wx.canvasToTempFilePath({
          canvas: canvas,
          success: (res) => {
            that.setData({ posterImage: res.tempFilePath });
          },
          fail: () => {
            wx.showToast({ title: lang.t('failed'), icon: 'none' });
          }
        });
      }).catch(() => {
        wx.showToast({ title: lang.t('hist_imageNotFound'), icon: 'none' });
      });
    });
  },

  // Canvas 2D 版本的二维码占位图
  drawQRCodePlaceholder2D(ctx, x, y, size) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = '#667eea';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, size, size);

    const cornerSize = 14;
    const innerSize = 8;
    const innerOffset = 3;

    // 左上角
    ctx.fillStyle = '#667eea';
    ctx.fillRect(x + 4, y + 4, cornerSize, cornerSize);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 4 + innerOffset, y + 4 + innerOffset, innerSize, innerSize);
    ctx.fillStyle = '#667eea';
    ctx.fillRect(x + 4 + innerOffset + 2, y + 4 + innerOffset + 2, innerSize - 4, innerSize - 4);

    // 右上角
    ctx.fillStyle = '#667eea';
    ctx.fillRect(x + size - cornerSize - 4, y + 4, cornerSize, cornerSize);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + size - cornerSize - 4 + innerOffset, y + 4 + innerOffset, innerSize, innerSize);
    ctx.fillStyle = '#667eea';
    ctx.fillRect(x + size - cornerSize - 4 + innerOffset + 2, y + 4 + innerOffset + 2, innerSize - 4, innerSize - 4);

    // 左下角
    ctx.fillStyle = '#667eea';
    ctx.fillRect(x + 4, y + size - cornerSize - 4, cornerSize, cornerSize);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 4 + innerOffset, y + size - cornerSize - 4 + innerOffset, innerSize, innerSize);
    ctx.fillStyle = '#667eea';
    ctx.fillRect(x + 4 + innerOffset + 2, y + size - cornerSize - 4 + innerOffset + 2, innerSize - 4, innerSize - 4);

    // 中间圆形
    const centerX = x + size / 2;
    const centerY = y + size / 2;
    ctx.fillStyle = '#667eea';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 8, 0, 2 * Math.PI);
    ctx.fill();
  },

  // 保存海报到相册
  savePoster() {
    if (!this.data.posterImage) {
      wx.showToast({ title: lang.t('loading'), icon: 'none' });
      return;
    }

    wx.saveImageToPhotosAlbum({
      filePath: this.data.posterImage,
      success: () => {
        wx.showToast({ title: lang.t('hist_savedToAlbum'), icon: 'success' });
        // 保存海报也算分享，发放优惠券
        this.grantShareCoupon();
      },
      fail: (err) => {
        if (err.errMsg && err.errMsg.includes('auth deny')) {
          wx.showModal({
            title: lang.t('confirm'),
            content: lang.t('hist_needAlbum'),
            success: (res) => { if (res.confirm) wx.openSetting(); }
          });
        } else {
          wx.showToast({ title: lang.t('hist_saveFailed'), icon: 'none' });
        }
      }
    });
  },

  // 发放分享奖励（醒币）
  async grantShareCoupon() {
    // 优先使用实例变量（因为 hideShareModal 可能已清除 data.shareItem）
    const item = this._shareItem || this.data.shareItem;
    console.log('[分享奖励] grantShareCoupon 被调用, item:', item ? { id: item.id, isRemake: item.isRemake, hasShared: item.hasShared } : null);
    if (!item) {
      console.log('[分享奖励] item 为空，跳过');
      return;
    }

    // 重制的照片不发放分享奖励
    if (item.isRemake) {
      return;
    }

    const userId = wx.getStorageSync('userId');
    if (!userId) {
      return;
    }

    try {
      // 调用服务端 API 发放分享奖励
      // 注意：数据库中的类型是 share_photo
      const res = await api.grantPoints(userId, 'share_photo', item.id);
      console.log('[分享奖励] API 响应:', res);

      if (res.code === 200 && res.data) {
        // 检查是否已领取过
        if (res.data.alreadyGranted) {
          console.log('[分享奖励] 已领取过，跳过');
          return;
        }

        console.log('[分享奖励] 发放成功，积分:', res.data.points);

        // 标记本地已分享（避免重复提示）
        let history = wx.getStorageSync('photoHistory') || [];
        history = history.map(h => {
          if (h.id === item.id) {
            return { ...h, hasShared: true };
          }
          return h;
        });
        wx.setStorageSync('photoHistory', history);

        // 更新当前列表中的状态
        const historyList = this.data.historyList.map(h => {
          if (h.id === item.id) {
            return { ...h, hasShared: true };
          }
          return h;
        });
        this.setData({
          historyList,
          shareItem: { ...item, hasShared: true }
        });

        // 更新详情页的状态（红点消失）
        if (this.data.currentDetailPhoto && this.data.currentDetailPhoto.id === item.id) {
          this.setData({
            currentDetailPhoto: { ...this.data.currentDetailPhoto, hasShared: true }
          });
        }

        // 显示获得醒币提示
        wx.showModal({
          title: lang.t('hist_pointsGrantedTitle') || '恭喜获得醒币',
          content: (lang.t('hist_pointsGrantedContent') || '您已获得{points}醒币奖励').replace('{points}', res.data.points),
          showCancel: false,
          confirmText: lang.t('confirm')
        });
      }
    } catch (error) {
      console.error('[分享奖励] 发放失败:', error);
      // 静默处理
    }
  },

  // 分享给好友
  onShareAppMessage(e) {
    const userId = wx.getStorageSync('userId') || '';
    console.log('[分享] onShareAppMessage 触发, from:', e.from);

    // 默认分享封面（确保使用存在的图片）
    const defaultShareImage = imageConfig.images.shareCover || imageConfig.images.logo;

    // 如果是从分享弹窗点击分享按钮
    if (e.from === 'button' && e.target && e.target.dataset && e.target.dataset.shareType === 'poster') {
      // 使用实例变量获取分享数据（避免 setData 异步问题）
      const item = this._shareItem || this.data.shareItem;
      // 优先使用实例变量（因为 hideShareModal 可能已清除 data.posterImage）
      const posterImage = this._posterImage || this.data.posterImage;
      console.log('[分享] shareItem:', item ? { id: item.id, resultImage: item.resultImage } : null);
      console.log('[分享] posterImage:', posterImage);

      if (item) {
        // 分享成功后发放优惠券
        this.grantShareCoupon();

        // 确定分享图片：优先使用生成的海报，其次使用结果图片，最后使用默认封面
        let shareImage = defaultShareImage;
        if (posterImage) {
          // 优先使用生成的海报图片
          shareImage = posterImage;
          console.log('[分享] 使用海报图片:', shareImage);
        } else if (item.resultImage && (item.resultImage.startsWith('http://') || item.resultImage.startsWith('https://'))) {
          // 海报未生成时，使用结果图片
          shareImage = item.resultImage;
          console.log('[分享] 使用结果图片:', shareImage);
        } else {
          console.log('[分享] 使用默认封面:', shareImage);
        }

        return {
          title: lang.t('hist_posterShareTitle') || '我用醒美闪图制作了一张证件照，效果太棒了！',
          path: `/pages/index/index?inviter=${userId}`,
          imageUrl: shareImage
        };
      }
    }

    // 默认分享
    console.log('[分享] 使用默认分享, 图片:', defaultShareImage);
    return {
      title: lang.t('historyShareTitle') || '醒美闪图 - AI证件照',
      path: `/pages/index/index?inviter=${userId}`,
      imageUrl: defaultShareImage
    };
  }
});