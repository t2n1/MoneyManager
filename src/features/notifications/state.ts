// Vòng đời trạng thái thông báo (mục E của spec) — THUẦN, test được.
import { NOTIFICATION_META, type AppNotification, type NotificationType } from './types'

/** Phần đầu của mã chính là `type`. Mã lạ → null (không xóa nhầm). */
function typeOf(key: string): NotificationType | null {
  const head = key.split(':')[0] as NotificationType
  return head in NOTIFICATION_META ? head : null
}

/**
 * Mã việc-cần-làm đã lưu trạng thái nhưng lượt tính này KHÔNG sinh ra nữa → việc
 * đã xong, xóa trạng thái đi. Nhờ vậy nếu tình huống tái diễn thì nó lại đỏ như
 * mới, chứ không bị coi là "đã đọc từ đời nào".
 *
 * Trạng thái của tin-để-biết KHÔNG bao giờ bị xóa theo cách này — đã tắt gợi ý
 * nào thì phải tắt vĩnh viễn.
 */
export function splitStaleActionKeys(storedKeys: string[], liveKeys: string[]): string[] {
  const live = new Set(liveKeys)
  return storedKeys.filter((key) => {
    if (live.has(key)) return false
    const type = typeOf(key)
    return type !== null && NOTIFICATION_META[type].kind === 'action'
  })
}

/**
 * Tin-để-biết còn được hiện: đã tắt → mất hẳn; đã đọc từ lượt TRƯỚC → cũng thôi.
 * Tách khỏi useNotifications để test được cả vòng đời (mục I của spec).
 */
export function visibleInfos(
  infos: AppNotification[],
  readKeys: Set<string>,
  dismissedKeys: Set<string>,
): AppNotification[] {
  return infos.filter((n) => !dismissedKeys.has(n.key) && !readKeys.has(n.key))
}

/**
 * Việc-cần-làm còn được hiện: đã ẩn thì thôi. KHÔNG lọc theo đã đọc — đọc một việc
 * không làm nó xong.
 *
 * Vì sao "ẩn" mà không phải "xoá vĩnh viễn": `splitStaleActionKeys` ở trên xoá trạng
 * thái của mọi việc-cần-làm mà lượt tính này KHÔNG sinh ra nữa. Nên vòng đời tự khép:
 * ẩn "3 giao dịch chưa gắn danh mục" → gắn xong → luật thôi sinh việc đó → trạng thái
 * bị dọn → lần sau dồn lại 3 khoản mới thì nó đỏ như mới. Đúng thứ R5 đòi mà không cần
 * thêm cột "ẩn tới ngày nào": hạn của việc này là CHÍNH TÌNH HUỐNG SINH RA NÓ.
 */
export function visibleActions(
  actions: AppNotification[],
  dismissedKeys: Set<string>,
): AppNotification[] {
  return actions.filter((n) => !dismissedKeys.has(n.key))
}

/**
 * Hai danh sách tin-để-biết mà tấm trượt cần: bản ĐẦY ĐỦ (đã lọc) và phần THU GỌN
 * (đoạn đầu của bản đầy đủ).
 *
 * Hàm này tồn tại để cố định THỨ TỰ hai phép: **lọc trước, cắt trần sau**. Làm ngược
 * lại — bộ luật cắt sẵn `limit` tin rồi mới lọc đã đọc/đã tắt trong đúng đoạn đó — là
 * lỗi I4-R: 4 tin trong kỳ, đọc (hay bấm ✕) 3 tin đầu là phần thu gọn RỖNG trong khi
 * tin thứ 4 chưa ai xem; tấm trượt không in tiêu đề "Tin để biết" khi phần thu gọn
 * rỗng, nên cả khu còn trơ một cái nút xám "Xem thêm 1 tin để biết". `limit` là trần
 * của phần ĐANG HIỆN, không phải trần của số tin CÓ ĐỂ HIỆN.
 */
