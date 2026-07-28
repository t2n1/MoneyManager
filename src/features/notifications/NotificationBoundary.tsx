import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Chuông hỏng thì ẩn chuông đi, phần còn lại của app chạy bình thường (mục H spec).
 * Cùng tinh thần với `.catch(() => {})` của khối chạy bù định kỳ ở AppLayout.
 */
export class NotificationBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Thông báo lỗi, đã ẩn chuông:', error, info.componentStack)
  }

  render() {
    if (this.state.failed) return null
    return this.props.children
  }
}
