// Hai luật về ĐỘ TIN CẬY CỦA CHÍNH DỮ LIỆU (§4.9 của bản redesign 1a), khác hẳn sáu
// nhóm luật đã có: chúng không nói về tiền, chúng nói về việc app đang đo bằng một cái
// thước bị thiếu vạch.
//
//   · Giao dịch chưa gắn danh mục → mọi báo cáo và ngân sách đang tính thiếu.
//   · Tài khoản quá 30 ngày chưa đối chiếu → số dư trên màn có thể đã lệch số dư thật.
//
// THUẦN như mọi file trong rules/: không React, không window, không Date.now(). Ngày
// hôm nay đến từ `input.todayISO`. `tests/…/purity.test.ts` canh ràng buộc này theo cả
// đồ thị import, nên đừng import gì từ lib/money hay assets/aggregate ở đây.
import { addDaysISO } from '../../../lib/dates'
import { lastReconciledMap } from '../reconciledAt'
import type { AppNotification, NotificationInput } from '../types'

/** Bao nhiêu ngày không đối chiếu thì coi là cũ (§4.4 và §4.9 cùng dùng con số này). */
export const RECONCILE_STALE_DAYS = 30

/**
 * Dưới ngưỡng này thì im.
 *
 * Cùng tinh thần với ngưỡng chống nhiễu sẵn có của budgetRules ("mục vặt dưới 5% tổng
 * ngân sách không báo"): một hai khoản chưa gắn danh mục là chuyện của mọi tháng, báo
 * lên là khối Việc cần làm lúc nào cũng có một dòng và người ta thôi đọc nó.
 */
export const UNCATEGORIZED_MIN = 3

/**
 * Giao dịch chưa gắn danh mục — MỘT dòng gộp cho tất cả.
 *
 * Chuyển khoản không tính: nó không bao giờ có danh mục, đếm vào là dựng ra một danh
 * sách việc không thể làm xong. Cùng định nghĩa với `needsCategory` ở Sổ và với bảng
 * `uncategorized.ts` bên Báo cáo — ba chỗ trả lời cùng một câu hỏi thì phải cùng một
 * luật, không thì hai màn hiện hai con số.
 */
export function uncategorizedRule(input: NotificationInput): AppNotification[] {
  const chua = input.recentTxs.filter(
    (t) => t.category_id == null && t.type !== 'transfer' && !t.exclude_from_stats,
  )
  if (chua.length < UNCATEGORIZED_MIN) return []
  return [
    {
      // Mã KHÔNG chứa số lượng: thêm một khoản chưa phân loại nữa mà mã đổi thì việc
      // này "mới" trở lại và trạng thái đã ẩn mất tác dụng. Một tình huống, một mã.
      key: 'data-uncategorized:all',
      kind: 'action',
      type: 'data-uncategorized',
      severity: 'medium',
      title: `${chua.length} giao dịch chưa gắn danh mục`,
      detail: 'Báo cáo và ngân sách đang tính thiếu chỗ này.',
      to: '/so',
    },
  ]
}

/**
 * Tài khoản quá `RECONCILE_STALE_DAYS` ngày chưa đối chiếu — gộp MỌI tài khoản vào một
 * việc (§4.9 ghi rõ "gộp mọi tài khoản vào một việc").
 *
 * "Lần đối chiếu gần nhất" đến từ `lastReconciledMap`: cột `accounts.last_reconciled_at`
 * (sheet Đối chiếu ghi mỗi lần bấm, KỂ CẢ khi số dư đã khớp) hoặc giao dịch bù trong
 * danh mục "Điều chỉnh số dư" cho dữ liệu trước migration 0050 — lấy cái muộn hơn.
 *
 * Trước 0050 luật này chỉ có nguồn thứ hai, và nó bỏ sót đúng người ghi chép cẩn thận:
 * mở sheet, thấy khớp, không sinh giao dịch nào → luật vẫn kêu "chưa đối chiếu".
 *
 * Hệ quả phải biết: cửa sổ `recentTxs` chỉ có RECENT_TXS_DAYS ngày. Tài khoản đối chiếu
 * lần cuối từ trước cửa sổ đó, mà cột còn null (dữ liệu cũ), trông y như chưa đối chiếu
 * bao giờ — và đó là kết luận ĐÚNG cho mục đích ở đây (cả hai đều quá 30 ngày). Cột thì
 * không bị cửa sổ cắt, nên từ 0050 trở đi mốc luôn đọc được dù cũ tới đâu.
 *
 * Chỉ xét tài khoản CÓ SỐ DƯ THEO DÕI được: tài khoản ẩn hoặc không tính vào tổng thì
 * lệch số dư cũng không ảnh hưởng con số nào trên màn.
 */
export function reconcileStaleRule(input: NotificationInput): AppNotification[] {
  const cutoff = addDaysISO(input.todayISO, -RECONCILE_STALE_DAYS)
  const lanCuoi = lastReconciledMap(input.accounts, input.recentTxs, input.categories)

  const cu = input.accounts.filter(
    (a) =>
      !a.is_archived &&
      !a.is_hidden &&
      a.include_in_totals &&
      (lanCuoi.get(a.id) ?? '') < cutoff,
  )
  if (cu.length === 0) return []

  return [
    {
      key: 'data-reconcile:all',
      kind: 'action',
      type: 'data-reconcile',
      severity: 'low',
      title:
        cu.length === 1
          ? `${cu[0].name} chưa đối chiếu quá ${RECONCILE_STALE_DAYS} ngày`
          : `${cu.length} tài khoản chưa đối chiếu quá ${RECONCILE_STALE_DAYS} ngày`,
      detail: 'Số dư trên màn có thể đã lệch số thật.',
      to: '/assets',
    },
  ]
}

/** Cả hai luật của nhóm này. */
export function dataRules(input: NotificationInput): AppNotification[] {
  return [...uncategorizedRule(input), ...reconcileStaleRule(input)]
}
