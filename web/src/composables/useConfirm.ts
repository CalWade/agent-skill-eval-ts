/**
 * useConfirm
 *
 * 全局确认弹窗的驱动层。
 * ConfirmDialog.vue 挂载后注册自身，useConfirm() 调用时驱动它显示。
 *
 * 用法：
 *   const confirm = useConfirm()
 *   await confirm({ title: '删除用例', message: '确认删除「xxx」？', confirmText: '删除' })
 */

import { ref } from 'vue'

export interface ConfirmOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
}

type Resolver = (confirmed: boolean) => void

// 单例状态，ConfirmDialog.vue 读取并响应
export const _confirmState = ref<{
  visible: boolean
  options: ConfirmOptions
  resolve: Resolver
} | null>(null)

export function useConfirm() {
  return function confirm(options: ConfirmOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      _confirmState.value = {
        visible: true,
        options,
        resolve: (confirmed: boolean) => {
          _confirmState.value = null
          confirmed ? resolve() : reject()
        },
      }
    })
  }
}
