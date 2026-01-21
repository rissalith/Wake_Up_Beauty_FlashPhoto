/**
 * 全局 el-dialog 拖动功能
 * 自动为所有 el-dialog 添加拖动支持
 */

export function setupDialogDrag() {
  // 拖动状态
  let isDragging = false
  let currentDialog = null
  let startX = 0
  let startY = 0
  let initialX = 0
  let initialY = 0

  // 鼠标按下
  document.addEventListener('mousedown', (e) => {
    // 检查是否点击在 dialog header 上
    const header = e.target.closest('.el-dialog__header')
    if (!header) return

    // 排除关闭按钮
    if (e.target.closest('.el-dialog__headerbtn')) return

    // 找到对应的 dialog
    const dialog = header.closest('.el-dialog')
    if (!dialog) return

    e.preventDefault()
    isDragging = true
    currentDialog = dialog
    startX = e.clientX
    startY = e.clientY

    // 获取当前位置
    const transform = window.getComputedStyle(dialog).transform
    if (transform && transform !== 'none') {
      const matrix = new DOMMatrix(transform)
      initialX = matrix.m41
      initialY = matrix.m42
    } else {
      initialX = 0
      initialY = 0
    }

    // 设置拖动时的样式
    dialog.style.transition = 'none'
    header.style.cursor = 'grabbing'
  })

  // 鼠标移动
  document.addEventListener('mousemove', (e) => {
    if (!isDragging || !currentDialog) return

    const dx = e.clientX - startX
    const dy = e.clientY - startY

    currentDialog.style.transform = `translate(${initialX + dx}px, ${initialY + dy}px)`
  })

  // 鼠标释放
  document.addEventListener('mouseup', () => {
    if (!isDragging || !currentDialog) return

    const header = currentDialog.querySelector('.el-dialog__header')
    if (header) {
      header.style.cursor = 'move'
    }

    currentDialog.style.transition = ''
    isDragging = false
    currentDialog = null
  })

  // 添加全局样式
  const style = document.createElement('style')
  style.textContent = `
    .el-dialog__header {
      cursor: move;
      user-select: none;
    }
  `
  document.head.appendChild(style)
}

export default setupDialogDrag
