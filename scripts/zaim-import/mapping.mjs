// Bảng nối Zaim -> app, đã chốt với người dùng 2026-07-31.
// Xem docs/superpowers/specs/2026-07-31-zaim-import-design.md (mục 5.1 và 6.1).

/** Ví Zaim -> TÊN tài khoản trong app. Ví không có ở đây -> DEFAULT_ACCOUNT_NAME. */
export const WALLET_TO_ACCOUNT_NAME = {
  '楽天カード (Master)': 'Credit Rakuten',
  '楽天カード(Visa)': 'Credit Rakuten',
  楽天市場: 'Credit Rakuten',
  'Amazon.co.jp': 'Credit Rakuten',
  'Paypay 後払い': 'Credit Paypay',
  Paypay: 'Paypay Wallet',
  モバイルSuica: 'Paypay Wallet',
  Suica: 'Paypay Wallet',
  お財布: 'Ví',
  'LINE Pay': 'Ví',
  '楽天 Edy': 'Ví',
  ゆうちょ銀行: 'Yucho Bank',
  楽天銀行: 'Rakuten Bank',
  Paypay銀行: 'Paypay Bank',
  エポスカード: 'Credit EPOS',
}

/** Ví '-' và mọi ví lẻ (SMBC, Vãng lai, Kome/tên người…) đổ vào đây. */
export const DEFAULT_ACCOUNT_NAME = 'Paypay Wallet'

/** Danh mục mới cần tạo (chưa có trong app). */
export const NEW_CATEGORIES = [
  { path: 'Thời trang>Cắt tóc', icon: '💇' },
]

// Bản đồ danh mục: main -> { _default, [sub]: path|'SKIP' }.
// 'SKIP' = không nhập. Path 'Cha>Con' hoặc 'Cha' (gán thẳng nhóm cha).
const EXPENSE = {
  食費: { _default: 'Ăn uống', 食料品: 'Ăn uống>Đi chợ', 晩ご飯: 'Ăn uống>Bữa tối', 昼ご飯: 'Ăn uống>Bữa trưa', 朝ご飯: 'Ăn uống>Bữa sáng', カフェ: 'Ăn uống>Cafe' },
  交通: { _default: 'Đi lại', 会社交通費: 'SKIP', 電車: 'Đi lại>Tàu điện', 自転車: 'Đi lại', タクシー: 'Đi lại>Taxi', バス: 'Đi lại>Xe buýt' },
  // 使途不明金 = Zaim tự sinh để cân số dư (お店/メモ trống, số lớn từ KOME/お財布), không
  // phải chi tiêu -> SKIP như 現金の引出. Người dùng chỉnh số dư tay nên dòng cân sổ này bỏ được.
  その他: { _default: 'Khác', 電子マネーにチャージ: 'SKIP', カードの引落: 'SKIP', 海外送金: 'SKIP', 立替金: 'SKIP', 現金の引出: 'SKIP', 使途不明金: 'SKIP' },
  交際費: { _default: 'Giao lưu', Gift: 'Quà tặng>Quà', Meetup: 'Giao lưu>Bạn bè' },
  日用雑貨: { _default: 'Khác', 'Household Supplies': 'Nhà ở>Đồ bếp' },
  エンタメ: { _default: 'Sở thích', Plant: 'Sở thích>Cây cối', 'Film Photography': 'Sở thích>Nhiếp ảnh', 書籍: 'Giáo dục>Sách vở', Sports: 'Sở thích>Thể thao', '映画・動画': 'Sở thích>Subscription', 音楽: 'Sở thích>Subscription', Watches: 'Thời trang>Phụ kiện', 'Đồ': 'Khác' },
  大型出費: { _default: 'Khác', 旅行: 'Du lịch', 家電: 'Nhà ở>Nội thất', 住宅: 'Nhà ở' },
  '美容・衣服': { _default: 'Thời trang', 洋服: 'Thời trang>Quần áo', 'アクセサリー・小物': 'Thời trang>Phụ kiện', コスメ: 'Thời trang>Mỹ phẩm', 美容院: 'Thời trang>Cắt tóc', 'ジム・健康': 'Sức khỏe>Gym', クリーニング: 'Thời trang>Giặt là' },
  住まい: { _default: 'Nhà ở', 家具: 'Nhà ở>Nội thất', 家賃: 'Nhà ở>Tiền nhà', 家電: 'Nhà ở>Nội thất' },
  クルマ: { _default: 'Đi lại>Ô tô', 高速料金: 'Đi lại>Ô tô', 'Rent-a-Car': 'Đi lại>Ô tô', 駐車場: 'Đi lại>Bãi đỗ xe' },
  '水道・光熱': { _default: 'Nhà ở', ガス料金: 'Nhà ở>Gas', 水道料金: 'Nhà ở>Nước', 電気料金: 'Nhà ở>Điện' },
  通信: { _default: 'Khác', インターネット関連費: 'Nhà ở>Điện thoại', 携帯電話料金: 'Nhà ở>Điện thoại' },
  証券: { _default: 'SKIP' },
  '医療・保険': { _default: 'Sức khỏe', 薬代: 'Sức khỏe>Thuốc', 病院代: 'Sức khỏe>Bệnh viện' },
  '教育・教養': { _default: 'Giáo dục', 'Tiền sách': 'Giáo dục>Sách vở', 'Học phí': 'Giáo dục>Học phí', 'Phí đăng ký thi': 'Giáo dục>Thi cử' },
  税金: { _default: 'Thuế & An sinh', 住民税: 'Thuế & An sinh>Thuế cư trú (住民税)' },
  '-': { _default: 'Khác' },
}

