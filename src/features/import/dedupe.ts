// Chống trùng khi nhập sao kê, chia BA MỨC thay vì một luật cứng.
//
// Luật cũ đòi khớp CẢ BA: đúng ngày + đúng số tiền + đúng từng ký tự ghi chú.
// Ghi chú trong file sao kê là tên quán tiếng Nhật (「串かつ　でんがな」), còn
// khoản người dùng tự gõ trong app ghi tiếng Việt ("Cơm ngoài") — nên luật đó
// chỉ bắt được đúng một trường hợp: nhập lại y nguyên cùng một file. Nó KHÔNG
// bắt được "khoản này tôi ghi tay rồi".
//
// Đo trên sổ thật (229 dòng chi PayPay, 13 tháng): 32 dòng trùng đúng ngày +
// đúng số — đó đã là TRẦN của luật cũ, thực tế còn thấp hơn vì còn phải khớp
// ghi chú. Thêm 6 dòng nữa trùng số tiền nhưng lệch 1–3 ngày, luật cũ bỏ sót
// sạch, nhập vào là nhân đôi khoản chi.
//
// VÌ SAO KHÔNG TỰ VỨT MỨC GIỮA: hai ly cà phê ¥480 hai ngày liền là chuyện có
// thật. Máy chỉ được quyền CHỈ RA, người quyết định. Đây cũng đúng cách trang
// này đang xử khoản chuyển tiền nội bộ — danh sách + ô tick, không tự ý bỏ.
import type { TransactionRow } from '../../types/database.types'
import type { ImportItem } from './csvImport'

export type DupLevel = 'exact' | 'likely' | 'cross'

export interface DupMatch {
  level: DupLevel
  /** Giao dịch đã có trong sổ bị nghi là cùng một khoản. */
  matchedTxId: string
  /** Ví đang chứa khoản đó. Khác `opts.accountId` ⇔ level là 'cross'. */
  matchedAccountId: string
  /** Lệch bao nhiêu ngày; luôn 0 với mức 'exact'. */
  dayGap: number
  /** Ghi chú của khoản đã có — để người dùng nhìn mà quyết. */
  matchedNote: string
}

export interface DupOptions {
  /** Tài khoản đang nhập vào; hai mức đầu chỉ đối chiếu trong phạm vi tài khoản này. */
  accountId: string
  /**
   * Các ví KHÁC được phép dò chéo (mức 'cross'), thường là ví cùng loại tiền.
   * Bỏ trống = không dò chéo, giữ đúng hành vi cũ.
   */
  crossAccountIds?: Set<string>
  /** Cửa sổ ngày cho mức 'likely'. Ngày quẹt thẻ và ngày ghi sổ hay lệch vài hôm. */
  windowDays?: number
}

const dayDiff = (a: string, b: string) =>
  Math.abs(Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000))

/**
 * Xếp mức trùng cho từng dòng sao kê. Trả mảng SONG SONG với `items` (cùng chỉ
 * số), không phải Map theo khóa — hai dòng giống hệt nhau trong cùng một file
 * là hợp lệ và phải được xét riêng.
 *
 * Mỗi giao dịch đã có chỉ khớp tối đa MỘT dòng, nên mua hai lần giống nhau mà sổ
 * mới ghi một lần thì dòng thứ hai vẫn hiện ra là mới.
 */
