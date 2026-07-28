import { useNotifications } from './useNotifications'

/** Số việc-cần-làm chưa đọc — cho chấm đỏ trên tab "Sổ GD". */
export function useUnreadCount(): number {
  return useNotifications().unreadCount
}
