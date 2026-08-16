// Đích điều hướng + tiêu đề trang — MỘT bảng cho cả ba chỗ vẽ khung app: rail trái
// (desktop), thanh tab dưới (mobile), và tiêu đề màn trên top bar.
//
// Tách khỏi AppLayout vì từ bản 1a có ba chỗ đọc thay vì một. Ba bản chép tay của cùng
// danh sách này là cách chắc chắn nhất để rail và thanh tab lệch nhau sau vài lượt sửa.
import { ChartColumn, LayoutDashboard, NotebookText, Settings, Target, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  Icon: LucideIcon
  /** Hiện ở thanh tab dưới (mobile). Rail desktop luôn hiện đủ. */
  onMobile: boolean
}

// Icon theo §2.7 của bản 1a. `ChartColumn` CHÍNH LÀ `BarChart3` mà tài liệu gọi tên —
// lucide v1 đổi tên, cả hai còn xuất ra được, dùng tên mới cho khỏi lệ thuộc alias cũ.
//
// Sáu mục kể từ PR 4: Bản tin chiếm `/`, Sổ dời sang `/so`.
//
// `onMobile: false` cho Cài đặt là quyết định của bản vẽ 17a: thanh tab mobile của 1a có
// BỐN tab + nút "+", không phải sáu. Sáu tab ở 320px thì mỗi ô còn ~43px, hẹp hơn chữ
// "Ngân sách" — nhãn bị cắt là mất luôn thứ duy nhất phân biệt các tab. Cài đặt là màn
// vào theo CHỦ ĐÍCH (vài lần một tháng), không phải màn liếc hằng ngày, nên nó là mục
// đúng để nhường chỗ; đường vào mobile của nó là nút bánh răng ở đầu Bản tin.
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Bản tin', Icon: LayoutDashboard, onMobile: true },
  { to: '/so', label: 'Sổ', Icon: NotebookText, onMobile: true },
  { to: '/budget', label: 'Ngân sách', Icon: Target, onMobile: true },
  { to: '/assets', label: 'Tài sản', Icon: Wallet, onMobile: true },
  { to: '/reports', label: 'Báo cáo', Icon: ChartColumn, onMobile: true },
  { to: '/settings', label: 'Cài đặt', Icon: Settings, onMobile: false },
]

// Tiêu đề tab trình duyệt VÀ tiêu đề màn trên top bar. Không đổi thì bookmark, lịch sử
// và hai tab mở cạnh nhau đều là "Sổ Gạo" — không phân biệt được đang ở đâu. Tiền tố
// khớp cả trang con (/settings/accounts → "Cài đặt").
const PAGE_TITLES: [prefix: string, title: string][] = [
  ['/so', 'Sổ'],
  ['/entry', 'Nhập giao dịch'],
  ['/search', 'Tìm kiếm'],
  ['/debts', 'Nợ / cho vay'],
  ['/recurring', 'Giao dịch định kỳ'],
  ['/planned', 'Sắp chi'],
  ['/invest', 'Đầu tư'],
  ['/budget', 'Ngân sách'],
  ['/assets', 'Tài sản'],
  ['/reports', 'Báo cáo'],
  ['/settings', 'Cài đặt'],
]

/** Tiêu đề màn cho `pathname`; null ở trang gốc (giữ nguyên tên app trên tab trình duyệt). */
export function pageTitle(pathname: string): string | null {
  const hit = PAGE_TITLES.find((p) => pathname === p[0] || pathname.startsWith(`${p[0]}/`))
  return hit ? hit[1] : null
}

/**
 * Tiêu đề cho top bar. Khác `pageTitle` đúng ở trang gốc: tab trình duyệt để "Sổ Gạo"
 * (tên app, đúng cho một bookmark), còn top bar phải trả lời "đang ở màn nào" — mà ở
 * `/` màn đó tên là "Sổ". Lấy thẳng nhãn của rail để hai chỗ không bao giờ gọi khác tên.
 */
export function topBarTitle(pathname: string): string {
  return pageTitle(pathname) ?? NAV_ITEMS.find((i) => i.to === pathname)?.label ?? 'Sổ Gạo'
}

// Những màn ĐỌC kỳ đang xem. Bộ đổi tháng trên top bar chỉ hiện ở đây — hiện ở màn
// không dùng tháng thì nó là cái nút bấm vào không có gì đổi, tệ hơn hẳn không có nút.
const MONTH_ROUTES = ['/', '/so', '/budget', '/reports']

export function usesMonth(pathname: string): boolean {
  return MONTH_ROUTES.includes(pathname)
}
