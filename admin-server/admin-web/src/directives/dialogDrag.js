/**
 * el-dialog 拖动指令
 * 使用方式：在 el-dialog 上添加 v-dialog-drag
 * <el-dialog v-dialog-drag ...>
 */

export const dialogDrag = {
  mounted(el) {
    // Element Plus 的 dialog 会 teleport 到 body
    // 需要监听 body 来找到真正的 dialog

    const setupDrag = (dialog) => {
      const dialogHeader = dialog.querySelector('.el-dialog__header')

      if (!dialogHeader || dialogHeader._dragSetup) return

      dialogHeader._dragSetup = true
      dialogHeader.style.cursor = 'move'
      dialogHeader.style.userSelect = 'none'

      let isDragging = false
      let startX = 0
      let startY = 0
      let dialogLeft = 0
      let dialogTop = 0

      const onMouseDown = (e) => {
        if (e.button !== 0) return
        if (e.target.closest('.el-dialog__headerbtn')) return

        e.preventDefault()
        isDragging = true
        startX = e.clientX
        startY = e.clientY

        // 获取当前 transform
        const style = window.getComputedStyle(dialog)
        const transform = style.transform

        if (transform && transform !== 'none') {
          const matrix = transform.match(/matrix\(([^)]+)\)/)
          if (matrix) {
            const values = matrix[1].split(',').map(v => parseFloat(v.trim()))
            dialogLeft = values[4] || 0
            dialogTop = values[5] || 0
          }
        } else {
          dialogLeft = 0
          dialogTop = 0
        }

        document.addEventListener('mousemove', onMouseMove)
        document.addEventListener('mouseup', onMouseUp)
        dialog.style.transition = 'none'
      }

      const onMouseMove = (e) => {
        if (!isDragging) return

        const deltaX = e.clientX - startX
        const deltaY = e.clientY - startY

        const newLeft = dialogLeft + deltaX
        const newTop = dialogTop + deltaY

        dialog.style.transform = `translate(${newLeft}px, ${newTop}px)`
      }

      const onMouseUp = () => {
        isDragging = false
        dialog.style.transition = ''

        const style = window.getComputedStyle(dialog)
        const transform = style.transform
        if (transform && transform !== 'none') {
          const matrix = transform.match(/matrix\(([^)]+)\)/)
          if (matrix) {
            const values = matrix[1].split(',').map(v => parseFloat(v.trim()))
            dialogLeft = values[4] || 0
            dialogTop = values[5] || 0
          }
        }

        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }

      dialogHeader.addEventListener('mousedown', onMouseDown)

      return () => {
        dialogHeader.removeEventListener('mousedown', onMouseDown)
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }
    }

    // 监听 body 上新增的 dialog overlay
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) {
            // 查找 el-overlay 下的 el-dialog
            if (node.classList?.contains('el-overlay')) {
              const dialog = node.querySelector('.el-dialog')
              if (dialog && !dialog._dragCleanup) {
                dialog._dragCleanup = setupDrag(dialog)
              }
            }
            // 或者直接是 dialog wrapper
            const dialog = node.querySelector?.('.el-dialog')
            if (dialog && !dialog._dragCleanup) {
              dialog._dragCleanup = setupDrag(dialog)
            }
          }
        }
      }
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true
    })

    el._dragObserver = observer

    // 立即检查已存在的 dialog
    setTimeout(() => {
      document.querySelectorAll('.el-dialog').forEach(dialog => {
        if (!dialog._dragCleanup) {
          dialog._dragCleanup = setupDrag(dialog)
        }
      })
    }, 100)
  },

  unmounted(el) {
    if (el._dragObserver) {
      el._dragObserver.disconnect()
      delete el._dragObserver
    }
  }
}

export default dialogDrag