export function classifyDuplicates(
  items: ImportItem[],
  existing: TransactionRow[],
  opts: DupOptions,
): (DupMatch | null)[] {
  const windowDays = opts.windowDays ?? 3
  const pool = existing.filter(
    (t) => t.account_id === opts.accountId && (t.type === 'expense' || t.type === 'income'),
  )
  const used = new Set<string>()
  const out: (DupMatch | null)[] = items.map(() => null)
  const sameWay = (t: TransactionRow, it: ImportItem) => t.type === it.type

  // Lượt 1 — trùng chắc chắn. Phải quét HẾT mọi dòng trước khi sang lượt 2, nếu
  // không một dòng chỉ "nghi trùng" có thể chiếm mất giao dịch mà dòng khác khớp
  // chính xác, đẩy dòng khớp chính xác đó thành "mới".
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    const m = pool.find(
      (t) =>
        !used.has(t.id) &&
        t.occurred_on === it.occurred_on &&
        t.amount === it.amount &&
        sameWay(t, it) &&
        (t.note ?? '') === it.note,
    )
    if (!m) continue
    used.add(m.id)
    out[i] = {
      level: 'exact',
      matchedTxId: m.id,
      matchedAccountId: m.account_id,
      dayGap: 0,
      matchedNote: m.note ?? '',
    }
  }

  // Lượt 2 — nghi trùng: cùng số tiền, cùng chiều, lệch trong cửa sổ ngày, ghi
  // chú khác. Ưu tiên khoản lệch ít ngày nhất.
  for (let i = 0; i < items.length; i++) {
    if (out[i]) continue
    const it = items[i]
    let best: { tx: TransactionRow; gap: number } | null = null
    for (const t of pool) {
      if (used.has(t.id)) continue
      if (t.amount !== it.amount || !sameWay(t, it)) continue
      const gap = dayDiff(it.occurred_on, t.occurred_on)
      if (gap > windowDays) continue
      if (!best || gap < best.gap) best = { tx: t, gap }
    }
    if (!best) continue
    used.add(best.tx.id)
    out[i] = {
      level: 'likely',
      matchedTxId: best.tx.id,
      matchedAccountId: best.tx.account_id,
      dayGap: best.gap,
      matchedNote: best.tx.note ?? '',
    }
  }

  // Lượt 3 — ghi nhầm ví: khoản có thật trong sổ nhưng nằm ở ví khác (quẹt thẻ mà
  // ghi vào Tiền mặt). Luật cũ chỉ soi đúng một ví nên bỏ sót sạch, nhập vào là
  // nhân đôi.
  //
  // PHẢI CHẠY SAU CÙNG, không được trộn vào hai lượt trên. Pool của lượt này là các
  // ví KHÁC, nhưng nếu gộp chung vòng lặp thì một dòng đứng trước có thể ôm mất giao
  // dịch mà dòng sau khớp chính xác trong ĐÚNG ví — đúng cái bẫy lượt 1 đã né.
  //
  // CÙNG CHIỀU, VÀ KHÔNG NHẬN 'transfer'. Khoản NGƯỢC chiều ở ví khác là việc của
  // `detectInternalTransfers` (trả thẻ, nạp ví). Hai hàm cùng quét các ví khác nên
  // ranh giới này phải cứng, nếu không chúng giành nhau một giao dịch và người dùng
  // thấy cùng một dòng hiện ở hai cảnh báo khác nhau.
  const crossIds = opts.crossAccountIds
  if (crossIds && crossIds.size > 0) {
    const crossPool = existing.filter(
      (t) =>
        t.account_id !== opts.accountId &&
        crossIds.has(t.account_id) &&
        (t.type === 'expense' || t.type === 'income'),
    )
    for (let i = 0; i < items.length; i++) {
      if (out[i]) continue
      const it = items[i]
      let best: { tx: TransactionRow; gap: number } | null = null
      for (const t of crossPool) {
        if (used.has(t.id)) continue
        if (t.amount !== it.amount || !sameWay(t, it)) continue
        const gap = dayDiff(it.occurred_on, t.occurred_on)
        if (gap > windowDays) continue
        if (!best || gap < best.gap) best = { tx: t, gap }
      }
      if (!best) continue
      used.add(best.tx.id)
      out[i] = {
        level: 'cross',
        matchedTxId: best.tx.id,
        matchedAccountId: best.tx.account_id,
        dayGap: best.gap,
        matchedNote: best.tx.note ?? '',
      }
    }
  }
  return out
}

/**
 * Ghi chú sau khi gộp một dòng sao kê vào khoản đã có trong sổ.
 *
 * `note` là trường chữ tự do DUY NHẤT của bảng giao dịch — không có cột riêng cho tên
 * quán — nên gộp ở đây là nối chuỗi, không phải điền thêm một ô.
 *
 * GIỮ CHỮ NGƯỜI DÙNG TRƯỚC, tên quán sau: cột ghi chú trong danh sách bị cắt khi dài,
 * mà phần người dùng tự viết mới là phần họ cần đọc để nhận ra khoản đó.
 *
 * CHỐNG NỐI HAI LẦN. Nhập lại cùng một file sao kê là chuyện xảy ra thật (tải lại từ
 * ngân hàng, gộp nhiều kỳ). Nếu không kiểm, ghi chú dài thêm mỗi lượt nhập:
 * "Cơm ngoài · でんがな · でんがな". Kiểm bằng phép chứa chuỗi chứ không so từng đoạn
 * cắt bởi dấu ·, để bắt luôn trường hợp người dùng đã tự gõ tên quán giữa câu.
 */
export function mergedNote(existingNote: string, statementNote: string): string {
  const cu = existingNote.trim()
  const moi = statementNote.trim()
  if (moi === '') return cu
  if (cu === '') return moi
  if (cu.includes(moi)) return cu
  return `${cu} · ${moi}`
}

/**
 * Gộp nhiều file sao kê thành một danh sách.
 *
 * Sao kê tháng sau LẶP LẠI vài dòng cuối của tháng trước (đo được 6 dòng trên 13
 * file PayPay). Cộng thẳng là nhân đôi từng ấy khoản; khử sạch theo khóa lại làm
 * mất khoản mua hai lần giống hệt nhau trong cùng một tháng. Cách đúng: mỗi khóa
 * lấy số lần xuất hiện NHIỀU NHẤT trong MỘT file — cùng quy ước đã dùng khi đối
 * chiếu sao kê Rakuten bằng tay.
 */
export function mergeStatementFiles(perFile: ImportItem[][]): ImportItem[] {
  const most = new Map<string, { n: number; item: ImportItem }>()
  for (const file of perFile) {
    const inFile = new Map<string, { n: number; item: ImportItem }>()
    for (const it of file) {
      inFile.set(it.key, { n: (inFile.get(it.key)?.n ?? 0) + 1, item: it })
    }
    for (const [k, v] of inFile) {
      const cur = most.get(k)
      if (!cur || v.n > cur.n) most.set(k, v)
    }
  }
  const out: ImportItem[] = []
  for (const { n, item } of most.values()) for (let i = 0; i < n; i++) out.push(item)
  // Xếp theo ngày để bảng xem trước đọc được; cùng ngày thì giữ nguyên thứ tự gặp.
  return out.sort((a, b) => (a.occurred_on < b.occurred_on ? -1 : a.occurred_on > b.occurred_on ? 1 : 0))
}