export function visibleInfoLists(
  infosAll: AppNotification[],
  readKeys: Set<string>,
  dismissedKeys: Set<string>,
  limit: number,
): { infosAll: AppNotification[]; infos: AppNotification[] } {
  const all = visibleInfos(infosAll, readKeys, dismissedKeys)
  return { infosAll: all, infos: all.slice(0, limit) }
}

/** Con số đỏ trên chuông = việc-cần-làm CHƯA đọc (mục D.1). */
export function unreadActionCount(actions: AppNotification[], readKeys: Set<string>): number {
  return actions.filter((n) => !readKeys.has(n.key)).length
}

/**
 * Một cờ cho MỖI nguồn dữ liệu mà `buildNotifications` đọc (xem `NotificationInput`).
 * Bốn đầu vào còn lại của bộ luật không có cờ vì không phải dữ liệu tải về:
 * `todayISO` (đồng hồ), `formatMoney` (import cấp module), và `monthStartDay` / `base`
 * / `offTypes` đều lấy từ chính `profile` nên đã nằm trong `profileLoaded`.
 */
export interface NotificationInputsReady {
  /** Có profile chưa — kéo theo cả monthStartDay, base và danh sách loại đã tắt. */
  profileLoaded: boolean
  /**
   * Tỷ giá ĐÃ VỀ chưa. Đây là cờ bị bỏ sót ở lượt sửa trước và là nguyên nhân lỗi
   * C1 sống sót: nó gọi mạng thật nên gần như luôn về sau cùng.
   */
  ratesOk: boolean
  accountRowsOk: boolean
  balancesOk: boolean
  categoriesOk: boolean
  debtsOk: boolean
  recurringRulesOk: boolean
  /**
   * Báo cáo ngân sách đã tính từ ĐỦ nguồn (`useBudgetReport().isComplete`), không
   * phải chỉ `report !== undefined` — báo cáo tạm bỏ âm thầm giao dịch chưa có tỷ
   * giá khỏi `spent` và thiếu phần hạn mức dồn từ tháng trước.
   */
  budgetReportComplete: boolean
  savingsGoalsOk: boolean
  networthSnapshotsOk: boolean
  /** Giao dịch 90 ngày gần nhất — `input.recentTxs`. */
  recentTxsOk: boolean
  /**
   * Kịch bản / chặng / sự kiện Lifetime đã về chưa — `input.lifetime`. Cần cờ RIÊNG dù
   * `lifetime` được phép là undefined một cách hợp lệ (chưa có kịch bản, chưa khai năm
   * sinh): lúc CHƯA TẢI XONG nó cũng là undefined, luật im, và mã
   * 'lifetime-drift:current' khuyết khỏi `allKeys` — đúng hình dạng lỗi C1, dọn dẹp sẽ
   * xóa oan dòng đã-đọc của nó.
   */
  lifetimeOk: boolean
  /**
   * Bốn bộ kiểm Quyền lợi (`input.benefits`) đã ngã ngũ chưa — thành công HOẶC lỗi hẳn,
   * cùng lý lẽ với `lifetimeOk`: một lỗi vĩnh viễn ở Quyền lợi không được phép làm đông
   * cứng việc dọn dấu-đã-đọc của 17 loại thông báo còn lại.
   */
  benefitsOk: boolean
  /** Bảng trạng thái đã đọc/đã tắt: không có nó thì không biết đang dọn cái gì. */
  notificationStateOk: boolean
}

/** Đúng hai cờ của một query TanStack mà quyết định dưới đây cần đọc. */
export interface QueryOutcome {
  isSuccess: boolean
  isError: boolean
}