// Sổ chỉ để thấy CHI TIÊU THỰC TẾ (chốt với người dùng 2026-08): phần THU chỉ giữ
// Lương (給与所得) và Thưởng (賞与). Mọi loại thu còn lại — tiền chuyển vào (振込/送金),
// người khác trả lại/cho mượn, lì xì, nạp ví (チャージ), thu nhập kinh doanh — đều là
// tiền luân chuyển chứ không phải thu nhập, nên KHÔNG nhập ('SKIP').
const INCOME = {
  給与所得: { _default: 'Lương' },
  賞与: { _default: 'Thưởng' },
  その他: { _default: 'SKIP' },
  '-': { _default: 'SKIP' },
  事業所得: { _default: 'SKIP' },
  立替金返済: { _default: 'SKIP' },
  臨時収入: { _default: 'SKIP' },
}

/**
 * Zaim (type, main, sub) -> path danh mục app hoặc 'SKIP'.
 * main lạ -> 'Khác'; sub lạ -> _default của main.
 */
export function resolveCategoryPath(type, main, sub) {
  return explainCategoryPath(type, main, sub).path
}

/** Ghi chú mang dấu hiệu CHUYỂN TIỀN ra ngoài: gửi người (送金), chuyển khoản NH (振込,
 *  gồm cả 振込手数料), gửi qua Wise (ワイズ). */
const OUTGOING_TRANSFER_RE = /送金|振込|ワイズ/

/**
 * Dòng CHI thực chất là CHUYỂN TIỀN ra ngoài (không phải chi tiêu) hay không.
 *
 * Chỉ tính khi danh mục rơi vào catch-all 'Khác' — vì tiền nhà/học phí/điện nước dù
 * trả bằng 振込/送金 vẫn là chi thật và nằm ở danh mục riêng, KHÔNG được đụng. THU đã
 * lọc theo Lương/Thưởng nên không bao giờ ra 'Khác', mặc nhiên false.
 */
export function isOutgoingTransferExpense(type, main, sub, note) {
  if (type !== 'expense') return false
  if (resolveCategoryPath('expense', main, sub) !== 'Khác') return false
  return OUTGOING_TRANSFER_RE.test(note ?? '')
}

/**
 * Như `resolveCategoryPath` nhưng nói rõ path đó từ đâu ra — audit cần phân biệt
 * "đã chốt từng cặp" với "rơi vào mặc định vì bảng không có cặp này".
 * - `exact`         : bảng có đúng cặp (lớn>nhỏ) này.
 * - `group-default` : nhóm CỐ Ý chỉ có một đích cho mọi chi tiết (Lương, 証券…) — không phải đoán.
 * - `default`       : nhóm có khai riêng nhiều chi tiết nhưng THIẾU cặp này -> là phỏng đoán.
 * - `unknown-main`  : cả nhóm lớn cũng không có trong bảng.
 * @returns {{ path: string, source: 'exact'|'group-default'|'default'|'unknown-main' }}
 */
export function explainCategoryPath(type, main, sub) {
  const table = type === 'expense' ? EXPENSE : INCOME
  const group = table[main]
  if (!group) return { path: 'Khác', source: 'unknown-main' }
  if (Object.prototype.hasOwnProperty.call(group, sub)) return { path: group[sub], source: 'exact' }
  const onlyDefault = Object.keys(group).every((k) => k === '_default')
  return { path: group._default, source: onlyDefault ? 'group-default' : 'default' }
}