/**
 * Ba query Lifetime ĐÃ NGÃ NGŨ chưa — dùng cho cờ `lifetimeOk` ở trên.
 *
 * "Ngã ngũ" = thành công HOẶC lỗi hẳn. Cờ ấy phải nghĩa là "ta đã BIẾT câu trả lời",
 * KHÔNG phải "câu trả lời là có". Đòi `isSuccess` thì một lỗi vĩnh viễn ở ba bảng
 * Lifetime (RLS cấu hình sai, mạng đứt, bảng chưa tồn tại ở một môi trường nào đó) làm
 * `notificationInputsReady` false MÃI MÃI → `planNotificationCleanup` trả null mãi mãi
 * → việc dọn dấu-đã-đọc DỪNG cho CẢ 13 loại thông báo, chỉ vì một tính năng mới. Lúc
 * đó một việc-cần-làm đã xong vẫn giữ dòng đã-đọc, nên khi nó tái diễn thì hiện ra như
 * đã đọc và không có chấm đỏ.
 *
 * Lỗi hẳn thì `input.lifetime` vẫn là undefined và luật Lifetime im — đúng hướng sai
 * an toàn: tính năng mới không được quyền làm đông cứng vòng đời của những loại có
 * trước nó. Còn ĐANG TẢI thì vẫn phải chờ, vì undefined-vì-đang-tải không phân biệt
 * được với undefined-vì-chưa-có-kịch-bản.
 */
export function lifetimeQueriesSettled(queries: QueryOutcome[]): boolean {
  return queries.every((q) => q.isSuccess || q.isError)
}

/**
 * Đủ dữ liệu để DỌN trạng thái chưa? Thiếu DÙ MỘT nguồn cũng là false — `allKeys`
 * lúc đó khuyết mã của nguồn chưa về, mà dọn dẹp XÓA theo "không thấy trong allKeys
 * thì coi như xong". Hướng sai an toàn là false (dòng cũ nằm lại tới lượt prune).
 */
export function notificationInputsReady(r: NotificationInputsReady): boolean {
  return (
    r.profileLoaded &&
    r.ratesOk &&
    r.accountRowsOk &&
    r.balancesOk &&
    r.categoriesOk &&
    r.debtsOk &&
    r.recurringRulesOk &&
    r.budgetReportComplete &&
    r.savingsGoalsOk &&
    r.networthSnapshotsOk &&
    r.recentTxsOk &&
    r.lifetimeOk &&
    r.benefitsOk &&
    r.notificationStateOk
  )
}

export interface CleanupInput {
  /** Đã dọn trong lần mở app này rồi (chốt cấp module ở AppLayout). */
  alreadyDone: boolean
  /**
   * MỌI nguồn dữ liệu mà bộ luật đọc đã tải xong. Thiếu DÙ MỘT nguồn cũng phải là
   * false: `allKeys` lúc đó khuyết mã của nguồn chưa về, mà dọn dẹp lại XÓA theo
   * "không thấy trong allKeys thì coi như xong" — nên chưa đủ dữ liệu là xóa oan.
   */
  inputsReady: boolean
  /** Bộ luật vừa ném lỗi lượt này → allKeys rỗng vì lỗi, không phải vì đã xong. */
  engineFailed: boolean
  /** Mã đang có dòng trạng thái trong DB. */
  storedKeys: string[]
  /** MỌI mã bộ luật sinh ra lượt này (kể cả tin bị cắt trần). */
  allKeys: string[]
}

/** Việc cần làm của một lượt dọn. `null` = LƯỢT NÀY ĐỪNG DỌN. */
export interface CleanupPlan {
  /** Mã việc-cần-làm cần xóa vì tình huống đã xong. */
  staleKeys: string[]
}

/**
 * Quyết định lượt dọn — THUẦN, để phần dễ sai nhất của mục E test được mà không
 * cần dựng component.
 *
 * Trả `null` khi chưa đủ điều kiện, và AppLayout chỉ được chốt "đã dọn" khi hàm
 * này trả về khác null. Hướng an toàn là KHÔNG DỌN: dòng cũ nằm lại thì tối đa
 * 12 tháng sau bị prune, còn xóa oan là mất vĩnh viễn trạng thái đã đọc — người
 * dùng thấy thông báo đã đọc đỏ lại như mới mỗi lần mở app.
 */
export function planNotificationCleanup(input: CleanupInput): CleanupPlan | null {
  if (input.alreadyDone) return null
  if (!input.inputsReady) return null
  if (input.engineFailed) return null
  return { staleKeys: splitStaleActionKeys(input.storedKeys, input.allKeys) }
}
